# Backend internationalisation — inventory and design

Companion to `docs/i18n.md` (the contract). This file says **how the backend** (`backend/cadencia`)
gets there. Nothing here is implemented yet; section 5 splits the work into briefs.

Contract recap (from `docs/i18n.md`): `en-US` is the default; `pt-BR` and `de-DE` are supported. The
request language comes from `Accept-Language` — **the web client now sends it on every API call with
exactly one of `en-US` / `pt-BR` / `de-DE`** (`web/src/api/client.ts:42`, `currentLocale()`).
Unsupported or missing → `en-US`. Anything produced outside a request (scheduler, CLI) uses
`CADENCIA_LOCALE` (default `en-US`). **The generated deck is not translated**: it keeps exactly
today's pt-BR text. Jira data, URLs, route paths, JSON keys and CLI JSON keys are never translated.

## 0. Baseline and the rules in one screen

**Baseline (2026-10-13, before any change):**
`cd /workspace/backend && .venv/bin/pytest -q -p no:cacheprovider` → **394 passed, 1 warning**
(Starlette's `anyio.abc.BlockingPortal` DeprecationWarning), exit 0. pytest reported 113.31 s, but the
wall clock is unreliable in this devcontainer; `/proc/uptime` advanced **116.0 s**
(54539.35 → 54655.33). `tests/test_golden.py` alone: 4 passed (~4 s).

Installed versions that matter: FastAPI 0.141.1, Starlette 1.6.0, anyio 4.15.1, pydantic 2.13.5,
APScheduler 3.11.3 (`BlockingScheduler`, jobs run in a thread pool).

**The eight rules every task follows** (details in section 2):

- **R1 — Pure code never renders.** `domain/` and `report/core/` build `Msg(key, **params)` values
  (and raise `Invalid(Msg)` / `NotFound(subject, Msg)`). They import only `cadencia.i18n.message`.
  Their `as_dict()` methods emit `msg.to_json()`, never text.
- **R2 — Text is rendered at the boundary, in the ambient locale.** Analytics view builders,
  `report/service.py`, routes, `notify.py` and the CLI call `tr(key, **params)` for their own text and
  `render(msg)` / `localize(view)` for what the domain produced. "Ambient" is the request's locale
  inside a request, `CADENCIA_LOCALE` elsewhere, `pt-BR` while the deck's data is being built.
- **R3 — Caches hold `Msg`, never rendered text** (`BoardData` and its memo are shared by requests in
  different languages).
- **R4 — Persisted text is stored as `{"$msg": key, "params": {...}}`**, plus a pt-BR mirror in the
  field that already exists (so old readers, rollbacks and ad-hoc SQL still work). Readers prefer the
  `$msg` and fall back to the stored text for rows written before this change.
- **R5 — The deck stays pt-BR**: `JiraSource.deck_data` runs under `using_locale(DECK_LOCALE)`;
  deck-only literals stay hard-coded pt-BR and are *not* catalogue entries; dual-use text goes
  through the catalogue and comes out pt-BR because of that wrapper. `make golden` must not change,
  and the golden tests run under `en-US` and `de-DE` to prove it.
- **R6 — Exceptions carry `Msg`**; the API's handlers render them in the request locale; `str(exc)`
  renders in the ambient locale (CLI, scheduler, logs).
- **R7 — No module-level rendered text.** Constants hold keys (`EVENT_LABELS`, `_LABEL`, `A11Y_WORDS`,
  `RULES`, `LABELS`, `SENIORITIES`… become key maps rendered at use time).
- **R8 — pt-BR entries are verbatim copies of today's strings** in this round (same words, same
  `:g`/comma formatting, same `(s)` plurals). That keeps the deck identical and turns the existing pt-BR
  test assertions into a regression check for the conversion. Copy improvements to pt-BR are a
  separate, later change.

---

## 1. Inventory

Counts are de-duplicated message templates found by an AST scan of string literals and f-strings
(docstrings and `log.*` calls excluded; scanner in Appendix A). They are approximate (±10 %): the
heuristic misses some unaccented short strings and counts some identifiers.

Total ≈ **850 templates**, of which ≈ **150 are out of scope** (demo Jira data, demo seed values,
sample template content, Jira-name matchers, regexes, operator-only errors) and ≈ **60 are deck-only
literals** that stay. ≈ **640 keys** need catalogue entries (≈ 116 of them field-catalogue labels).

Routing classes:
**(a)** built/raised inside an API request · **(b)** computed in pure `domain/` or `report/core/`,
possibly cached across requests · **(c)** persisted, shown later · **(d)** sent outside a request
(notifications, scheduler) · **(e)** CLI output · **(f)** deck content — must stay unchanged.

### 1.1 Dual-use strings (need splitting or a fixed deck locale)

These serve two or more classes at once; they are the delicate part.

| # | Text | Producer | Reaches the person via |
|---|---|---|---|
| D1 | Risk evidence message (`"parado há 10 dias em Code Review"`, `"data limite 08/09 vencida há 3 dias"`, `"aguardando CAD-11"`, carried/aging messages, stalled `details`) | `domain/risk.py` `assess()` (~14 templates) | (b) API via `analytics/serialize.evidence_dict`; (c) stored in `issue_snapshot.evidence`; (f) deck: `analytics/deck.py` `message(h)` → `riscos.por_epico`, `bloqueios.por_epico`, `riscos.por_situacao`, `acao` column of every item row; (d) digest `reason`; CSV/JSON export (`api/routes_export.py:110`); `analytics/person_detail.py:89` |
| D2 | Situation labels (`LABELS`: Em dia, Envelhecendo, Estagnado, Bloqueado, Atrasado, Arrastado) | `domain/risk.py:47` (`Situation.label`) | (b) API `label` fields; (c) snapshot `label`; (f) deck `riscos.por_situacao` group titles, `grafico.riscos` categories (`analytics/deck.py:457`), `mudancas.*` `de`/`para` (`deck.py:650`); (d) digest lines (`analytics/changes.py:29` `_LABEL`, module-level — R7) |
| D3 | Rule descriptions (`RULES`, 5) | `domain/risk.py:55` (`Evidence.description`) | (b) API `rule_description`; (c) snapshot `rule_description` |
| D4 | Change `reason` | `analytics/changes._entry` reads the **stored** first evidence `message` | API `/changes`; (f) deck `mudancas.*.motivo`; (d) digest text |
| D5 | Health check `title`/`action` (8 checks, 16 strings) | `analytics/health.py` | (a) API insights; (f) deck `saude.problemas` rows `problema`/`acao` (`analytics/deck.py:700`) |
| D6 | Epic-plan duration label `"Planejamento N d + Execução M d = Total T dias úteis"` and strategy names (`"List Scheduling (heurística gulosa)"`…) | `domain/epic_plan/timeline.py:34` (`Duration.label`), `planner/strategies.py:58+` | (a/b) plan page `rotulo`, `algoritmo_nome`; (f) deck `plano.duracao`, `plano.epicos.algoritmo` (via `analytics/epic_plan.deck_summary`, which reads the very `plan_view` the page uses) |
| D7 | Field catalogue labels (`FIELDS`, 116 labels, 13 group names, variable hints) | `report/core/context.py:180+`, `fixed_text_spec` hint | (a) field picker / variable manager (`service.field_catalog`, `GET /reports/fields`); (f) chart alt text in the .pptx (`report/core/generate.chart_description` uses `spec.label`; pinned by `tests/test_deck_library.py:111`) |
| D8 | CFD fallback column names `"A fazer"/"Em andamento"/"Concluído"` (board without columns) | `domain/metrics.cumulative_flow:224` | (a) flow chart; (f) deck `grafico.cfd` series names (pinned by `tests/test_deck_extras.py:63`) |
| D9 | Validation `message`s produced *during* generation | `report/core/generate.py`, `validate.py`, `package_check.py`, `a11y.py`, `edits.py`, `report/service.py` | (c) stored in `report_run.validation`; (a) run panels; (e) `cadencia deck`, `cadencia check-deck` — never in the deck itself, but produced inside the deck pipeline |

Resolution in short: D1–D6 and D8 become catalogue keys rendered in the ambient locale; the deck
path is pinned to pt-BR (R5). D7 is split: `FIELDS` stays the deck-facing pt-BR copy (alt text), the
UI gets translated labels overlaid at the API boundary. D9 becomes `Msg` + pt-BR mirror (R4).

### 1.2 (a) Built or raised inside an API request

| Area | Files | ≈ templates | Notes |
|---|---|---|---|
| HTTP error details `{"cause","message","action"}` | `api/routes_reports.py` (34), `api/routes_deck.py` (22), `api/deps.py` (11), `api/routes_setup.py` (10), `api/routes_epic_plan.py` (6), `api/routes_export.py` (5), `api/routes_notify.py` (4), `api/routes_people.py` (3), `api/routes_focus_log.py` (3), `api/routes_home.py` (2), `api/routes_insights.py` (2), `api/routes_views.py` (2 incl. `"Sem espaço"`) | ≈ 105 | ~71 `HTTPException`/`deps.not_found` sites |
| Global handlers | `api/app.py:64–98` (`"não encontrado"`, `"requisição inválida"`, `"erro interno"` + action), `api/security.py:58` (401 cause/message/action) | 7 | The 500 handler runs in `ServerErrorMiddleware`, **outside** user middleware — see 2.5 |
| `Invalid`/`NotFound` raised below the routes | `store/repo.py` (30), `report/service.py` (≈ 35 of its 50), `report/library.py` (8), `analytics/epic_plan.py` (6), `report/qanda.py` (3), `report/narrative.py` (8), `analytics/{sprint,changes,forecast,data}.py` (6), `focus_log/model.py` (3), `notify.py` (`Channel.check`, 2), `planner/strategies.py` (1) | ≈ 100 | Default message of `NotFound` is `f"{subject} não encontrado."` (`cadencia/errors.py:20`) |
| Request-time UI text in view builders | `analytics/health.py` (16 → D5), `analytics/flow.py` (disclaimer, `"Sem responsável"`), `analytics/dashboard.py` (2), `analytics/forecast.py` (note), `analytics/epic_plan.py` (`"sem subtarefas"`, `"atribuído a …"`), `report/library.py` diagnostics/usage (7), `report/service.py` (`variable_conflicts`, `A11Y_WORDS`), `notify.EVENT_LABELS` served by `GET /notify` | ≈ 45 | |
| Jira errors (`cause`/`action` class attributes + `message`) | `jira/errors.py` (18), `jira/client.py` (14) | 32 | Also (c) via collector, (e) via `test-connection`; `message` embeds Jira's own response body (param, never translated) |
| Epic-plan seniority labels | `domain/epic_plan/model.py:12` `SENIORITIES` (`senioridade_rotulo`), `HOURS_SOURCES` | 5 | R7 |

### 1.3 (b) Computed in pure `domain/` or `report/core/` (possibly cached)

| Producer | ≈ | Consumers | Cached? |
|---|---|---|---|
| `domain/risk.py` — evidence messages/details, `LABELS`, `RULES` | 19 | D1–D3 | `BoardData._memo` caches `RiskContext` only; assessments are recomputed per call — but rule R3 still applies |
| `domain/calendar.py` — `SprintTimeline.warnings` | 6 | `analytics/sprint.py:114`, `analytics/dashboard.py:106`, `api/routes_views.py:55` | no |
| `domain/hierarchy.py` — `NO_EPIC_LABEL` "Sem épico", `"{key} (fora do escopo coletado)"`, `Progress.coverage_warning` | 3 | `analytics/serialize.node_dict`, `analytics/sprint.py:255` (own node dicts), `Progress.as_dict()` | no |
| `domain/metrics.py` — CFD fallback names | 3 | D8 | no |
| `domain/allocation.py` — `DISCLAIMER`, warnings | 3 | `analytics/planning.plan_view`; warnings **persisted** (1.4) | no |
| `domain/forecast.py` — notes | 2 | `analytics/forecast.py` | no |
| `domain/commitment.py:106` — `"Sem responsável"` owner name | 1 | commitment views (the deck has its own `NO_OWNER` literal) | memo `("people", now)` stores numbers only |
| `domain/models.py` — `BoardProfile` settings validation (`Invalid("key: problem; …")`) | 7 | `PUT` board settings → 400 | no |
| `domain/epic_plan/from_jira.py` — `Problem`s (`sem_papel` with nested per-subtask *reasons* `"X não está na equipe"`, `"X cobre N papéis"`, …), `_listing(" e mais N")` | 14 | `analytics/epic_plan.plan_view` (`problemas`, `diagnostico`) | no |
| `domain/epic_plan/schedule.py` — `validate()` errors (`list[str]`), cycle/coverage `Invalid`s | 14 | plan generation (`invalido`), `POST /api/planejamento` | no |
| `domain/epic_plan/hours.py` — reconciliation problems; `fmt_hours` (always comma), `hours_label` `"19h · 3d 1h"` | 3 (+ formatting) | plan page `rotulo_horas`, timeline segments `rotulo` | no |
| `domain/epic_plan/timeline.py` — `Duration.label` | 1 | D6 | no |
| `domain/epic_plan/model.py` — `Parameters.validated()` errors | 4 | 400 | no |
| `planner/strategies.py` names/descriptions, `planner/solvers.py` `SolverUnavailable` | 7 | plan page, 503 | registry is module-level (R7) |
| `report/core/generate.py` — `Problem`s (unknown field/marker/modifier, unregistered/unfilled variable incl. `"o relatório"` fallback, `sem_dados`, `truncado`, `vazio`, …) | 15 | D9 | no |
| `report/core/validate.py` — overflow, missing area, leftover marker, `modelo_alterado`, LibreOffice `reason` | 8 | D9 | no |
| `report/core/package_check.py` — OOXML auditor | 35 | D9; `cadencia check-deck` | no |
| `report/core/a11y.py` — findings | 3 | D9; `GET …/accessibility` | no |
| `report/core/edits.py` — lost-edit problems (`list[str]`) | 8 | `edicao_perdida` warnings (D9) | no |
| `report/core/resolve_preview.py` — preview `warnings` | 9 | `POST …/preview` | no |
| `report/core/suggest.py` — mapping suggestion `notes` | 2 | suggest endpoint, `cadencia mapping … suggest` | no |
| `report/core/context.py` — `FIELDS` labels, group names, variable hints | 124 | D7 | constants |

### 1.4 (c) Persisted, shown later

| Storage | What is stored today | Written by | Read by |
|---|---|---|---|
| `issue_snapshot.evidence` (JSON) | `evidence_dict()` output: `message`, `label`, `rule_description`, `details` in pt-BR | `collector/snapshots.record_checkpoints` (scheduler, CLI, API-triggered collection) | `analytics/changes.state_at_checkpoint` → `reason` (D4) |
| `report_run.validation` (JSON) | `errors[]`/`warnings[]` `{kind, message, …}` (generation, package check, overflow, `sem_mapeamento`, `edicao_perdida`, `acessibilidade_*`), `info[]` strings, `preview.reason`, `accessibility.findings[].message` | `report/service.generate_report` (API and scheduler) | `report/service.run_dict` (API, CLI), `download_blocker` (409 body), frontend `RunPanels`, `DeckPage`, `TemplatePanels` |
| `board_run.error` / `.cause` / `.action`; `board.last_error`; `collector_run.error` | rendered `JiraError.message/cause/action`, collector's own (`"Coleta cancelada a pedido."`, `"erro inesperado"`, `"nenhum board selecionado"`) | `collector/service._fail` → `repo.finish_board_run` | `api/routes_setup._run_dict`, `_board_dict`, `analytics/data.BoardData.last_error` (**cached** per board version) → `freshness()`, `analytics/dashboard.py:136` |
| `allocation_plan.result.warnings` | `list[str]` | `analytics/planning` (plan `as_dict()`) | `planning.plan_from_dict` → `plan_view` |
| `app_setting["notify.last"][*].error` | `str(exc)` (`"SMTP não configurado (CADENCIA_SMTP_HOST)"`, `"HTTP 404: …"`) | `notify.deliver` | `GET /notify` |
| `deck_version.label` for system versions | `"antes de restaurar a versão N"` (`report/service.py:512`), `"antes de restaurar o slide K"` (`report/library.py:238`) | restore actions | version list |
| `variable` rows made by `cadencia migrate-bindings --apply` | `"Convertida do campo X (RF-59)."` | `report/service.py:1372` | variable manager — user-editable data afterwards |
| `role` rows seeded once from `domain/epic_plan/seed.ROLE_SEED` (7 names + descriptions, pt-BR) | | `repo.ensure_role_seed` | user data afterwards |
| `focus_log_signal` rows seeded by migration 0021 | pt-BR names | migration | user data |
| `template.manifest` target `label`s (`"parágrafo N: …"`, `"célula r,c: …"`, `"forma"`, `"tabela inteira"`, `"gráfico nativo"`, `"área da imagem"`) | | `report/core/manifest.py` at upload | **not displayed by the web app** (no frontend reader) → leave as is |

### 1.5 (d) Sent outside a request

| What | Where | Today's text |
|---|---|---|
| Collection failure notification | `collector/scheduler._notify_failure` | `"Coleta com falha"`, `"Coleta parcial"`, `"A coleta agendada falhou."`, lines `"{board}: {cause} — {message}"` |
| Deck generated | `notify.deck_message` (scheduler `_deliver_deck`, **and** `api/routes_reports.py:736` from a request) | `"Apresentação gerada: {name}"`, approved/refused sentence, fields `Referência`/`Slides`/`Avisos` |
| Risk digest | `notify.send_digest` + `analytics/changes.digest_text` (scheduler, and `POST /notify/digest` from a request) | `"Riscos novos — {space}: {n}"`, `"{board}: nada novo desde {since}."`, `"… novo(s) risco(s), … resolvido(s) desde …"`, bullet lines with D2 labels and D4 reasons; `"o início"`, `"Sem espaço"` |
| Channel test | `api/routes_notify.py:55` (request) | `"Teste da Cadência"`, `"Se você está lendo isto…"` |
| Payload chrome | `notify.payload` | `"Abrir na Cadência"` (Slack/Teams) |
| Dates in messages | `notify.py:279`, `send_digest.since` | `%d/%m/%Y %H:%M UTC`, `%d/%m %H:%M` |

### 1.6 (e) CLI output

`cli.py`: ≈ 40 argparse `help=` strings + `description`, `"Sem espaço"` (`cli.py:103`); every command
prints service output as JSON (`_print`), so the values carry whatever the services render
(`run_dict` validation, package-check results, `audit_variables`, `migrate-*` reports, `summary`,
`test-connection` `JiraError.as_dict()`). JSON keys stay as they are.

### 1.7 (f) Deck content — stays byte-identical (not catalogue entries)

Mark each with `# deck text: pt-BR by design (docs/i18n.md)`; the leak scanner allowlists them.

- `analytics/deck.py`: `NO_EPIC`, `NO_OWNER`, `SPRINT_STATES`, alias `"Pessoa {tag}"`,
  `"Destaques da semana:"`, `"Data limite …"`, `"{n} item(ns) em aberto nesta sprint"`, chart
  categories/series/axis labels (`"Semana {n}"`, `"Entregues"`, `"Comprometido"`, `"Entregue"`,
  `"Escopo adicionado"`, `"Itens"`, `"Em aberto"`, `"Concluído"/"Em andamento"/"A fazer"`,
  `"Dias úteis"`, `"50/85/95% de chance"`, `"P85 histórico de cycle time"`, `"dias em andamento"`,
  `"Horas-pessoa"`, `"horas"`, `"jornada"`), `mudancas.*` group titles, `"desde {dd/mm HH:MM}"`.
- `report/core/context.py` `FIELDS[*].label` as used by `chart_description` (D7 split).
- `report/core/generate.py`: `CONTINUED = " (cont.)"`, `"Código QR: {text}"`, `chart_description`
  (`"Gráfico"`, `"{n} barras em {m} linhas"`).
- `report/core/mapping.py:39` `DEFAULT_STATUS_LABELS` (Concluído / Em dia / Em risco / Atrasado) — the
  configurable palette labels the deck prints; the UI shows them as the deck's words.
- `report/core/sample_template.py` (template content), `demo_seed.py` (demo deck values).
- `analytics/epic_plan.deck_summary` `state` (`"pronto"`, `"bloqueado: …"`, `"sem subtarefas"`) and
  lane names — deck-only.
- `report/narrative.py` prompt (asks for a pt-BR paragraph that becomes the deck variable
  `narrativa`): stays pt-BR. Its *errors* are (a).

### 1.8 Out of scope (leave as is)

- `demo.py` (fictional Jira data — Jira data is never translated).
- Jira-name matchers used to *read* Jira: `jira/fields.py` `STORY_POINT_NAMES`/`FLAGGED_NAMES`,
  `jira/mapping.py:25` `_BLOCKED_BY`; `report/core/suggest.py` regexes. (German Jira names are a
  separate, optional input-side change — see decision 10.)
- Log messages (`log.*`, `log_event`) — operator-facing; unchanged.
- Programmer/boot errors: `config.py:83`, `store/schema.py:33`, `store/repo.py:51`,
  `report/core/pptx_utils.py:461`, `report/core/manifest.py:48`, pydantic `ValueError`s in validators
  (`notify.Channel`, `DigestSchedule`, `report/core/mapping.py`) — they surface as 422 lists, which the
  client does not display (`api/client.ts:10` reads `detail.message ?? detail.cause`).
- OpenAPI metadata (`FastAPI(title, summary)`, router `tags=[…]`).
- Starlette/FastAPI built-in 404/405/422 texts (English already).

---

## 2. Mechanism

### 2.1 Package layout

```
backend/cadencia/i18n/
  __init__.py      # re-exports the public API below; must NOT import locales eagerly
  message.py       # Msg value type — imports nothing from cadencia (domain/report-core may import it)
  runtime.py       # SUPPORTED, DEFAULT_LOCALE, DECK_LOCALE, STORAGE_LOCALE, contextvar,
                   # current_locale(), using_locale(), configure_default_locale(), negotiate()
  render.py        # catalog(locale), render(), tr(), localize(), stored_text()
  fmt.py           # plural(), listing(), day_month(), day_month_year(), number(), hours()
  middleware.py    # LocaleMiddleware (pure ASGI)
  locales/
    __init__.py
    en_US/__init__.py, en_US/<namespace>.py   # source of truth for keys
    pt_BR/__init__.py, pt_BR/<namespace>.py
    de_DE/__init__.py, de_DE/<namespace>.py
backend/tools/i18n_scan.py                    # leak scanner (Appendix A)
```

Each namespace module exports `MESSAGES: dict[str, Entry]` with keys local to the namespace; the full
key is `"<module>.<local key>"` (e.g. `risk.evidence.stalled`). Namespaces are **discovered with
`pkgutil.iter_modules`**, so a task adds its own three files and never edits a shared registry.
Mirrors the frontend's `locales/<locale>/<namespace>.ts`; Python package names use `_`.

### 2.2 `Msg`

```python
# cadencia/i18n/message.py — pure value type
Param = str | int | float | bool | None | "Msg" | list["Param"]   # JSON-safe; dates as ISO strings

class Msg:
    __slots__ = ("key", "_params")
    def __init__(self, key: str, /, **params: Param) -> None: ...
    @property
    def params(self) -> dict[str, Param]: ...            # copy
    def to_json(self) -> dict[str, Any]:                 # {"$msg": key, "params": {...}}, nested Msgs too
    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> Msg: ...
    @staticmethod
    def is_json(value: object) -> bool: ...             # isinstance dict and "$msg" in value
    def __eq__/__hash__                                  # by key + canonical JSON of params
    def __repr__(self) -> str: ...
    def __str__(self) -> str:                            # lazy: from cadencia.i18n.render import render
        ...                                              # renders in the ambient locale (tests, logs, CLI)

def msg(key: str, /, **params: Param) -> Msg: ...        # alias
```

Deliberately **not a dataclass**: FastAPI's encoder would silently turn a forgotten `Msg` into
`{"key":…,"params":…}` on the wire. As a plain `__slots__` class, a `Msg` that reaches a response
unrendered is a 500 and a failing test (verified: an unknown object in a `-> dict[str, Any]` route
→ 500; registering it in `fastapi.encoders.ENCODERS_BY_TYPE` does **not** help for annotated routes,
which serialise through pydantic — ~112 of the 162 routes are annotated `-> JSONDict`). So rendering
is explicit; auto-rendering at the response layer was tried and rejected.

### 2.3 Catalogue format and typing

```python
Entry = str | Callable[..., str]
```

- `str` entries use `str.format_map(params)` with named fields. Pass ready-made fragments as params
  rather than escaping braces (e.g. `marker="{{texto.x}}"`, template `"Marcador {marker} ficou vazio."`).
- Callables take the params as keyword arguments, for plurals, conditionals and locale formatting.
  Nested `Msg` params (and lists of them) are rendered to strings in the same locale *before* the
  entry is called, so an entry joins plain strings (`"; ".join(reasons)`).
- en-US is the source of truth for the key set. "A missing key is a type error" is enforced by tests
  (the project runs ruff, not a type checker):
  1. same key set in all three locales, per namespace;
  2. same parameter names per key in all three locales (`string.Formatter().parse` for `str`,
     `inspect.signature` for callables);
  3. every literal key in `tr("…")`, `Msg("…")`, `msg("…")` anywhere in `cadencia/` exists in en-US
     (AST scan); dynamic keys (`f"risk.situation.{s.value}"`) are enumerated explicitly in the test;
  4. every entry renders with sample params in every locale without raising.
- Runtime: a key missing in the requested locale falls back to en-US; missing there too raises
  `KeyError` (a bug the tests above prevent).
- German uses the formal *Sie*, sentence case and the glossary in `docs/i18n.md`. en-US/de-DE entries
  never use `(s)`/`(ns)` plurals — use `fmt.plural`. pt-BR follows R8 (verbatim).

Example (shows R8, plurals, a nested-free callable, and date formatting):

```python
# locales/pt_BR/risk.py
MESSAGES = {
    "evidence.stalled": lambda days, column, checkpoints: f"parado há {days} dias em {column}"
        + (f" ({checkpoints} checkpoints sem transição)" if checkpoints > 1 else ""),
    "evidence.overdue": lambda due, late: f"data limite {day_month(due, 'pt-BR')} vencida há {late} dia{'s' if late != 1 else ''}",
    "situation.bloqueado": "Bloqueado",
}
# locales/en_US/risk.py
MESSAGES = {
    "evidence.stalled": lambda days, column, checkpoints: f"stalled for {days} {plural(days, 'day', 'days')} in {column}"
        + (f" ({checkpoints} checkpoints without a status change)" if checkpoints > 1 else ""),
    "evidence.overdue": lambda due, late: f"due date {day_month(due, 'en-US')} passed {late} {plural(late, 'day', 'days')} ago",
    "situation.bloqueado": "Blocked",
}
# locales/de_DE/risk.py
MESSAGES = {
    "evidence.stalled": lambda days, column, checkpoints: f"seit {days} {plural(days, 'Tag', 'Tagen')} unverändert in {column}"
        + (f" ({checkpoints} Checkpoints ohne Statuswechsel)" if checkpoints > 1 else ""),
    "evidence.overdue": lambda due, late: f"Fälligkeitsdatum {day_month(due, 'de-DE')} seit {late} {plural(late, 'Tag', 'Tagen')} überschritten",
    "situation.bloqueado": "Blockiert",
}
```

Key naming: lowercase, dot-separated, situation/rule/kind codes reused verbatim as the last segment
(`risk.situation.<Situation.value>`, `risk.rule.<rule>`, `deck_problem.<kind>…`) so dynamic keys stay
enumerable.

### 2.4 Public API (`cadencia.i18n`)

```python
SUPPORTED = ("en-US", "pt-BR", "de-DE"); DEFAULT_LOCALE = "en-US"
DECK_LOCALE = "pt-BR"      # the deck's language (R5)
STORAGE_LOCALE = "pt-BR"   # language of the legacy mirror fields (R4)

current_locale() -> str                       # contextvar, else the process default
using_locale(locale) -> ContextManager[None]  # set/reset the contextvar (any thread, any task)
configure_default_locale(locale) -> None      # process default for code outside requests
negotiate(header: str | None) -> str          # Accept-Language → supported locale, else en-US

tr(key, /, **params) -> str                   # render(Msg(key, **params)) in the ambient locale
render(value: Msg | str | None, locale: str | None = None) -> str   # str passes through (legacy text)
localize(tree, locale=None)                   # deep copy of dict/list/tuple with every Msg and every
                                              # {"$msg": …} dict replaced by its rendered string
stored_text(record: Mapping | None, legacy: str | None, locale=None) -> str | None
                                              # $msg record → rendered; else the legacy stored text
```

`negotiate`: split on `,`, read `;q=` (invalid or `0` → skip), stable-sort by weight, ignore `*`,
match case-insensitively on the full tag, then on the primary subtag (`de` → `de-DE`, `pt` → `pt-BR`,
`en-GB` → `en-US`); nothing matches → `en-US`.

### 2.5 Request locale

`LocaleMiddleware` (pure ASGI, like `api/security.py`; not `BaseHTTPMiddleware`):

1. locale = `negotiate(query "lang")` if a `lang` query parameter is present, else
   `negotiate(Accept-Language)`. (`?lang=` exists for links the browser opens itself — see 3.4.)
2. `token = _LOCALE.set(locale)`; `try: await app(...)` `finally: _LOCALE.reset(token)`.
3. On `http.response.start`, add `Content-Language: <locale>` and append `Accept-Language` to `Vary`.

Registered in `create_app` **after** the CORS middleware (last added runs first), so it wraps
`TokenAuth` and the 401 body can use `tr()`. `create_app` also calls
`configure_default_locale(settings.locale)`.

**Verified with the installed FastAPI 0.141.1 / Starlette 1.6.0 / anyio 4.15.1** (probe script run
against a throwaway app; no project code touched): a contextvar set in such a middleware is visible
in sync route functions (they run in an "AnyIO worker thread"), sync dependencies, generator
dependencies (enter and exit), `BackgroundTasks`, and exception handlers registered for specific
exception types (they run in `ExceptionMiddleware`, inside user middleware). It is **not** visible in
the `@app.exception_handler(Exception)` handler: that one runs in `ServerErrorMiddleware`, outside all
user middleware, after the `finally` has reset the var — it saw `en-US` for a `pt-BR` request.
Therefore **every handler in `api/app.py` computes its locale from the request**:
`locale_of(request) = negotiate(request.query_params.get("lang") or request.headers.get("accept-language"))`,
and renders with `render(..., locale)` explicitly. Uniform, and correct for the 500 handler.

`HTTPException(detail={...})` raised in routes renders with `tr()` at raise time (inside the request,
so ambient = request locale). `deps.not_found(cause, message)` keeps its signature; callers pass
`tr(...)` results.

Settings: `config.Settings.locale: str = "en-US"` (env `CADENCIA_LOCALE`), validated against
`SUPPORTED`.

### 2.6 Outside a request

- **CLI**: `cli.main()` calls `configure_default_locale(get_settings().locale)` before building the
  parser, so `help=` strings can use `tr()`. `_print(value)` becomes `json.dumps(localize(value), …)`.
  `cadencia scheduler` and `cadencia serve` go through the same `main()`.
- **Scheduler**: `BlockingScheduler` jobs run in pool threads that do not inherit contextvars, so they
  read the process default (= `CADENCIA_LOCALE`) — no per-job code needed.
- **Notifications** (recommended, decision 1): always rendered in `settings.locale`, even when a
  request triggers them (deck generated from the editor, "send test", "send digest now") — they go to a
  team channel, not to the person clicking. `notify.deliver` and the message builders run under
  `using_locale(settings.locale)`. Message bodies are built from keys at send time.

### 2.7 Pure, cached and persisted text — concrete patterns

**Exceptions** (`cadencia/errors.py`, `jira/errors.py`):

```python
class Invalid(ValueError):
    def __init__(self, message: str | Msg) -> None: super().__init__(message); self.msg = message
    def __str__(self) -> str: return render(self.msg)        # lazy import inside, keeps domain clean

class NotFound(KeyError):
    def __init__(self, subject, message: str | Msg | None = None): ...
        # default Msg("common.not_found", subject=str(subject))
    @property
    def message(self) -> str: return render(self.msg)
```

Handlers: `{"cause": render(Msg("common.error.not_found"), loc), "message": render(exc.msg, loc)}`.
`JiraError`: class attribute `code = "jira.error"` (subclasses `jira.auth`, `jira.permission`,
`jira.not_found`, `jira.host`, `jira.query`, `jira.rate_limit`, `jira.server`, `jira.write_forbidden`);
`cause`/`action` become properties rendering `f"{code}.cause"`/`f"{code}.action"`; `message` renders
`self.msg` (a `Msg` whose params carry the path, status and Jira's own detail text); `as_dict()` keeps
its keys and renders ambiently; `record()` returns `{"cause": …, "action": …, "message": …}` as `$msg`
JSON for storage. The unused `cause=`/`action=` constructor overrides go away (no caller passes them).

**Risk evidence** (`domain/risk.py`, `analytics/serialize.py`, `collector/snapshots.py`,
`analytics/changes.py`):

- `Evidence.message: str` → `Evidence.msg: Msg`; `details: tuple[Msg, ...]`. Dates go in as local ISO
  dates (the domain already converts to the board's time zone); numbers raw. The `bloqueio` message
  is `Msg("risk.evidence.blocked", reasons=[Msg(...), ...])`.
- `Situation.label` → returns `Msg(f"risk.situation.{value}")`; `Evidence.description` →
  `Msg(f"risk.rule.{rule}")`. `LABELS`/`RULES` dicts leave the domain (their text moves to the
  catalogue verbatim).
- Two serialisers:
  - `evidence_record(e)` (storage and the live side of comparisons): `{"rule", "situation", "days",
    "last_transition", "msg": e.msg.to_json(), "detail_msgs": [...], "message": render(e.msg,
    STORAGE_LOCALE), "details": [... pt-BR ...]}`. `label`/`rule_description` are no longer stored
    (derivable from the codes). `snapshot_rows` uses it, for stored *and* live rows, so the two sides
    stay measured alike.
  - `evidence_dict(e)` (API wire): today's keys, rendered ambiently, plus `code` (the message key).
- `changes._entry` reads `reason = stored_text(first.get("msg"), first.get("message"))`;
  `_LABEL` (module-level) becomes a function. Old snapshot rows (no `msg`) keep showing their stored
  pt-BR reason in every language — accepted (decision 7).

**Validation** (`report/core/*`, `report/service.py`):

- `report/core/generate.Problem` gets `msg: Msg` (constructor `Problem(kind, msg, slide=…, …)`);
  `as_dict()` → `{"kind", "slide", "target", "field", "msg": msg.to_json(), "message":
  <pt-BR mirror>}`. The mirror is rendered by `report/service.py` (core cannot render): core emits
  `msg`, the service fills `message = render(msg, STORAGE_LOCALE)` before storing. Same shape for
  `validate.py` entries, `package_check` entries (`PackageReport.fail/warn(kind, msg, **extra)`), a11y findings,
  `edits` problems (`list[Msg]`), `info` (`info_msgs` beside `info`), `preview.reason` (`reason_msg`).
- `validate.unique()` de-duplicates on `(kind, canonical msg JSON)` instead of the rendered text.
- Reading: `report/service.localized_validation(v)` returns a copy with every entry's `message`
  re-rendered from `msg` in the ambient locale (legacy entries keep their stored message) and the
  internal `msg` fields removed; `run_dict()` and `download_blocker()` use it.
- `A11Y_WORDS` becomes keys `deck_service.a11y_summary.<kind>` with a plural callable.

**Collection errors** (needs **migration `0022_i18n_error_records`**: nullable JSON columns
`board_run.error_i18n`, `board.last_error_i18n`, `collector_run.error_i18n`; model change in
`store/schema.py` so `create_all` — used by tests — picks it up):

- `_fail()` stores the `JiraError.record()` (or the collector's own `Msg`s for cancelled/unexpected;
  for an unexpected exception the `message` stays the raw `str(exc)`) in `error_i18n`, and the pt-BR
  mirror in the existing `error`/`cause`/`action`/`last_error` columns.
- `BoardData` (cached) carries the *record*, not text; `freshness()` renders it with `stored_text`.
- Readers: `routes_setup._run_dict`, `_board_dict`, `analytics/dashboard.py:136`, `/status` runs.
- Alternative considered: stash the record in `counters` JSON — avoids a migration but puts error
  data in a counters field, and `board` has no such field. Not recommended.

**Allocation plans**: `AllocationPlan.warnings: tuple[Msg | str, ...]`; `as_dict()` emits `$msg` JSON;
`plan_from_dict` accepts both (legacy rows are strings); `plan_view` ends with `localize(...)`;
`DISCLAIMER` becomes `tr("board.allocation.disclaimer")` at view time.

**Notification outcomes**: `deliver` stores `error` (pt-BR mirror) and `error_msg` (`$msg` JSON);
raw HTTP bodies stay params. `GET /notify` renders with `stored_text`.

**Epic plan**: `Problem.message: Msg`; `Duration.label`, `hours_label`, `fmt_hours` become `Msg` /
locale-aware formatting; `schedule.validate()` returns `list[Msg]`; `Problem.as_dict()` and
`Duration.as_dict()` emit `$msg` JSON; **`analytics/epic_plan.plan_view` ends with
`return localize(view)`**, which is also what makes `deck_summary` (same view, deck locale) pt-BR.

**Domain `as_dict()` pattern** (`Progress.as_dict`, `Problem.as_dict`, `Duration.as_dict`,
`AllocationPlan.as_dict`, `SprintTimeline` serialisation): emit `$msg` JSON; the analytics view that
embeds them ends with `localize(view)`. This is also what keeps tasks independent: a view that ends in
`localize()` renders whatever its producers start returning as `Msg`.

**Field catalogue (D7)**: `report/core/context.py` keeps `FIELDS` untouched (deck-facing pt-BR, used
for alt text) and gains a pure `GROUP_IDS = {G_REPORT: "report", G_SPACE: "space", …}` map. The API
boundary (`report/service.field_catalog`, `api/routes_reports.fields_catalog` → both via one
`service.localized_catalog(entries)`) overlays `label = tr(f"fields.label.{key}")`,
`group = tr(f"fields.group.{group_id}")`, adds `group_id`, and for `texto.*` entries keeps the
registration's own label (user data) and translates only the hint
(`fields.variable_hint.source` / `.hand`). pt-BR catalogue entries are generated once from `FIELDS`
(verbatim). A test asserts every `FIELDS` key and group has entries in all three locales.

**System-made version labels** (`deck_version.label`): written with `tr()` in the requester's
language at creation and not re-translated — the column is free text that people also type
(decision 8).

**Seeded data** (`ROLE_SEED`, focus-log signals): user data once seeded; see decision 4.

### 2.8 Deck invariance

- `report/adapters/jira_source.JiraSource.deck_data` wraps its body (which also runs `inputs()`:
  changes, health, epic-plan summaries) in `with using_locale(DECK_LOCALE):`. Every `DeckData` build
  goes through it — `generate_report`, previews, partial/"agora" runs, `resolve_preview` (editor value
  mode), `resolve_source_fields`, readiness, narrative facts, scheduler deliveries — so ambient
  rendering inside it is pt-BR whatever the request or `CADENCIA_LOCALE` says.
- Everything else generation produces for people (validation, a11y, edits problems) is `Msg`,
  rendered later in the reader's language.
- `ManualSource` has no catalogue text.
- Deck-only literals (1.7) stay literal; dual-use text (1.1) is catalogue-rendered in pt-BR by the
  wrapper; `FIELDS` stays the alt-text source.
- **Invariant checks**: `tests/test_golden.py` runs every case under `en-US` and `de-DE` (not pt-BR —
  the point is to prove the request/process locale does not leak) against the existing
  `tests/golden/*.json`, which must not be re-recorded. Plus one API test: the editor preview items for
  a slide are identical under `Accept-Language: de-DE` and `pt-BR`, while its `warnings` differ.
  `tests/test_deck_library.py:111` (alt text "Vazão por janela da sprint:") and
  `tests/test_deck_extras.py:63` (CFD series "Concluído") already pin two dual-use paths.

### 2.9 Formatting

- Dates in messages are passed as ISO strings and formatted per locale, matching the frontend's
  `Intl` `{day:'2-digit', month:'2-digit'}` output: pt-BR `08/09`, en-US `09/08`, de-DE `08.09.`;
  with year `08/09/2026`, `09/08/2026`, `08.09.2026`. Notifications' `"%d/%m/%Y %H:%M UTC"` likewise.
- Numbers: `fmt.number(x, locale, digits)` — comma for pt-BR/de-DE, dot for en-US.
- **R8 exceptions, kept on purpose**: pt-BR risk messages keep Python's `:g` (dot decimals, e.g.
  `"em andamento há 7.5 dias"`) because those strings are printed in the deck; epic-plan hours keep
  the comma (`fmt_hours`). Fixing the pt-BR decimal in evidence would change the deck.
- `fmt.listing(items, limit, locale)` replaces `_listing` (`"A, B e mais 5"` / `"A, B and 5 more"` /
  `"A, B und 5 weitere"`).
- Epic-plan duration units (`"19h · 3d 1h"`, `"N d"`): rendered through the catalogue; en-US keeps
  `h`/`d`; the de-DE unit for days is decision 12.

---

## 3. Wire contract changes (frontend)

Principle: **the API keeps returning ready-to-show strings, now in the request language**; shapes
stay; new fields are additive. The frontend needs almost no change.

1. **Already in place**: `Accept-Language` is sent on every `fetch` from `api/client.ts` with exactly
   one of `en-US` / `pt-BR` / `de-DE`. Language change resets the query cache (docs/i18n.md), which is
   required because responses carry translated text.
2. **Same fields, translated values**: error `detail.cause` / `.message` / `.action` (all statuses,
   incl. 401 and 500); risk `label`, `evidence[].message`, `.rule_description`, `.details[]`; changes
   `label`, `reason`; health `title`, `action`; sprint/dashboard `warnings`; tree synthetic node
   `label` (`"__sem_epico__"` node); progress `coverage_warning`; allocation `disclaimer`, `warnings`;
   flow disclaimer; forecast notes; epic plan `mensagem`, `rotulo`, `rotulo_horas`, `algoritmo_nome`,
   strategy descriptions, `senioridade_rotulo`, `diagnostico` reasons, plan validation errors;
   validation `errors[].message` / `warnings[].message` / `info[]` / `preview.reason` /
   `accessibility.findings[].message`; preview `warnings`; mapping-suggestion `notes`; library
   diagnostics and usage hints; variable `conflicts[].message`; field catalogue `label` / `group` /
   `hint`; notification `events[].label` and `channels[].last.error`; `connection/test` error;
   `/status` run `error`/`cause`/`action` and board `last_error`.
3. **Additive fields**: `evidence[].code` (message key, optional to use); field catalogue
   `group_id` (stable id — group by it instead of the now-translated `group` string in
   `pages/FieldCatalog.tsx:89`, optional). Update `web/src/api/types.ts`.
4. **`?lang=<locale>` query parameter** is honoured on every route and wins over the header. Needed
   for URLs the browser opens itself without the app's header: CSV/JSON exports
   (`components/common.tsx:650` `<Menu.Item component="a" href={exportUrl(…)}>` — the browser would
   send its *own* `Accept-Language`). Frontend change: `exportUrl` appends `lang=currentLocale()`.
5. **Response headers**: `Content-Language: <locale>`, `Vary: Accept-Language`.
6. **Deliberately untranslated** (frontend must not expect the UI language): deck content anywhere
   it is shown — preview items, run/template scenes, resolved variable values ("resolvido"), status
   palette labels, deck downloads/PDF; Jira data (statuses, columns, titles, names, sprint names);
   user data (role names/descriptions, variable labels, review notes, focus-log themes/signals).
   Rows stored before the change (old snapshot reasons, old run validations, old collection errors)
   show their stored pt-BR text in every language.
7. Unchanged: JSON keys (Portuguese planning keys included), codes (`situation`, `rule`, `kind`,
   `codigo`, `nivel`, `severity`, phases), routes.

---

## 4. Tests

### 4.1 Impact

Assertions that check backend prose (grep of `tests/`): ≈ 105 assertion lines contain pt-BR words;
≈ **55 check translatable backend text**, the other ≈ 50 check Jira demo data, deck content or user
data, which must not change.

- ≈ **30 go through the HTTP API** (`test_api.py` 87, 89, 98, 160, 238, 934, 937 …;
  `test_deck_workflow.py` 204, 244, 353; `test_epic_plan_api.py` 133, 164, 168, 228;
  `test_hardening.py` 51, 86, 190, 225; `test_collector.py:77`; `test_features.py` 102, 179;
  `test_focus_log.py:124` …). **Unchanged** if test clients send `Accept-Language: pt-BR`.
- ≈ **25 call domain/report-core objects directly** and read `.message`, `.warnings`, `.details`,
  `.label` or `in e` on a list that becomes `Msg`s → mechanical edit to `str(x.msg)` / `str(w)`:
  `test_risk.py` 44, 58, 65, 90; `test_calendar.py` 33, 42; `test_allocation.py:69`;
  `test_epic_plan.py` 120, 175, 247, 281–295 (`broken()` ×5), 460, 473; `test_hierarchy.py:43`;
  `test_report.py` 554, 580, 828–830; `test_features.py:420` (equality with a list of strings).
- `pytest.raises(..., match=…)` on `Invalid`/`ValueError` (`test_store.py` 37, 51; `test_epic_plan.py`
  236; `test_focus_log.py:182`) keep working because `str(exc)` renders in the ambient (pt-BR) locale.
- `test_jira_client.py:139` (`info.value.cause == "host inacessível ou errado"`) keeps working:
  `cause` is a property rendering ambiently.

### 4.2 Recommendation: pt-BR by default, en/de targeted

Run the suite under **pt-BR by default** (R8 makes the existing assertions a regression test of the
conversion), with targeted en-US/de-DE tests and the golden suite under en-US/de-DE:

- `tests/support.py`: `make_settings(...)` defaults `locale="pt-BR"`; export `PT_BR = {"Accept-Language":
  "pt-BR"}`.
- `tests/conftest.py`: autouse fixture `_locale(request)` — reads `@pytest.mark.locale("xx-YY")`
  (default `pt-BR`), calls `configure_default_locale(...)` and wraps the test in `using_locale(...)`,
  restoring `DEFAULT_LOCALE` afterwards. Register the `locale` marker in `pyproject.toml`
  (`[tool.pytest.ini_options] markers`).
- The 13 `TestClient(...)` constructions pass `headers=PT_BR` (Starlette 1.6 `TestClient` takes
  `headers=`): `test_api.py:21`, `test_deck_library.py:37`, `test_focus_log.py:41`,
  `test_epic_plan_api.py:36`, `test_hardening.py:26, 83`, `test_features.py:50`,
  `test_people.py:26, 168, 277`, `test_deck_workflow.py:37, 276`, `test_home.py:23`.
- `tests/test_golden.py`: run every case under `en-US` and `de-DE` (fixture param or marker); +~4 s.

New tests (by task):

- T1 `tests/test_i18n.py`: `negotiate` table (exact, case, q-values, `q=0`, `*`, primary subtag,
  garbage → en-US); middleware: sync route + sync/generator dependency + background task see the
  locale; `?lang=` wins; `Content-Language`/`Vary`; 401/404/400/500 bodies localized (500 via
  `raise_server_exceptions=False`); `str(Invalid(Msg))` follows `using_locale`; `Msg` JSON round trip,
  equality/hash; `localize` on nested trees; `stored_text` legacy fallback; catalogue tests 1–4 of 2.3.
- `tests/test_boundaries.py`: `report/core` may import `cadencia.i18n.message` and nothing else from
  `cadencia.i18n`; new test: `domain/` likewise (no `cadencia.i18n.render`/`runtime`, no `store`,
  `analytics`, `api`, `config`).
- Per task: one en-US and one de-DE assertion per converted area through the API; legacy-row
  fallbacks (a snapshot evidence entry with only `message`; a run validation without `msg`; a
  board_run with only `error`/`cause`/`action`); deck-invariance test (2.8).
- Final sweep: `tests/test_i18n_leaks.py` runs `tools/i18n_scan.py` over `cadencia/` and fails on any
  pt-BR literal outside the allowlist (1.7, 1.8, `i18n/locales/pt_BR/`, lines marked
  `# deck text: pt-BR by design`).

---

## 5. Implementation split

T1 first; then T2–T6 in parallel (exceptions noted). Each task owns the listed files exclusively and
adds its own namespace files under `cadencia/i18n/locales/{en_US,pt_BR,de_DE}/`. Every task: pt-BR
verbatim (R8); German formal *Sie* + glossary; en/de plurals via `fmt.plural`; no deck text changes.

**Common verification** (every task, from `/workspace/backend`):
`.venv/bin/pytest -q -p no:cacheprovider` (≈ 2 min; time with `/proc/uptime`, not the wall clock) ·
`.venv/bin/pytest -q tests/test_golden.py tests/test_i18n.py` · `cd /workspace && make lint` ·
`.venv/bin/python tools/i18n_scan.py <owned files>` reports nothing but allowlisted deck text.
Golden snapshots are never re-recorded (`CADENCIA_UPDATE_GOLDEN` must not be used).

### T1 — Core i18n module, middleware, test harness *(delicate; small; blocks everything)*

Owns: new `cadencia/i18n/**` (all of 2.1–2.4) with namespace `common` (generic error causes, 401
texts, 500 cause/action/message, `NotFound` default); new `backend/tools/i18n_scan.py`;
`cadencia/config.py` (`locale` + validator); `cadencia/errors.py` (2.7);
`cadencia/api/app.py` (middleware registration, `configure_default_locale`, handlers per 2.5);
`cadencia/api/security.py` (401 via `tr`); `cadencia/report/adapters/jira_source.py` (`using_locale
(DECK_LOCALE)` wrapper — lands first so the golden net is real from the start);
`cadencia/cli.py` **only** the `configure_default_locale(get_settings().locale)` line in `main()`;
tests: `tests/test_i18n.py` (new), `tests/conftest.py`, `tests/support.py`, the 13 `TestClient` sites,
`tests/test_boundaries.py`, `tests/test_golden.py`, `pyproject.toml` (marker).
Also: a short "Backend mechanics" section in `docs/i18n.md` pointing here (only if the orchestrator
wants docs in this task).

DoD: 394 existing tests + new ones green; golden green under en-US and de-DE without re-recording;
API errors in en-US/de-DE/pt-BR per header and `?lang=`; 500 handler localized; catalogue tests
framework in place (passes on `common`).

### T2 — Board views, risk, snapshots, changes *(delicate: persisted snapshots + deck dual-use D1–D5, D8)*

Depends on T1. Owns: `domain/{risk,hierarchy,calendar,metrics,commitment,forecast,allocation,models}.py`;
`analytics/{serialize,sprint,dashboard,flow,forecast,planning,person_detail,changes,health,deck}.py`
(in `deck.py` only the risk/label call sites — deck literals stay and get the marker comment);
`collector/snapshots.py`; `api/{routes_views,routes_insights,routes_planning,routes_people,
routes_home,routes_export}.py`. Namespaces: `risk`, `board`, `changes`, `health`, `profile`.
Notes: evidence record/dict split (2.7); `cumulative_flow` takes the fallback column names as a
parameter (callers pass `tr(...)` results — the deck path then gets pt-BR); `digest_text` moves to
keys but `notify.py` belongs to T5 (T2 only changes `analytics/changes.py`, which `notify` calls).
Leaves `analytics/dashboard.py`'s `board_row.last_error` read to T5.
DoD: ≈ 95 keys ×3; tests in 4.1 for these files edited; legacy snapshot fallback test; en/de API
assertions for risks, changes, health, sprint warnings; golden unchanged.

### T3 — Epic plan and planner *(moderate-delicate: nested reasons, number formats, deck D6)*

Depends on T1. Owns: `domain/epic_plan/{from_jira,hours,model,schedule,timeline}.py`,
`planner/{solvers,strategies}.py`, `analytics/epic_plan.py` (except `deck_summary`'s deck literals,
which stay), `api/routes_epic_plan.py`. Namespaces: `epic_plan`, `planner`.
Also (coordinator request): **`description_sections` heading aliases** in
`domain/epic_plan/from_jira.py` `_SECTIONS` (today: `negocio`, `business`, `tecnico`, `technical`,
`dependencia(s)`, `observacao/observacoes de dependencia`). Add en `dependencies`, `dependency`;
de `fachlich`, `geschaftlich` (Geschäftlich), `technisch`, `abhangigkeit`, `abhangigkeiten`
(`normalize()` already strips accents and umlauts, so `Abhängigkeiten` → `abhangigkeiten`). Input
recognition only — the JSON keys `negocio`/`tecnico` and the page's section titles are unaffected.
Test with ADF `#` headings and inline `Business:` / `Fachlich:` lines.
DoD: ≈ 55 keys ×3; `plan_view` ends with `localize()`; `fmt_hours`/`hours_label` locale-aware (pt-BR
comma kept); `test_epic_plan.py`/`test_epic_plan_api.py` updated per 4.1; en/de plan-page smoke test;
golden unchanged (`plano.duracao` still pt-BR).

### T4 — Deck engine messages and the report service *(delicate: report/core boundary, persisted validation, field catalogue)*

Depends on T1. Owns: `report/core/{generate,validate,package_check,a11y,edits,resolve_preview,
suggest,context}.py` (`context.py`: only `GROUP_IDS` + the hint `Msg`s; `FIELDS` labels untouched),
`report/service.py`. Namespaces: `deck_problem`, `package`, `a11y`, `deck_service`, `fields`
(116 labels + 13 groups + 2 hints, pt-BR generated from `FIELDS`).
Notes: core imports only `cadencia.i18n.message`; `Problem`/entries carry `msg` and the service adds
the pt-BR `message` mirror before storing; `unique()` on `(kind, msg)`; `localized_validation` in
`run_dict` and `download_blocker`; `A11Y_WORDS` → keys; `localized_catalog` overlay with `group_id`;
`variable_conflicts`, review and share errors via `tr`. Package-check messages are the lowest priority
inside this task (decision 9).
DoD: ≈ 230 keys ×3; `test_report.py` 554, 580, 828–830 and `test_features.py:420` adapted; legacy
validation fallback test; deck-invariance API test (2.8); `tests/test_boundaries.py` green; golden
unchanged under en-US/de-DE.

### T5 — Collection, Jira errors, notifications, store *(delicate: migration, cached `BoardData`, notification locale)*

Depends on T1; its `analytics/dashboard.py` edit (the `last_error` read, ~line 136) must land after T2.
Owns: `jira/errors.py`, `jira/client.py`, `collector/service.py`, `collector/scheduler.py`,
`notify.py`, `store/schema.py`, `store/repo.py` (all its `Invalid`/`NotFound` messages plus
`finish_board_run`), new `store/migrations/versions/0022_i18n_error_records.py`,
`api/routes_setup.py`, `api/routes_notify.py`, `analytics/data.py`, `domain/epic_plan/seed.py` (if
decision 4 says seed in `CADENCIA_LOCALE`). Namespaces: `jira`, `collect`, `notify`, `store`, `seed`.
DoD: ≈ 110 keys ×3; migration upgrades and downgrades on SQLite (`cadencia db-upgrade` against a
scratch `CADENCIA_DATABASE_URL`); `test_collector.py:77`, `test_api.py:238`, `test_jira_client.py:139`
still green; new tests: stored board_run record renders in de-DE, legacy row shows stored text;
notifications rendered in `settings.locale` regardless of request header (decision 1); digest text
in en-US.

### T6 — Remaining request-path errors, deck routes, library, CLI *(mechanical)*

Depends on T1. Owns: `api/routes_reports.py`, `api/routes_deck.py`, `api/deps.py`,
`api/routes_focus_log.py`, `focus_log/model.py`, `report/library.py`, `report/qanda.py`,
`report/narrative.py` (errors only; the prompt stays pt-BR), `cli.py` (help texts, `"Sem espaço"`,
`_print` → `localize`; the `main()` line already added by T1). Namespaces: `http`, `deck_api`,
`library`, `narrative`, `focus_log`, `cli`.
DoD: ≈ 120 keys ×3; existing API tests green under pt-BR; en/de spot checks for 404/400/409/503
bodies; `cadencia --help` in en-US by default and in de-DE with `CADENCIA_LOCALE=de-DE`.

### Final sweep (orchestrator or a short follow-up)

Add `tests/test_i18n_leaks.py` (Appendix A over all of `cadencia/`, allowlist per 1.7/1.8), run the
full suite and golden, then the frontend tasks of section 3 (`exportUrl` `lang`, `types.ts` additive
fields).

---

## 6. Decisions for the orchestrator

1. **Notification language** when a request triggers it (deck generated in the editor, "send test",
   "send digest now"): recommended `CADENCIA_LOCALE` always (team channel), not the clicker's language.
2. **Missing `Accept-Language`** → `en-US` (literal contract) rather than `CADENCIA_LOCALE`.
   Recommended as written; only direct API callers are affected.
3. **`?lang=` override** for browser-opened links (exports) — recommended; needs the one-line
   frontend change in `exportUrl`.
4. **Seeded data** (`ROLE_SEED` role names/descriptions): seed in `CADENCIA_LOCALE` on fresh installs
   (catalogue `seed.*`), never touch rows already seeded — or keep pt-BR seeds. Recommended: seed in
   `CADENCIA_LOCALE`. Focus-log signals were seeded by migration 0021 and stay.
5. **pt-BR verbatim this round** (R8): keeps "(s)" plurals and dot decimals in pt-BR UI messages;
   cleanup is a later, deck-aware change. Recommended.
6. **Date formats** in backend messages per locale as in 2.9 (matching the frontend's `Intl` output).
7. **No backfill of stored text**: old snapshots/validations/collection errors show stored pt-BR in
   every language. Recommended (old snapshots lack the params to rebuild a message).
8. **System version labels** ("antes de restaurar…") written once in the requester's language, not
   re-translated. Recommended (free-text column).
9. **Package-check (OOXML) messages**: translate (35 technical templates, recommended for consistency
   with the contract) or leave pt-BR as a known gap.
10. **German Jira input names** (`Storypunkte`, `Markiert`, `wird blockiert durch` in
    `jira/fields.py`/`jira/mapping.py`): out of i18n scope but needed for German Jira instances;
    suggest a separate small task. (The epic-plan heading aliases are already in T3.)
11. **CLI help text** translation (≈ 40 strings): included in T6; can be deferred.
12. **de-DE duration units** in epic-plan labels (`"3d 1h"`): keep `d`/`h` or use `T`/`Std.`. Copy
    decision.
13. **Migration 0022** (three nullable JSON columns) vs. stashing records in `counters`: recommended
    migration.

---

## Appendix A — leak scanner

`tools/i18n_scan.py` (T1) walks `cadencia/**/*.py` (skipping `store/migrations` and
`i18n/locales/pt_BR`), parses each file with `ast`, drops docstrings and arguments of
`log.*`/`logger.*`/`logging.*` calls, and reports string literals and f-string templates that
contain a space and either a Portuguese diacritic or a Portuguese function word (`não`, `sem`,
`para`, `com`, `de`, `que`, `há`, `já`, `nada`, `ainda`, `coleta`, `itens`, `dias`, imperatives
such as `confira`, `informe`, `escolha`, `recarregue` …). Allowlist: files in 1.7/1.8 and lines
carrying `# deck text: pt-BR by design`. The inventory counts in section 1 came from this heuristic
(847 templates after dropping literal fragments that are parts of an f-string).

---

## 7. Orchestrator decisions (binding)

1 yes (notifications always in `CADENCIA_LOCALE`) · 2 yes (no header → en-US) · 3 yes (`?lang=`) ·
4 seed in `CADENCIA_LOCALE`, never touch existing rows · 5 yes (pt-BR verbatim) · 6 yes ·
7 no backfill · 8 yes · 9 translate package-check messages · 10 out of scope (follow-up) ·
11 translate CLI help · 12 de-DE units `T` (days) and `h` (hours), e.g. `3T 1h` · 13 migration 0022.
