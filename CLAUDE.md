# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Cadência is a read-only Jira Cloud tracker. A **space** is a team and owns one or more **boards**; a board is never called a "time"/team in code or UI, and "time" in pt-BR text always means a space. It collects item history, freezes weekly checkpoint snapshots, classifies risk with evidence, computes flow and planning metrics, and fills the end-of-sprint PowerPoint template. The spec is the PRD at https://claude.ai/artifact/7LGp9NsDcVfRMZ9nwVTvLJ (Portuguese). Requirement ids like `RF-16` in comments refer to it. The app speaks en-US (the default), pt-BR and de-DE: every user-visible text, in the web app and in API messages, goes through the catalogues, while the generated deck stays pt-BR and Jira data, routes and JSON keys are never translated. The contract and glossary are in `docs/i18n.md`, the backend design in `docs/i18n-backend.md`. Code, identifiers and comments are English.

## Commands

Run everything from the repo root unless noted. The backend venv is `backend/.venv`; point the IDE interpreter there.

- Setup: `make setup` (creates the venv, `pip install -e "backend[dev]"`, `npm ci` in `web/`)
- Backend tests: `cd backend && .venv/bin/pytest`. One test: `.venv/bin/pytest tests/test_risk.py::test_counts_how_many_checkpoints_the_item_stayed_still`
- Lint and format: `make lint` / `make format` (ruff, line length 110, `SIM108` and pt-BR unicode rules ignored)
- Frontend: `cd web && npm run typecheck` (tsc), `npm test` (vitest, pure logic in `src/**/*.test.ts` only: components are checked in the browser) and `npm run build`. Dev server: `npm run dev`, which proxies `/api` to `:8000` or `$CADENCIA_API_URL`.
- API: `backend/.venv/bin/cadencia serve --reload`. Scheduler: `cadencia scheduler`. Every other CLI command prints JSON; see `cadencia --help`.
- Demo data without Jira: `cadencia demo`. It refuses a non-empty DB without `--force`, so point `CADENCIA_DATABASE_URL` at a scratch SQLite file.
- Config is seeded from `CADENCIA_*` env vars, `.env`, or `/run/secrets/cadencia_<field>`; the runtime fields (Jira, calendar, collection, notifications, AI, locale) can be saved in the app, and a saved value wins. The defaults are SQLite `./cadencia.db` and data dir `./data`.
- `config_store.py` (docs/config-store.md) stores those in `app_setting` `config.values`, secrets Fernet-encrypted (`CADENCIA_SECRET_KEY` or `<data_dir>/secret.key`). Read settings through `effective_settings` (`SettingsDep`, the scheduler's jobs as they fire, `cli._settings()`); `get_settings()` alone is right only for bootstrap fields (database, data dir, API token, CORS, logging).

Work now happens inside the `.devcontainer` (compose service `workspace`), which ships Python 3.12, Node 24 and LibreOffice. `docker-compose.yml` (the execution stack) has never been started here.

The devcontainer runs on WSL2 and its **wall clock jumps forward under CPU load** (`date` advanced 141 s while `/proc/uptime` advanced 4 s during one solver run). Time anything with `time.monotonic()` or `/proc/uptime`, never `time.time()`/`date`, and remember that libraries timing themselves against the wall clock (HiGHS does) will stop early here. It is the machine, not the code.

## Architecture

The data flows one way: **Jira → collector → store → analytics → API / report**. The UI and deck never call Jira live.

- `jira/client.py` is the only HTTP boundary. A write guard allows only GET, plus POST to `/search/jql` and `/search/approximate-count`. Concurrency is bounded by a semaphore. HTTP 429/5xx retry through tenacity, honouring `Retry-After` plus jitter. Search pages by `nextPageToken`; agile endpoints page by `startAt`/`isLast`. Errors carry `cause` and `action` for the UI (`jira/errors.py`).
- `jira/mapping.py`'s `space_from` reads a board's `location` as its space. Spaces are their own table (`space`) and `board.space_key`/`space_name` point at one; `Board.space` rebuilds the `Space`.
- `jira/fields.py` finds custom field ids (story points, sprint, epic link, flagged, rank) by schema and name. Never hard-code `customfield_*`. Manual overrides are stored in `app_setting`.
- `jira/mapping.py` is the only module that knows Jira's JSON shape. Changelog items become `Transition`s for status, assignee, sprint, estimate, flagged and parent.
- `domain/` is pure and has no I/O:
  - `history.IssueHistory` answers every "as of instant T" question (status, assignee, sprint membership, estimate, flag) from the changelog. That is what makes snapshots reproducible.
  - `calendar.py` builds sprint windows: about 7 days each, closed by the checkpoint nearest the nominal end, with a trailing remainder under 3 days merged into the previous window. A window contains `start < t <= end`.
  - `risk.py` ranks six situations by severity (carried over > overdue > blocked > stalled > aging > on track). The most severe wins, and all fired rules stay as evidence. Stalled means N full checkpoint intervals after the last status change. Aging uses the historical P85 cycle time for the type (falling back to all types, `"*"`, with at least 5 items).
  - `metrics.py` uses nearest-rank percentiles; `commitment.py`, `allocation.py` and `capacity.py` hold the rest of the planning math.
  - "Done" always means `statusCategory`, never the status name.
  - Metrics, commitment and window sets count only `hierarchy_level == 0` work items. Subtasks roll up into their parent, and epics are containers.
- `store/` holds SQLAlchemy 2 models. `UTCDateTime` rejects naive datetimes. `repo.upsert` does idempotent dialect-specific upserts (SQLite and PostgreSQL). Alembic lives in `store/migrations`; `0001` is a baseline built from `create_all`.
- `collector/service.py` collects boards concurrently, and one failing board does not fail the run. It starts with a full reconciliation, runs one again per sprint (active sprint start > `last_full_at`), and is incremental otherwise, using relative JQL (`updated >= -Nm`) from the last successful board run. `collector/snapshots.py` freezes checkpoints with insert-or-ignore: stored snapshots are never overwritten unless forced (RF-08).
  - Only one collection runs at a time, across the API and the scheduler, through the `lease` table (`repo.acquire_lease`; the holder renews it, and a dead holder's lease expires). `/status.collecting` reads the lease. The API takes it before answering 202 and hands its `run_id` to the job. A checkpoint waits for the lease; the hourly run skips.
  - A full run takes stored board members that the full JQL should have returned but didn't off the board (`_left_the_board`), because they were deleted, moved or filtered out. Parents are kept, and issue rows and snapshots stay.
- `analytics/` builds read models from `BoardData`, cached per board data version, for the API, CLI, exports and deck. It is also the only place that combines the domain layer with the store. RF-71 to RF-100 (the second round of features, specified in the PRD's section 21) added:
  - `analytics/changes.py` (RF-74): compares two checkpoints, or the last one with now. Both sides are snapshot rows, and the live side goes through `collector/snapshots.snapshot_rows` so the two are measured alike. `digest()` (RF-73) is the same comparison filtered to newly stalled/blocked/overdue items, grouped by space.
  - `domain/forecast.py` + `analytics/forecast.py` (RF-72): Monte Carlo over the board's last 60 business days of daily throughput, seeded from its inputs so the same data always gives the same forecast. Standard-level items only.
  - `analytics/health.py` (RF-78) lists Jira hygiene problems; `analytics/week.py` holds "my week" (RF-85) and the command palette's `search` (RF-80).
  - `BoardData`'s per-instant memo is capped at `MEMO_SIZE`, and `deps.clock` rounds to the minute so one page's requests share it.
- `repo.people_by_space` derives who is on a team from the assignees of the issues on the space's boards, so a person shared between teams is listed under each. `repo.spaces_of_boards` names the spaces, falling back to the board's own copy when the space table has not seen the key.
- `notify.py` (RF-71, RF-73) sends to Slack, Teams, JSON webhooks and SMTP e-mail. Channels live in `app_setting` (`notify.channels`), with the digest schedule in `notify.digest`. Webhook URLs are credentials: they are stored whole, returned masked, and a masked value sent back keeps the stored one. `deliver()` never raises, because a channel being down must not undo a generation. The scheduler also registers `template:{id}:…` jobs for a mapping's `schedule` (RF-77) and a `digest:…` job, re-synced every 5 minutes. A job id carries its own schedule, so changing a schedule replaces its job.
- Collection progress (RF-82): `_phase()` writes the step, `done` and `total` into `board_run.counters` and checks `collect.cancel`. A cancelled board raises `CollectionCancelled` between steps, never mid-write, and is not marked with `last_error`. `/status.current` reads this, with an ETA from `repo.typical_duration`.
- Saved views (`saved_view`), deck versions (`deck_version`, a rolling auto copy every 10 minutes plus named ones) and slide comments (`deck_comment`, keyed by *template* slide) arrived in migration 0009. Deleting a template takes its versions and comments (`repo.delete_template_extras`). The author comes from `X-Remote-User` (set by nginx after basic auth, `deps.author_of`), else from the body.
- `api/`: `create_app(settings, sessions)` is the factory (uvicorn `--factory`). Views are sync route functions. Tests override `deps.clock`.
  - Every URL is English: API paths, web-app paths, query keys and `?tab=` values (`docs/routes.md` is the table). Old Portuguese `/api` paths answer 308 through `api/legacy.py`'s one mapping, inside the token check; migration 0023 rewrote stored saved views.
  - `cadencia/errors.py`: `NotFound` and `Invalid` are the only exceptions turned into 404 and 400. A bare `KeyError`/`ValueError` is a bug and becomes a logged 500 (`ZoneInfoNotFoundError` is a `KeyError`), so raise one of those two when you mean "not found" or "invalid".
  - `api/security.py`: when `CADENCIA_API_TOKEN` is set, every route except `/api/health` needs `Authorization: Bearer`. People never see the token: nginx signs them in with basic auth and forwards it (`web/docker-entrypoint.d/`), and the Vite proxy does the same in dev. Serve files from disk through `deps.stored_file`, never by joining request parts onto a path. Uploaded images are typed by their bytes (`store_asset`).
- **i18n** (`cadencia/i18n`, catalogues in `i18n/locales/<en_US|pt_BR|de_DE>/<namespace>.py`). Pure code (`domain/`, `report/core/`) only builds `Msg(key, **params)` and raises `Invalid(Msg)`/`NotFound(subject, Msg)`; boundaries render in the ambient locale (the request's, `?lang=` over `Accept-Language`, else en-US; `CADENCIA_LOCALE` outside a request) with `tr`, `render` and `localize(view)`. Caches (`BoardData`, its memo) hold `Msg`, never text. Persisted text is `{"$msg": …}` plus a pt-BR mirror in the existing column, read back with `stored_text`. The deck is built under `using_locale(DECK_LOCALE)` (pt-BR); deck-only literals carry `# deck text: pt-BR by design`, and `tests/test_i18n_leaks.py` (`tools/i18n_scan.py`) fails on any other Portuguese literal.
- `report/` generates the deck. The template is the visual contract: Cadência fills its areas and never redraws a slide, so every "layout" option is about how content is *shaped into* an area, never about moving one.
  - **RF-60, the shape of the module.** `report/core/` is the engine and is *pure*: it imports
    nothing from `store`, `analytics`, `domain`, `jira`, `config`, `logging`, `collector`, `api` or
    `report.adapters`, and `tests/test_boundaries.py` walks it with `ast` and fails if it ever
    does. That check is a test rather than an import-linter rule on purpose — a module whose
    selling point is that it travels should not need a linter installed to prove it still can.
    `report/ports.py` holds the `DeckSource` Protocol (three questions: `targets()`, `catalog()`,
    `deck_data()`); `report/adapters/` holds `JiraSource` — the only place in the deck path that
    knows a board from a sprint — and `ManualSource`, which offers an empty catalogue so every
    variable is hand-filled. Two implementations is what keeps the port from quietly becoming the
    shape of Jira. `service.deck_source()` is the single line to change when carrying the module
    elsewhere; nothing else in the orchestration reaches `analytics` directly.
  - `manifest.py` produces target ids `s<slideId>/sh<shapeId>[#p<n>|#r<r>c<c>[p<n>]]`, which are stable across saves and include shapes inside groups. Manifest v2 also carries typography (size, weight, colour, alignment), frame insets/anchor and table geometry, which is what makes the resolved preview believable. Older stored manifests still work — `POST /reports/templates/{id}/refresh` re-reads the file to upgrade one.
  - `suggest.py` builds a starter mapping from template labels and legend colours.
  - `generate.py` works in stages on the original file: remove slides, clone repeat blocks (per board or per space), drop slides whose `hide_when_empty` field is empty, paginate tables onto slide copies, apply bindings, then replace inline `{{markers}}`. `text.py` merges runs first so split markers are still found (RF-40). `expand_markers` also resolves markers inside a binding's literal value.
  - `layout.py` is the shaping pipeline every binding mode shares: sort, filter by status, cap, clip, case, prefix/suffix, number formats. Generation and the preview both call it, which is the only reason the preview can be trusted.
  - `resolve_preview.py` resolves one slide against one board without LibreOffice, returning the content as data. The mapping screen draws it over the slide geometry, so the builder sees what the slide will *say*, not only where a field lands.
  - `properties.py` resolves a shape's **effective** fill, line and text the way PowerPoint does:
    `spPr` → `<p:style>` into the theme's `fmtScheme` → layout placeholder → master placeholder →
    master `txStyles` → theme font scheme, with `schemeClr`/`lumMod`/`shade`/`tint`/`alpha` all
    evaluated. Reading only the shape leaves most of a real deck blank — on this project's own
    template, 73 of 132 shapes state no fill and 16 of 78 paragraphs state no size.
  - `geometry.py` folds **group transforms** (`chOff`/`chExt`, recursive) into absolute slide
    coordinates and turns `prstGeom`/`custGeom` into SVG paths. A grouped shape read with
    `shape.left` lands wherever its group's author was working; the template has 49 such shapes.
    Never read `shape.left` for rendering — use `iter_placed`.
  - `edits.py` is the **manual edit layer** (RF-46): a `DeckEdits` document of *absolute* overrides
    keyed by `origin_slide_id:board_id:page` and by `sh<id>` (or `cadencia:<key>`, stamped into an
    inserted shape's name). `generate_report` fills the pristine template with fresh data and *then*
    replays it, which is the whole reason a re-run keeps the layout work. Keep every override
    absolute: a relative one would drift on the second replay.
  - `scene.py` reads a generated .pptx back as the editable scene the canvas draws, on top of
    `properties.py` and `geometry.py`. Text is kept as **runs**, never flattened to the first one,
    so mixed formatting survives an edit. A shape the model cannot draw honestly (chart, SmartArt)
    is marked `renderable: false` and the canvas crops the rendered slide for it instead of
    guessing — a faithful picture beats a wrong drawing.
  - `fonts.py` serves Carlito/Caladea/Liberation under the *original* family name, so the browser
    measures Calibri text with Calibri's metrics. A family with no compatible face is reported as
    approximate rather than silently mismeasured.
  - `pptx_utils.py`'s editing primitives write through python-pptx's own element API; nothing
    hand-writes markup PowerPoint would have to repair.
  - `package_check.py` validates the produced .pptx **as an OOXML package** (RF-50): content types,
    relationship graph, `r:id` resolution, slide id list, shape id uniqueness, table grids, illegal
    XML characters, and — the one that actually bites — **child element order**. OOXML content
    models are sequences: an `<a:buChar>` written after `<a:defRPr>`, or an `<a:normAutofit>` after
    `<a:extLst>`, parses everywhere and makes PowerPoint offer to repair the file. It keeps its own
    copy of the sequences on purpose, so a bug in `pptx_utils` cannot hide in the auditor too.
  - **Never `parent.append(child)` into an OOXML element.** Use `pptx_utils.insert_ordered` /
    `replace_ordered` with the matching `SEQUENCES` entry; appending lands after whatever trailing
    sibling the template happens to carry.
  - **Never `copy.deepcopy` a row or a shape without `pptx_utils.refresh_extension_ids`.** A real
    PowerPoint template stamps `a16:rowId` on every table row and `a16:creationId` on every shape,
    and those identities must not repeat inside their parent. Cloning a prototype row — which is
    exactly what filling a table does — copied the id onto every new row, and PowerPoint answers
    with "problema com o conteúdo … tentar reparar". Decks built from `sample_template.py` never
    showed it because that template writes no extensions; only real corporate decks do.
  - **RF-89/RF-91 in `edits.py`**: `SlideEdits.locked` and `hidden` are editor-only lists like `groups`, so they are out of `replays()`/`touched()`. `SlideEdits.tables` (absolute column widths in EMU, `CellStyle` per `"row:col"`) *is* replayed, after the data and the typed cell text. `DeckEdits.for_slide` merges all three underneath a copy's own.
  - **RF-92**: `Binding.rules` (`FormatRule`) is evaluated by `layout.rule_matches` against the text the slide shows, first match wins. Generation (`_apply_rule`, and `_TableRow.fills`/`colors` for tables) and `resolve_preview` share it.
  - **RF-94**: markers take a modifier (`{{campo|contagem}}`, `|chaves`, `|lista`; `text.split_marker`/`marker_base`). Always resolve through `generate.render_marker`; anything that treats a marker as a variable name must strip the modifier first with `marker_base`. `expand_notes` fills notes after generation and again after the edit layer. `duplicate_slide` now copies speaker notes (repeated slides used to lose them).
  - `validate.py` runs the checks before a deck is delivered, after the edits are applied; the
    package check runs first and its failures are always errors, so a malformed file cannot be
    downloaded without `?force=true`. `cadencia check-deck <file>` runs the same check from the CLI.
  - `context.py` holds the field catalogue and the `DeckData` built by `analytics/deck.py`. Board-scoped fields are `board.*`; `espaco.nome` is the space and is what fills the template's "PROJECT NAME" slot. `num.*` are numeric twins of the summary counts, for the `number` mode's formatting. `LEGACY_FIELD_KEYS` keeps mappings saved under the old `time.*` keys working, so never drop an entry from it.
  - `texto.*` fields are **variables** (RF-45, RF-52), stored as a `variable` definition plus one
    `variable_value` per target and resolved **slide → board → space → global → the registration's
    own `default`**, narrowest first. A definition with `template_id` set belongs to that template
    alone and shadows a shared one of the same name; `template_id IS NULL` means every template
    sees it. `repo.resolve_variables` does the lookup; `repo.slide_variable_values` feeds
    `DeckData.slide_texts`, which `resolve()` consults *before* the board's own texts when
    generation passes the origin slide id. The prefix stays `texto.` on purpose — saved mappings
    and real templates already contain `{{texto.*}}`. They are not in `FIELDS`: the catalogue
    endpoint adds the stored ones, so `catalog()` takes extras rather than being a constant.
  - **RF-58: a variable can read from a Jira field.** `variable.source_field` holds a catalogue
    key, and the order is **slide → board → space → global value → the Jira field → the
    registration's `default` → MISSING**. A typed value is an override somebody made for one
    target, so it wins; the field is the variable's *meaning*, so it comes next; the literal
    default catches the board where the field is empty. An empty field is not an answer — it falls
    through to the default rather than printing a blank. `repo.resolve_variables` deliberately
    **leaves a connected name out of its result** (that layer has no board data), and
    `context._from_source` finishes the walk where the data is. `service.check_source_field`
    accepts only `text`/`number`/`status` kinds — a variable is one run of text and has nowhere to
    put rows or a series — and refuses a `texto.*` source outright, because a variable pointing at
    a variable could be pointed at itself and a cycle in `resolve` is an infinite loop on a user's
    deck. The manager resolves connected variables through `service.resolve_source_fields`, which
    calls the generator's own `resolve`, so the "resolvido" line is what the deck will really say;
    `from_source` on the endpoint marks which names came from Jira rather than from someone typing.
  - **Registration is the only thing that makes a variable exist, and the only place it may carry
    a default.** `spec_for(key, registry)` takes the registered names and answers `None` for a
    `texto.*` outside them — it no longer synthesises a spec for any well-formed slug, which is
    what used to make a typo indistinguishable from a real name. `DeckData.variables` carries that
    registry (built by `service.variable_registry`) and `DeckData.template_name` is there so an
    error can say which template the bad name appeared in. `resolve()` has three answers, and
    every caller must keep them apart: `(None, None)` is *not registered*, `(kind, MISSING)` is
    *registered, nothing filled it in, no default in the registration*, and anything else is a
    real value — including `None` for a board with no data and `""` for an empty somebody chose.
    Both faults are `ERROR_KINDS` (`variavel_nao_registrada`, `variavel_sem_valor`), so the deck
    cannot be downloaded without `?force=true`, and the marker is **left visible in the file**
    rather than collapsed to an empty string, which `validate.leftover_markers` then refuses too.
    `repo.resolve_variables` leaves a name with no answer *out of the result* instead of mapping
    it to `""`; that absence is the whole mechanism. `cadencia check-variables`
    (`service.audit_variables`) reports which templates would break and for which boards, and
    registers nothing on their behalf — inferring a registration from what a template happens to
    mention would rebuild the implicit registration one layer up.
  - **RF-59: variables are typed.** `VariableSpec.kind` is *derived* from `source_field` — never
    stored, because a stored kind disagrees with its source the moment somebody repoints the
    variable. A variable wired to `riscos.itens` is a `rows` variable that fills a table; one wired
    to `grafico.vazao` is a `series` variable that fills a chart; a hand-filled one is `text`,
    because words are the only thing a person can type into a box. `spec.typed` (kind != text) is
    the switch: a typed variable skips the slide/board/space/global walk entirely — its field is
    its only answer — and `service.check_writable` refuses a hand-written value for it, from the
    API rather than the store, because deciding it needs the field catalogue. `context._blank`
    judges emptiness *by kind*, so an empty `rows` is nothing while a `number` of `0` is something.
  - **An empty *source* is an answer; an unwired variable is not.** A variable reading from a field
    resolves to whatever the field says, including nothing — a sprint with no goal is data, and
    refusing the deck over it would make every optional field mandatory. It surfaces as the same
    `vazio` warning a direct field binding always produced. `MISSING`, and the refused deck, stays
    reserved for the case RF-45 was written for: a variable nobody wired to a source and nobody
    typed a value for. A registration `default` still catches an empty source when it has one.
    The golden snapshots found this during the RF-59 conversion; reasoning had missed it.
  - `Binding.variable` is the way a binding should be written now; `Binding.field` is the legacy
    catalogue path and still resolves. **`Binding.key` is what every resolver reads** — it returns
    `texto.<variable>` or `field`, so one spelling reaches `resolve`, the validators and the error
    messages. `cadencia migrate-bindings` reports what converting the legacy ones would do and
    writes nothing.
- **The refactor safety net (`make golden`).** `tests/test_golden.py` runs the whole pipeline —
  collector, analytics, `deck_data`, generation, the edit layer, validation — and compares a digest
  of the produced .pptx against `tests/golden/*.json`: every slide, shape, line of text, table cell
  and status fill. Unit tests say each piece works; this says the *same file* comes out. The
  `everything_at_once` case ends `ok: False` **on purpose**, pinning RF-45's refusal. Re-record
  with `make golden-update` and read the diff. `tools/golden_snapshot.py` does the same from
  outside for the corporate template, which is too big to belong in the suite.
  - **RF-63: `qr_code` mode.** `core/images.py` renders a value as a QR with `segno` — offline, so
    a deck built without a network is the same deck built with one. The scale is derived from the
    symbol's own module count rather than fixed, so a short link and a long one come out the same
    size on the slide instead of being rescaled again by PowerPoint. `place_picture(..., fit=True)`
    centres it at its own aspect ratio: a QR stretched out of square stops scanning. An empty value
    produces **no picture at all** and a `vazio` problem, because a QR of nothing is a black square
    that scans as an empty string — worse than a gap.
  - **RF-62: the status palette is configured once, in the variable manager.** `repo.deck_palette`
    reads it from `app_setting`; `DeckMapping.palette` / `status_labels` default to **empty** and
    are this template's *overrides*, merged underneath by `mapping.inheriting()`. Everything that
    resolves a colour goes through `service.load_mapping`, which does that merge — except
    `apply_binding_migration` and `apply_palette_migration`, which write the mapping back and must
    stay raw or they would bake the shared values in as an override. `suggest` records only what
    the template's legend actually names, so a mapping no longer carries a full copy that makes
    changing the shared setting do nothing. `cadencia migrate-palette` reports the mappings saved
    before this rule and `--apply` drops their redundant copies.
- **The Apresentação roadmap (#7–#30, the "30 features" round).** The ids below are that list's, not the PRD's.
  - *Data* (#1–#6): `analytics/deck.py`'s `board_deck(..., inputs=)` adds forecast (`previsao.*`, `grafico.previsao`), CFD and aging (`grafico.cfd`/`grafico.aging`), week-over-week deltas (`num.*_delta`, `tendencia.*`), changes since the last checkpoint (`mudancas.*`), epic plans (`plano.*`, `grafico.gantt`, `grafico.horas_por_papel`) and hygiene (`saude.*`). `JiraSource.inputs()` computes them; `Series.style` picks the renderer, and `scatter`/`gantt` (`RENDER_ONLY_STYLES`) are always drawn as pictures because no native chart holds them.
  - *Runs* (`ReportRunRow`, migration 0012): `kind` is `entrega` (the history), `previa` (#9, one board, pruned to `KEEP_PREVIEWS`) or `parcial` (#10, `parent_run_id`; `agora: true` is #27's "Atualizar números", the whole deck at the current instant). Review (#12) is `rascunho → em_revisao → aprovado | reprovado`; approval needs a valid run **and** no open comment on the template. `service.download_blocker` is the one place that decides whether a download needs `?force=true`: validation first, then `DeckMapping.require_approval`. PDF comes from `run_pdf` (#8). `compare_runs` (#11) diffs the text per produced slide.
  - *Sharing* (#14): `DeckShareRow`, a `token_urlsafe(24)` that expires and can be revoked. `/api/public/*` is the only unauthenticated surface — `TokenAuth` lets GET through under `PUBLIC_PREFIXES`, nginx turns basic auth off for `/api/public/`, `/shared/` (and the old `/compartilhado/`) and `/assets/` — and it answers a revoked or expired token exactly like an unknown one.
  - *Accessibility* (#15): `report/core/a11y.py` audits a scene (missing alt text, contrast under 4.5:1/3:1, title not read first). Every generation stores it in `validation["accessibility"]` plus `acessibilidade_*` warnings. Alt text is `cNvPr@descr` (`pptx_utils.alt_text`/`set_alt_text`); charts and QR codes get a generated one unless `Binding.alt_text` says otherwise, and `ShapeEdit.alt_text` overrides any shape.
  - *Library* (`report/library.py`, migration 0013): blocks (#16, shapes saved relative to their corner), asset labels and tags (#17), presence (#19, an **upsert** per heartbeat — two beats can race), per-slide history and restore (#20, which records the current edits as a version first), template diagnostics (#24) and usage (#30, from `validation["dropped"]` and `validation["presented"]`, keyed by produced slide key `origin:board:page`).
  - `CellScale` (#18) is drawn by `layout.scale_marks` for generation and preview alike; scales on one column chain (bar text, then arrow). `SlideMapping.only_audiences` (#25) is ANDed with the space/board scope, and a run with no audience keeps every slide. `SlideMapping.minutes` (#26) is read only by the presenter's timer. `NamedStyle` (#22) lives in `DeckEdits.styles` and, like `groups`, is never replayed. `Schedule.attach` (#13) makes e-mail carry the .pptx/.pdf, up to `MAX_ATTACHMENT`; webhooks always get the link.
  - *AI narrative* (#7, `report/narrative.py`): **off by default** (`CADENCIA_AI_ENABLED`, `CADENCIA_ANTHROPIC_API_KEY`, `CADENCIA_AI_MODEL`). It sends only the numbers in `FACTS` — never a name or an item title — returns a draft, and never runs during generation; the person saves the text as the board's value of the `narrativa` variable. An unavailable API is a 503 with `cause`/`action`, a model refusal is `Invalid`.
- **People and the Home mosaic.** `analytics/people_overview.py` is the one place a person's numbers for the current sprint come from — workload, deliveries so far, blocks, the last six sprints — aggregated across the boards in view (a person on two boards is one person: load and deliveries add up, capacity is counted once, on the board in a sprint). It returns numbers only; the People cards and the Home tiles draw from it and no card lists an item.
  - **Workload** = open hours ÷ capacity left. Open hours are the open `hierarchy_level == 0` items assigned to the person, `estimate × hours_per_point` (`unestimated_item_hours` when unestimated); capacity left is the working days from today to the end of the window × hours × focus, minus absences, times the person's availability. The window is the active sprint, or the working week when there is none — and also when a sprint is still open in Jira after its end date (`sprint_overdue`), which keeps its scope but counts capacity over what is left of the week. `state` is `acima` past `1 + overload_threshold`, `folga` under `1 + idle_threshold`, and `sem_estimativa`/`sem_capacidade` when the ratio would be a guess.
  - **A block** is any open item (subtasks included) whose risk evidence has a `bloqueio` rule — flag, blocking status or an open "is blocked by" link — *even when another situation ranks higher*, so an item that is both overdue and flagged still counts. Severity is the days blocked (under 2 low, up to 5 medium, more high, `people_overview.BLOCK_DAYS`); a block that is only a link has no start of its own and falls back to the last status change.
  - **`active`** (per person, `people_overview.has_activity`) is "has something in the sprint, or in the week on a board without one": any item they hold in the sprint's family at any level — subtasks included, open or done — or a delivery or commitment. It is deliberately wider than the load, which counts only stories, tasks and bugs: a team that plans in subtasks (the epic-plan demo) has no stories and is not idle. Blocks do not count, since they are read across every open item and not only the sprint's. The People page's "Só quem tem atividade na sprint" switch (on by default, remembered in `cadencia-pessoas-so-ativos`) reads it; `lib/people.visiblePeople` is the filter, and its `hidden` is people, not entries, because someone in two teams is listed under both.
  - `analytics/person_detail.py` (`GET /people/{id}/detail`) is where the lists live: items, epics, blocks, an in-progress→done timeline, capacity per sprint against committed and delivered hours, and the week as *signals* (`sobrecarga`, `bloqueios`, `atrasados`, `parados`, `vencendo`), each a count with a level — never a verdict. `GET /people/overview` is registered by `routes_people` **before** `routes_views` so `overview` is not read as an account id.
  - **Availability** is `person_availability` (migration 0014): the person's own hours per day and the share of their time given to these boards (`Availability(hours_per_day, allocation)`); no row means the board's numbers. It feeds `domain.capacity.sprint_capacity` for everything that reads it (the sprint capacity and allocation screens too), and absences stay in `absence` (`GET /absences?account_id=`). The epic plan's weekly hours per member are a separate, older setting and are not touched.
  - `analytics/pulse.py` (`GET /home/pulse`) is the team's own log: deliveries per day, what is due, and the delivered/blocked/scope-added events of the last 48 hours. `routes_home` keeps a Home layout per signed-in user in `app_setting` (`home.layout.<X-Remote-User>`); with no signed-in user there is one shared layout and the response says so (`shared`). Nothing is written to Jira.
- **The sprint timeline** (`analytics/sprint.sprint_timeline_view`, `GET /sprints/{id}/timeline`) is the work tree on a time axis: the same rows as `sprint_tree` (members, their subtasks and their ancestors), each with `start`, `end`, `state` (`concluido`/`andamento`/`bloqueado`/`aberto`), `carried` (work began before the sprint) and `added` (joined after it started). An item's bar runs from its first entry into a working status (its current run, when open) to when it was done; one that went straight to done is a point at that moment, one never started has no bar. An epic or group has no time of its own: it spans its children and ends only when every child has. Blocked means a `bloqueio` rule fired, even if a more severe situation ranks first.
- `demo.py` is a fictional Jira served through `httpx.MockTransport`. It is anchored to the most recent Thursday 15:00 in São Paulo and built so that each risk rule fires on a known key (CAD-11 carried over and stalled, CAD-12 aging, CAD-13 flagged, CAD-14 overdue, CAD-18 blocked by a link). Tests use `tests/support.py` with `NOW = 2026-09-10T18:00Z` and assert on those keys. `DemoJira(epic_plan=True)` (what `cadencia demo` uses) adds board 4 / space ANL with epic **ANL-1**, laid out for the epic plan; tests that do not ask for it see only boards 1–3, so the golden snapshots do not move.
- **Epic plan** (the epic page's *Plano* tab; spec in the pt-BR prompt, not the PRD, so no RF ids). The **subtask** is the atomic unit of estimate, allocation and dependency; a task is only the sum of its subtasks.
  - Read from Jira, never from a file: tasks are the epic's standard-level children, subtasks theirs (`repo.epic_issues`, across boards). Hours come from the source `Parameters.hours_source` names (`fonte_horas` on the wire): the **original estimate** (`Issue.original_estimate_hours`, from `timeoriginalestimate`) or the **estimate field** (`Issue.estimate`, where story points live) — real teams fill hours in the latter, and the one production instance does. A subtask's **roles**, first answer wins: chosen by hand in Cadência (`subtask_role`, migration 0011, `PUT /api/subtasks/{key}/roles`; Jira stays read-only); roles whose `labels` match its Jira labels/components; its **assignee's** role when that person is on the team with one role (with several, the one the task also has); the task's role when the task matches exactly one. `Subtask.role_source` records which. Two roles = a composite "A + B". Real boards label by product, not by role, so labels alone never resolved a single subtask there: the assignee and the manual choice are what make the plan work on real data. Kind and phase come from labels named in the parameters (`code-review`, `cadastro-jira`, `planejamento`, `sem-codigo`). "Is blocked by" links are prerequisites, and a link to or from a *task* stands for all its subtasks. Negócio/Técnico/Dependências are description sections found by heading (`jira/mapping.adf_text` keeps headings as `#` lines). Every fallback that changes a number leaves a `Problem` (`erro` blocks schedules, `aviso` informs), **one per kind** naming every subtask — one line per subtask buried the fix. The view's `diagnostico` (hours found per source, subtasks without a role and why, role origins, team size) drives `PlanReadiness`, the checklist shown instead of the Gantt, with one button per fix.
  - `domain/epic_plan/` is pure: `model` (entities, `Parameters`), `hours` (every section-5 number once: hours, person-hours with the full hour per role of a composite, the reconciliation, capacity), `graph` (derived task deps, cycles, layers, critical path), `schedule` (time model, **validator**, list scheduling, baseline), `timeline` (days, weeks, per-task bars), `from_jira`, `source` (the `EpicSource` port; `analytics.epic_plan.epic_source` is the one line to change for another source), `seed` (starting roles, seeded once).
  - **Time is slots of working time** (`slot_hours`, 0.5 h) from slot 0 = the plan's first Monday; everyone works the same Mon–Fri workday, so a subtask across midnight is just a contiguous interval, and baseline, greedy, MILP and CP-SAT solve the same MS-RCPSP. Days and weeks exist only for drawing. Semana 1 is the week the first execution subtask starts; earlier weeks are −1, −2…
  - The **baseline** is list scheduling with one virtual worker per role (`papel:<id>`); both schedule tabs draw it, so their totals agree by construction.
  - `planner/` holds `solvers` (CP-SAT; MILP as big-M disjunctive over MathOpt/HiGHS) and the `strategies` registry the picker reads: a new strategy is one `register` call. Both solvers start from the greedy plan (horizon + hint), so an answer is never worse than it. OR-Tools is imported lazily; without it they raise `SolverUnavailable`, which the API turns into a 503 while the greedy keeps working.
  - Every plan, whoever produced it, goes through `schedule.validate` before it is kept; an invalid one comes back `invalido` and is never stored. The latest valid run per epic (`epic_plan_run`) carries a `fingerprint` of its inputs; when Jira, the team, the selection or the parameters change, the page falls back to a greedy plan computed on the spot (`origem: automatico`).
  - **Roles and the team are managed on the person's page, not in the plan.** The plan's *Papéis e equipe* section moved there: the data was never the epic's (`member_role` is keyed by person; only who is available per epic, `plano.selecao.<EPIC>`, is per epic), only the form lived in the plan. The plan reads them, and `PlanReadiness` links to `/people`.
  - Store: `role`, `team_member` (a Jira person + `active`), `member_role` (seniority is informative only), `epic_plan_run`; parameters in `app_setting` `plano.parametros`, the member selection per epic in `plano.selecao.<EPIC>` (one selection shared by the capacity and planning sections). Migration 0010. `analytics/epic_plan.py` builds the whole page (`GET /api/epics/{key}/plan`); JSON keys are Portuguese on purpose, because the planning contract (`POST /api/planning` → `{status, gap, makespan_dias, alocacoes}`, plus `epico` in the request) was specified that way.

## Frontend (`web/`)

React 19, Vite 8, TypeScript 7, Mantine 9, TanStack Query 5, TanStack Table **v9**, react-router 8 and ECharts 6. These versions are newer than most examples online.

- TanStack Table v9 uses `useTable({ features, columns, data })` with `tableFeatures({ rowExpandingFeature, expandedRowModel: createExpandedRowModel() })` and `<table.FlexRender>`. The migration guide is in `node_modules/@tanstack/react-table/skills/`.
- Shared filters (`board`, `person`, `type`, `start`, `end`, `situation`) live in the URL. `lib/filters.ts` `carry()` keeps them on drill-down links. The active tab is the `?tab=` param.
- Colour marks state only. Risk badges always pair an icon with a label (`components/risk.tsx`). People lists are alphabetical. Keep the heuristic disclaimer next to allocation numbers.
- **Visual system** (`theme.ts` + the token block at the top of `styles.css`). Surfaces are layered: the page is tinted (`--app-bg`), cards sit on it (`--surface`), quiet bands and asides are sunken (`--surface-sunken`), hairlines are `--border-soft`; each token has a dark twin, and the dark scheme's `dark` palette leans towards the petrol accent. Global rules do most of the work, so prefer them to per-screen styling: every `Paper withBorder` is a card, a `Table` not already inside a card becomes one, table heads are small caps on a sunken band, badges are sentence case and never clip their word. Indicators go through `KpiCard` (`Stat` is a thin wrapper) — never a hand-built `Text size="xs" c="dimmed"` label. `Note` is a quiet aside, not a coloured slab. `.page` caps the content at `--page-max` and centres it; `/presentation` opts out with `is-wide` because the editor needs the room. The shell groups navigation (Acompanhar / Entregar / Sistema) and shows the oldest collection across boards in the header (`CollectionPill`), which is why `Freshness` on each page is now a one-line dot plus the alerts that matter.
- `src/api/types.ts` mirrors the backend responses by hand. Update it when a view's shape changes.
- **i18n** (`src/i18n`). One typed catalogue per namespace and area: `locales/en-US/<ns>.ts` is the shape and `pt-BR`/`de-DE` must match it, so a missing key fails `tsc`. Components read `const t = useT()`; code outside React calls `t()` at use time — never module-level text, which freezes the first language. Anything with a parameter or a plural is a catalogue function that words the whole sentence. Dates, numbers and sorting go through `lib/format.ts` and `collator()`/`currentLocale()`, never a hard-coded `'pt-BR'`. Requests send `Accept-Language`; a link the browser opens itself (exports, downloads) adds `?lang=` through `withLang`. `npm run i18n:scan` lists the Portuguese left.
- **RF-70: the deck is downloadable from where it was edited.** `downloadUrl` is the one helper —
  the menu's *Baixar .pptx* and the run result both use it — and it appends `?force=true` for a run
  the validation refused, because the deck somebody needs to open to understand what is wrong with
  it must not be the one they cannot have. The marker stays visible in the file (RF-45), so a
  forced download is obviously unfinished rather than quietly so. The generate drawer shows the
  RF-66 readiness report *before* the button: generation would refuse those anyway, and saying so
  first is the difference between a check and a rejection.
- **RF-69: "Mapeamento avançado" is gone, and so are `SlideMap` and `SlideCanvas`.** The screen's
  slide previews became the editor canvas (RF-61), its status colours the variable manager (RF-62)
  and its per-binding editor the properties panel, which left duplication and one genuinely useful
  thing: seeing every binding at once. That is `BindingsPanel` in the editor's right rail, where a
  row selects the shape on the canvas — list and slide stay the same object. `LayoutOptions` (the
  UI for `layout.py`: sort, cap, clip, case, affixes, number formats) **moved rather than being
  deleted**: those options live in the saved mapping and go on applying at generation, so removing
  only the controls would have left settings nobody could see or change.
- The live preview POSTs the **draft** mapping, debounced 350 ms, and its items are index-aligned with `bindings`; always check `item.target === binding.target` before using one, because the debounce can lag an add or a remove.
- `PresentMode` presents from the browser: arrows/space, `g` grid, `n` notes, `f` full screen, `Esc` out, plus a talk timer.
- Templates are managed from the header menu (**Gerenciar modelos**, `TemplatesDrawer`): upload with
  an optional name, and delete. Deleting a template takes its mapping and its manual edits with it —
  they are meaningless alone — but **never the generated runs**: a delivered .pptx stands on its own,
  so `run_scene` falls back to no theme and no bound-field marks and reports `template_deleted`.
  The template store is content-addressed, so re-uploading the same bytes returns the existing row.
- **RF-67: a menu bar, then a toolbar, then the canvas.** `DeckMenuBar` sorts the commands by what
  they act on — Arquivo (the deck as a file), Editar (the mapping), Ver, Apresentar — instead of
  the three buttons and a ⋯ menu that used to put "upload a template" beside "undo". **Gerar stays
  a visible button**: it is the one action the whole screen exists to reach. Fullscreen is
  `useFullscreenElement` on the surface, bound to F11 — the browser's own fullscreen hides the app
  chrome without giving the canvas the room. Presenting to a room stays `PresentMode`, which needs
  a rendered run and therefore lives where the runs are; the menu points at it rather than building
  a second path to it.
- **RF-68: the filmstrip collapses.** `usePanelWidth` keeps `collapsed` in `localStorage` beside
  the width, and the width **survives the collapse**, so expanding restores the panel somebody
  sized rather than the default. Collapsed it is `RAIL_COLLAPSED` wide and shows "Miniaturas"
  reading left-to-right with an icon — a rotated label saves pixels and costs a head tilt, and this
  panel is opened and closed often enough that the tilt is the expensive part. The splitter is not
  rendered while collapsed: a resize handle on a fixed strip is a lie.
- Apresentação is **one surface**, not five tabs (RF-49): the editor canvas is the page, and the
  template file, the variables, the deck rules, advanced mapping and the generation history are
  drawers off the header menu. Mapping and editing are the same act on the same object, so
  `ContentSection` in the properties panel chooses where a shape's content comes from — typed
  here, a data field, or a variable — while the sections below it move and style it.
- Variables are managed in `VariablesDrawer` (RF-52), not inside a space screen: create or rename
  the name, bind it to this template or leave it shared, and set a value at any of the four levels.
  The target pickers at the top (espaço / board / slide) drive `useVariables`, so the "resolved"
  line under each variable is the value that target will really get. A space owns its boards, so
  choosing a space filters the board picker to that space and drops a board it no longer owns; the
  value editor has no space of its own and groups its boards by space instead of filtering them.
  The **padrão** (global) level is always visible — a row of its own in each variable's table even
  when unset, plus a "sem padrão" badge — because it is the one value every target falls back to,
  and `winningValue` repeats `repo.resolve_variables`' walk client-side to name the level that
  answered. Components take a `variables` prop of `{ name, label }[]`, which is
  `useVariables(...).data.items`.
- `SlideStage` is the **only** renderer, in `mode="edit"` or `"preview"`, plus `chromeless` for a
  thumbnail. Do not add a second one: three disagreeing renderings of the same slide is the bug
  RF-48 existed to remove. The filmstrip (`SlideRail`) draws its thumbnails with it rather than
  fetching rendered images, which is why they follow an edit as it is typed. The rail also takes
  `live` — the open slide's shapes including text still in the overlay's draft — because a draft
  does not become an override until the box is left.
- **RF-61: the template is a scene too.** `GET /reports/templates/{id}/scene` reads the template
  through the very same `scene.deck_scene` a run uses — a template is just a .pptx nothing has
  filled in yet, so it passes no `produced` entries — and the editor opens it whenever there is no
  run. That replaced the 90-dpi LibreOffice PNG with clickable boxes drawn over it; the corporate
  template comes back as 70 shapes, all renderable, 29 of them inside groups, with its theme and
  its already-bound areas marked. **The stage finds its own pictures**: `scene.run_id` or
  `scene.template_id` gives `imageBase`, so there is no `runId` prop to forget — forgetting it used
  to drop every image in the deck silently. LibreOffice rendering survives only as the raster crop
  for shapes the model cannot draw honestly (`renderable: false`).
- **RF-64: an edit made on the template is the slide's design.** It is stored under the wildcard
  key `origin:*:*` (`edits.template_slide_key`, mirrored by `deckEdits.templateSlideKey`), and
  `DeckEdits.for_slide` merges it *underneath* whatever a produced copy says — so a template change
  reaches every board and a board's own tweak still wins, shape by shape. Merging in `for_slide`
  rather than at each call site is what keeps `apply_shape_edits`, the validator and the canvas
  from each having to remember the rule. In the editor, `editKey` decides where a write lands:
  `current.key` on a run, the wildcard on the template. **Reads go through `slideEdits`, writes
  through `editKey`** — mixing them up is how a template edit ends up invisible.
- **RF-65: slides can be named.** `SlideMapping.name`, empty falling back to the template's own
  headline, so a mapping saved before this reads exactly as it did. The name is also written into
  `<p:cSld name>` at generation, with the board appended on a repeated slide — thirty copies of
  "Resumo" are unfindable in PowerPoint's selection pane otherwise. Renaming is inline in the
  filmstrip and is per *template* slide, so every copy is named at once.
- **RF-66: `GET /templates/{id}/readiness`** says, per slide, which variables cannot be filled and
  for which boards, before anything is generated. The editor marks the thumbnail and shows one
  deck-wide alert; the sentences are built in `DeckEditorTab` so the badge and the alert cannot
  describe the same problem differently.
- A thumbnail's memo cannot compare `edits.slides[key]` by identity: `withShapeEdit` clones the
  whole document, so every slide's entry is a new object after any edit. It compares the JSON,
  which is a few hundred bytes against a full Konva re-layout.
- Side panels are resizable (RF-54). `PanelResizer` is a flex item **between** the columns, never
  an overlay inside a panel — `overflow: hidden` would clip it and it would land on the rail's own
  scrollbar. It reports at most once per `requestAnimationFrame`, and `usePanelWidth` keeps the
  width in ordinary state during the drag, writing `localStorage` only on release. Widths are
  resolved in order (rail against the panel's wish, panel against the resolved rail) so
  `MIN_CANVAS` survives both being dragged out at once; `CHROME` counts the splitters and gaps.
- `lib/textLayout.ts` measures each run with its own font on a real canvas and packs words into
  lines, which is what makes the wrap match the export once `fonts.ts` has loaded the
  metric-compatible faces.
- The **Editor** (`DeckEditorTab`) opens a generated run: `SlideStage` (react-konva) draws the scene from its EMU geometry at one scale factor, so on-screen position, size and rotation are the file's own numbers — a probe shape measures within 0.25 px of its EMU box at 144 dpi. `lib/emu.ts` holds the conversions; never store CSS pixels, always EMU integers.
- RF-53 shapes the editor like Google Slides and PowerPoint Online, because that is what people
  already know: typing happens on the slide (`TextOverlay`, a textarea laid over the shape's text
  frame with its own insets, anchor, font and rotation, while `SlideStage` stops drawing that
  shape's text), one `EditorToolbar` answers to the selection and applies to *every* selected
  shape, right-click opens `CanvasMenuItems` through Mantine's `Menu.ContextMenu`, the canvas fits
  the window by default (`zoom: number | 'fit'`, Ctrl+scroll to zoom), and saving is automatic
  after `AUTOSAVE_MS`. A rejected save is attempted **once** per document — `attempted` guards the
  409 retry loop — and the explicit button plus Ctrl+S stay for saving on demand.
- The overlay is a plain textarea on purpose: paragraph runs survive because `setText` re-applies
  each original paragraph's style to the line replacing it. Restyling *inside* a paragraph is the
  toolbar's job, where it cannot corrupt run boundaries. Double-clicking an autoshape with no text
  frame still gets a caret — an autoshape always has a `txBody`, so the words do reach the file.
- Format controls live in `components/editor/textFormat.ts` (`FONTS`, `ALIGNS`, `paragraphsOf`,
  `patchedParagraphs`). The toolbar and the properties panel both import them, so the two views of
  the same control cannot drift apart.
- Selection follows the products' rule: mousedown keeps an existing multi-selection so the group can
  be dragged as one (`onChangeMany`, one undo step), and a click that did not drag narrows it to the
  shape under the pointer. Dragging on empty canvas is a marquee.
- **Grouping is selection state, not geometry.** `SlideEdits.groups` maps an editor-invented id to
  the member shape keys and nothing else; `expandSelection` turns a click on one member into the
  whole group, which is why a narrowing click cannot break a group apart. A real `<p:grpSp>` would
  give its children coordinates *relative* to the group, and this document is absolute overrides on
  purpose, so `apply_shape_edits` ignores `groups` and `touched()` leaves it out — a document
  holding only groups has nothing to replay. Ungroup is two different things behind one command:
  a **template** group goes into `ungrouped` (dissolved in the file so its children become
  editable), a **selection** group is simply dropped.
- **The variable manager is the only place the field catalogue is browsed (RF-56).** There is no
  "Campo de dados" Select any more — in the properties panel or in the advanced mapping row. Both
  open `FieldPicker`, which wraps `FieldCatalog`, which is also the manager's "Campos do Jira" tab;
  `MODE_KINDS` lives there too, so nothing can drift about which modes a kind can fill. The
  catalogue travels on `GET /reports/variables` (`service.field_catalog`) beside `items`, with each
  entry's `origin` marking `jira` or `variavel`. **Fields keep their kind**: a catalogue entry can
  be rows, groups, a series or a status, and turning them into text variables would throw away
  every table and chart binding the deck has, so the two stay separate things in one browser.
  `service.variable_conflicts` reports a name registered twice (and would report a collision with a
  catalogue key) rather than resolving it by overwriting; the manager shows them in an alert.
  `ContentSection` still filters `texto.*` out of the picker, so a variable reaches a shape through
  the "Variável" segment alone, and a mapping that still binds a `texto.*` keeps working with a
  one-click move to the literal form.
- **One status-colour form, in `components/StatusPalette.tsx`.** It existed twice, byte for byte —
  the advanced mapping screen and the deck rules — each writing to its own template's mapping, so
  "the green" meant whatever the last person typed in whichever screen they opened. The manager's
  "Cores do semáforo" tab edits the shared configuration; the deck rules edit this template's
  overrides and show what is inherited; the mapping screen shows a read-only `StatusLegend`.
- **RF-57, the marcador/valor toggle, is a lens and never a write.** `lib/variableDisplay.ts`
  builds a *display copy* of the shapes from the scene plus the mapping; `shapes` stays the
  editable truth and everything that saves reads it, while `drawn` is only what the canvas and the
  filmstrip draw. `openText` refuses to open on a bound shape while the tokens are showing, which
  is what makes it impossible to commit a token as a manual override. In value mode a bound shape
  that came out empty, or that still carries an unsubstituted `{{marker}}`, is flagged and outlined
  — `ShapeNode`'s `flag` — because a hole is exactly what the eye skips.
- **RF-55: a slide can belong to some spaces/boards and not others.** `SlideMapping.only_spaces` /
  `only_boards` are ANDed and **empty means everywhere** — the default for a new slide, and already
  what every older mapping says, so no upgrade can silently drop somebody's slides and narrowing
  one is always a decision. `SlideMapping.covers()` is the single predicate; `repeat_targets`
  filters the audience with it, `_out_of_scope` handles deck and board slides (a deck slide is kept
  when *any* board in the run is in scope), and a repeat block filters per member, so one slide of
  a block can sit a board out. `DeckMapping.space_keys` narrows the whole run's boards.
  `SlideScope` is the one control, used by the editor's properties panel (with nothing selected,
  where it answers for the slide) and by the advanced slide settings; `SlideRail` shows an "escopo"
  badge whose tooltip names who actually gets the slide.
- Editor state is `scene` (server baseline, never mutated) + `DeckEdits` (overrides) merged by `lib/deckEdits.ts`. Undo/redo is a stack of whole documents; saving sends `base_revision` and a mismatch returns 409 rather than clobbering.
- **RF-71 … RF-100 on the client.** The hooks are in `api/featureHooks.ts`. The global pieces mounted in `App.tsx` are `CommandPalette` (Ctrl+K), `ShortcutsHelp` (`?`, reading the single registry in `lib/shortcuts.ts`, so add every new shortcut there), `Announcer` (`announce()` for the polite live region) and `useApplyPreferences` (`lib/preferences.ts`: density, chart patterns, reduced motion; per browser). `/present/audience` renders outside the shell, as the audience window of `PresentMode`, and syncs over `BroadcastChannel` (`lib/presentChannel.ts`). In the editor, the right rail has three modes (Propriedades, Comentários, Localizar). `lib/findReplace.ts` and `lib/formatPainter.ts` are pure. Fix-it links arrive as `?slide=` (slide key or template slide id) and `?shape=`, which the editor consumes and clears. After a version of the edits is restored, `DeckPage` remounts the editor with a new `key`, because the editor seeds its edits only once per template.
- **People and Home on the client.** The People page is `PersonCard`s (`components/people/`): a role-coloured edge (the role's identity, its name is on the card too, so it is not a grade), a load gauge, deliveries, blocks and past sprints — numbers only, alphabetical, with the "para conversar, não para avaliar" note kept. `indicators.tsx` holds the gauge, block summary and past-sprint bars shared with the Home tiles, so a state means the same everywhere. A person's page is a summary of the same four groups plus `?tab=` Semana / Trabalho / Timeline / Capacidade / Histórico / Função (`PersonWeek`, `PersonWork`, `PersonTimeline` — percent-positioned bars, striped as well as red when blocked, key-only on a phone — `PersonCapacity`, `PersonRoles`). Function and its description live in `PersonRoles`; the role *catalogue* (name, colour, Jira labels, order) is shared, so it is a drawer (`RolesCatalog`, "Funções e equipe") off the People page and the person's page. A role's description belongs to the role: the form says how many people it changes.
- **Finish, and the rules that keep it.** Text never says "item(s)"/"item(ns)": the catalogue entry takes the count and calls `plural` (and writes the agreement by hand where a verb follows, "1 erro impede" / "2 erros impedem"). A label with an "i" goes through `Tipped` so the icon travels with the last word and never sits alone on a wrapped line. `KpiCard` gives the label the full width and puts `aside` (a sparkline) on the number's row, so the numbers of a row of cards line up; keep labels short enough to stay on one line. `PageHeader` sets the browser tab's title (`Título · Cadência`; pass `documentTitle` when `title` is not plain text). A row of cards that must align (the People cards) has one-row headers: truncate, and put the rest in a tooltip. `useScrollHints` (mounted once in `App`) marks every scrolling table container with `data-more-left/right` and the CSS shades that edge; the shade is an overlay because table rows have their own backgrounds. On a phone every tab bar is one row that scrolls sideways. `FetchBar` shows a thin bar only for queries that have no data yet (a silent refresh never shows it) and only after 200 ms. The Home shows `MosaicSkeleton`, blocks at the tiles' own sizes, while it loads, so nothing jumps; a tile with nothing to say uses `TileEmpty`.
- **Every indicator says how it is calculated.** `components/common.tsx`'s `InfoTip` is the "i" beside a label, and `KpiCard`/`Stat` take `help`. The wording lives in one place, the `shell.help` catalogue read through `lib/indicatorHelp.ts` (`HELP`, keyed like `person:load` or `tile:team:blocks`), so it reads as one voice and a test (`indicatorHelp.test.ts`) fails when a Home tile is added to `lib/mosaic.ts`'s `CATALOG` without an explanation. **When you change how a number is calculated, change its text there, in all three languages**: the help states the rule the code follows — what counts, over what, and the thresholds (110% / 80% for load, 2 / 5 days for block severity) — and it is the only place a reader can see them. `InfoTip` is a button, not a hover-only mark: it opens on hover and on focus, a click pins it open (a tap on a touch screen, where hover does not exist and Mantine's own touch mode closes it when the finger lifts) until the next tap elsewhere or Escape. Inside something already clickable use `nested`, or the "i" becomes a button inside a button. A blank line in a help string starts a new paragraph.
- **The sprint timeline on the client** (`components/SprintTimeline.tsx`, tab `?tab=timeline`, `lib/sprintTimeline.ts` pure and tested). The axis is whole days (midnight to midnight) so gridlines, day labels and shaded weekends share boundaries, and stretches to today when a sprint runs late. Bars are positioned in percent of the axis, so the tree resizes without measuring; the search keeps everything under a hit and the path up to it, and a state filter keeps an item that has the state or has a subtask that does. Blocked bars are striped as well as red and a diamond marks a due date: state is never told by colour alone. It reuses the `.tl-*` classes of the person timeline; on a phone the label is the key alone and only the first and last days are dated.
- **The Home mosaic** (`pages/DashboardPage.tsx`, `components/home/`, `lib/mosaic.ts`). `lib/mosaic.ts` is pure and tested: tile state, `CATALOG`, size → column span per breakpoint (`spanFor`), move/resize/toggle, and `normalize`, which **keeps a tile of an unknown type** so an older client never deletes a newer tile. A tile is a component in `tiles.tsx` keyed by `type` in `TILE_VIEWS`; adding one is a `CATALOG` entry plus a view. One tile per type (the id is the type). Sizes are P/M/G (3/6/12 of 12 columns; on a tablet P is half; on a phone everything is a row) — chosen over free-form resizing because it stays legible when the screen narrows. Edit mode adds a strip per tile with drag, size, earlier/later arrows and remove, so everything a drag does has a keyboard path, and the tile body goes `inert`. `useMosaic` shows changes at once and saves 500 ms after the last one; the default arrangement imports the old RF-97 localStorage layout (`cadencia-painel-layout`) once.
- **The Boards page** (`/boards`, `pages/BoardsPage.tsx`, `components/boards/`, `lib/boards.ts` pure and tested) replaced the Flow page. On top, one grid of `BoardCard`s, one per tracked board from `GET /dashboard`, sorted by space then board name (no space last) with the space named on each card; cards in a row share a height and their footers line up; filtered client-side by a search and by `?kind=scrum|kanban` — `kind`, never `type`, which stays the work-item filter of the flow metrics. Cards reuse the Home's pieces (`components/home/parts.tsx`: `FreshnessDot`, `Throughput`, `Sparkline`, `elapsedOf`). Below, `FlowSection` (`id="flow"`) is the old page minus the per-person table; `/flow` and `/fluxo` redirect to `/boards#flow`, a card's "Flow metrics" sets `?board=` with `#flow`, and the section scrolls itself into view once the cards and its data have rendered. The backend's `/flow` `people`/`note` and the `flow_people` export are no longer read by the UI.
- **Epic plan UI** (`components/epicPlan/`, hooks in `api/planHooks.ts`): `EpicPlanTab` opens on `PlanSummary` (the answers) and ends on the configuration (subtask roles, Jira problems, parameters collapsed to a summary line); the sticky index is grouped the same way and marks the section in view (`IntersectionObserver`). Each section is a `PlanSection`. `WeeklyGantt` fits the whole plan to its card by default (Ajustar / Dias / Horas). It draws; it does not compute — every number, label like "19h · 3d 1h" and duration comes from the API, and the client only turns hours into pixels. `WeeklyGantt` is the one Gantt (baseline tabs and the plan), `MemberSelection` the one selection (chips in capacity, a list in planning, same server state). **Role colours are identity, an agreed exception to "colour marks state only"**: a role's colour always travels with its name (`RoleChip` is tinted and edged, its text stays the page's text colour), and bar text picks black or white by contrast. Every write invalidates the whole plan view, because any of them can change every section.
- **The Apresentação roadmap on the client.** Hooks are in `api/deckHooks.ts`; `runFileUrl(run, 'pptx' | 'pdf', force)` replaced `downloadUrl`, and `needsForce` mirrors `download_blocker`. `components/deck/` holds `RunPanels` (downloads, review, share, compare, partial, preview, a11y list), `TemplatePanels` (diagnostics, a11y, usage, narrative), `TemplateWizard` (#23, opened by `?wizard=1` after an upload) and `DeckViewer`, a read-only deck on `SlideStage` used by the preview and by `/shared/:token` (`SharedDeckPage`, outside the shell like the audience window; fonts come from `/api/public/fonts`). `lib/commands.ts` is how a screen offers commands to Ctrl+K: `useRegisterCommands(source, commands)` while mounted, run through a ref so it never goes stale. `PresentMode` adds a per-slide clock against `minutes`, "Atualizar números", an evidence panel of issue keys (`issueKeys`), pen and laser (`InkLayer`, fractions of the slide, sent over the channel as `ink` messages) and reports seconds per slide to `recordPresentation` when it closes.
- `/boards` is paginated but ordered by space first, so the grouped tables (Configuração, Status) show contiguous groups; a space straddling a page boundary simply repeats its header.
