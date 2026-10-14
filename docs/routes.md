# Routes are English

Every URL Cadência answers — web app paths, `?tab=` values, query keys, and `/api` paths — is
English. Older Portuguese URLs keep working through redirects, because bookmarks, saved views,
e-mails and shared deck links already carry them. JSON keys are **not** routes and are unchanged
(the planning contract's Portuguese keys stay, see CLAUDE.md).

## Web app paths

| old | new |
|---|---|
| `/inicio` | `/getting-started` |
| `/minha-semana` | `/my-week` (→ `/people?tab=my-week`) |
| `/fluxo`, `/flow` | `/boards#flow` (the flow metrics became the second half of the Boards page; the query is kept) |
| `/pessoas`, `/pessoas/:accountId` | `/people`, `/people/:accountId` |
| `/apresentacao` | `/presentation` |
| `/apresentar/plateia` | `/present/audience` |
| `/timeline-foco` | `/focus-timeline` |
| `/configuracao` | `/settings` |
| `/configuracao/assistente` | `/settings/wizard` |
| `/compartilhado/:token` | `/shared/:token` (public, outside the shell) |

`/`, `/status`, `/boards` (`?kind=scrum|kanban`), `/boards/...`, `/issues/:key` are already English.

## Query keys

| old | new | where |
|---|---|---|
| `modelo` | `template` | `/presentation`: the open template |
| `forma` | `shape` | `/presentation`: the shape a fix-it link selects (with `slide`) |
| `assistente` | `wizard` | `/presentation`: the template wizard (`=1`) |
| `ausencias` | `absences` | `/people`: the absences drawer (`=1`) |
| `funcoes` | `roles` | `/people`: the roles-and-team drawer (`=1`) |
| `perfil` | `profile` | `/settings?tab=profile`: the board whose profile is open |
| `canal` | `channel` | `/present/audience`: the presenter's BroadcastChannel id |

Renamed on any screen; when both spellings are present the English one wins. Already English and
unchanged: the shared filters `board`, `person`, `type`, `start`, `end`, `situation`, plus `tab`,
`run`, `slide`, `sprint`. Filter *values* are not routes: `situation` carries the API's risk enum
(`bloqueado`, `atrasado`, …) and stays as it is.

## `?tab=` values

Translated per screen (the same word can mean a different tab elsewhere), in `LEGACY_TABS` of
`web/src/lib/legacyRoutes.ts`. A value not listed for that screen is left alone.

| screen | old → new |
|---|---|
| `/people` | `minha-semana→my-week` |
| `/people/:accountId` | `semana→week`, `timeline` (same), `capacidade→capacity`, `historico→history`, `funcao→role` |
| `/boards/:boardId` | `visao→overview`, `arvore→work-tree`, `riscos→risks`, `fluxo→flow`, `sprints` (same), `mudancas→changes` |
| `/boards/:boardId/sprints/:sprintId` | `visao→overview`, `arvore→work-tree`, `timeline` (same), `riscos→risks`, `mudancas→changes`, `compromisso→commitment`, `planejamento→planning` |
| `/boards/:boardId/epics/:epicKey` | `visao→overview`, `plano→plan` |
| `/status` | `coleta→collection`, `saude→health` |
| `/settings` | `conexao→connection`, `calendario→calendar`, `coleta→collection`, `email` (same), `ia→ai`, `geral→general`, `boards` (same), `campos→fields`, `perfil→profile`, `notificacoes→notifications`, `plano-epico→epic-plan`; `ausencias` → `/people?absences=1` |

The person page never had a separate *Trabalho* tab (the open work sits under *Week*), so there is
nothing to map for it.

Tabs that live in component state and never reach the URL were renamed too, so no Portuguese tab
id is left in the code: variable manager `variaveis/campos/cores → variables/fields/colors`;
editor library `imagens/blocos → images/blocks`; find and replace `variaveis → variables`; epic
plan pipeline `tarefas/subtarefas → tasks/subtasks` and schedule `tarefa/subtarefa → task/subtask`;
roles catalogue `funcoes/equipe → roles/team`. They need no redirect.

## How old URLs keep working

- **Web app:** one pure function, `normalizeLegacyUrl(pathname, search)` in
  `web/src/lib/legacyRoutes.ts`, maps an old path, query keys and tab values to the new URL; the
  router redirects (`replace`) when it returns something different. Tab values are normalised there
  too, so any stored URL with an old tab still lands. A page that became a *section* of another
  (`/flow`, `/fluxo`) is mapped only as an exact path and carries its anchor (`#flow`); every other
  redirect keeps the URL's own hash.
- **Stored URLs:** migration `0023` rewrites `saved_view` paths and query keys (paths and keys only;
  old tab values are normalised by the web app at runtime).
- **nginx:** `/shared/` and the old `/compartilhado/` both bypass basic auth.
- **API:** old Portuguese `/api` paths answer **308** to the new path (method and body preserved).

## API paths

| old | new |
|---|---|
| `/api/papeis`, `/api/papeis/{role_id}` | `/api/roles`, `/api/roles/{role_id}` |
| `/api/membros`, `/api/membros/{account_id}` | `/api/members`, `/api/members/{account_id}` |
| `/api/planejamento` | `/api/planning` |
| `/api/planejamento/parametros` | `/api/planning/parameters` |
| `/api/planejamento/algoritmos` | `/api/planning/algorithms` |
| `/api/epics/{key}/plano` | `/api/epics/{key}/plan` |
| `/api/epics/{key}/plano/selecao` | `/api/epics/{key}/plan/selection` |
| `/api/subtarefas/{key}/papeis` | `/api/subtasks/{key}/roles` |
| `/api/reports/templates/{id}/clonar-mapeamento` | `/api/reports/templates/{id}/clone-mapping` |
| `/api/reports/palette/acessivel` | `/api/reports/palette/accessible` |
| `/api/reports/runs/{id}/reassociar` | `/api/reports/runs/{id}/reassociate` |

OpenAPI tags are English too.
