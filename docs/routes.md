# Routes

Every URL Cadência answers — web app paths, `?tab=` values, query keys, and `/api` paths — is
English. Older URLs keep working through redirects, because bookmarks, saved views, e-mails and
shared deck links already carry them: first the Portuguese ones, then the pages that moved in the
October 2026 restructure (spaces, a board page that no longer redirects, epics off the board path,
the Presentation split, one setup flow). JSON keys are **not** routes and are unchanged (the
planning contract's Portuguese keys stay, see CLAUDE.md). What each page shows is in
[pages.md](pages.md).

## Web app paths

| page | path |
|---|---|
| Home | `/` |
| Spaces, a space | `/spaces`, `/spaces/:spaceKey` |
| Boards, a board | `/boards` (`?kind=scrum\|kanban`), `/boards/:boardId` |
| A sprint | `/boards/:boardId/sprints/:sprintId` |
| An epic | `/epics/:epicKey` (`?board=` it was opened from, `?sprint=` for the way back) |
| An issue | `/issues/:key` |
| People, a person, your week | `/people`, `/people/:accountId`, `/me` |
| Focus timeline | `/people/focus` |
| Presentation: templates, one template | `/presentation`, `/presentation/templates/:templateId` |
| Presentation: generations, one generation | `/presentation/runs`, `/presentation/runs/:runId` |
| Presentation: variables | `/presentation/variables` (`?template=`) |
| Collection status | `/status` |
| Settings | `/settings` |
| Setup | `/setup` (`?phase=configure\|first-run`) |
| Audience window, shared deck | `/present/audience`, `/shared/:token` (both outside the shell) |

### Old paths

| old | new |
|---|---|
| `/inicio`, `/getting-started` | `/setup` |
| `/configuracao/assistente`, `/settings/wizard` | `/setup?phase=configure` |
| `/minha-semana`, `/my-week` | `/me` (→ `/people/<you>?tab=week`, or the picker at `/people?tab=my-week` until the browser knows who you are) |
| `/fluxo`, `/flow`, `/boards#flow` | `/boards/:id?tab=flow` when the query names one board, else `/boards` (the other filters are kept) |
| `/boards/:boardId/epics/:epicKey` | `/epics/:epicKey?board=:boardId` |
| `/presentation?template=:id` | `/presentation/templates/:id` (the other keys — `run`, `slide`, `shape`, `wizard` — are kept) |
| `/settings?tab=profile&profile=:id` | `/boards/:id?tab=settings` (without a board: `/settings?tab=boards`) |
| `/timeline-foco`, `/focus-timeline` | `/people/focus` |
| `/pessoas`, `/pessoas/:accountId` | `/people`, `/people/:accountId` |
| `/apresentacao` | `/presentation` |
| `/apresentar/plateia` | `/present/audience` |
| `/configuracao` | `/settings` |
| `/compartilhado/:token` | `/shared/:token` (public, outside the shell) |

## Query keys

| old | new | where |
|---|---|---|
| `modelo` | `template` | `/presentation/variables`, `/presentation/runs`; on `/presentation` it becomes the path |
| `forma` | `shape` | `/presentation/templates/:id`: the shape a fix-it link selects (with `slide`) |
| `assistente` | `wizard` | `/presentation/templates/:id`: the template wizard (`=1`) |
| `ausencias` | `absences` | `/people`: the absences drawer (`=1`) |
| `funcoes` | `roles` | `/people`: the roles-and-team drawer (`=1`) |
| `perfil` | `profile` | the old Settings profile section, which now becomes the board's path |
| `canal` | `channel` | `/present/audience`: the presenter's BroadcastChannel id |

Renamed on any screen; when both spellings are present the current one wins. Unchanged: the shared
filters `board`, `person`, `type`, `start`, `end`, `situation`, plus `tab`, `run`, `slide`,
`sprint`, `kind`, `phase`. Filter *values* are not routes: `situation` carries the API's risk enum
(`bloqueado`, `atrasado`, …) and stays as it is.

## `?tab=` values

| screen | tabs | old → new |
|---|---|---|
| `/spaces/:spaceKey` | `overview`, `people`, `risks`, `flow`, `hygiene` | — |
| `/boards/:boardId` | `overview`, `sprints`, `work-tree`, `risks`, `flow`, `changes`, `hygiene`, `settings` | `visao→overview`, `arvore→work-tree`, `riscos→risks`, `fluxo→flow`, `mudancas→changes`, `saude→hygiene` |
| `/boards/:boardId/sprints/:sprintId` | `overview`, `work-tree`, `timeline`, `risks`, `changes`, `commitment`, `allocation` | `visao→overview`, `arvore→work-tree`, `riscos→risks`, `mudancas→changes`, `compromisso→commitment`, `planejamento→allocation`, `planning→allocation` |
| `/epics/:epicKey` | `overview`, `plan` | `visao→overview`, `plano→plan` |
| `/people` | `my-week` | `minha-semana→my-week` |
| `/people/:accountId` | `week`, `timeline`, `capacity`, `history`, `role` | `semana→week`, `capacidade→capacity`, `historico→history`, `funcao→role` |
| `/status` | `collection`, `health` | `coleta→collection`, `saude→health` |
| `/settings` | `connection`, `calendar`, `collection`, `email`, `ai`, `general`, `boards`, `fields`, `notifications`, `epic-plan` | `conexao→connection`, `calendario→calendar`, `coleta→collection`, `ia→ai`, `geral→general`, `campos→fields`, `notificacoes→notifications`, `plano-epico→epic-plan`; `perfil`/`profile` → the board's `settings` tab; `ausencias` → `/people?absences=1` |

Old values are translated per screen (the same word can mean a different tab elsewhere), in
`LEGACY_TABS` of `web/src/lib/legacyRoutes.ts`. A value not listed for that screen is left alone.

Tabs that live in component state and never reach the URL were renamed too, so no Portuguese tab
id is left in the code: variable manager `variaveis/campos/cores → variables/fields/colors`;
editor library `imagens/blocos → images/blocks`; find and replace `variaveis → variables`; epic
plan pipeline `tarefas/subtarefas → tasks/subtasks` and schedule `tarefa/subtarefa → task/subtask`;
roles catalogue `funcoes/equipe → roles/team`. They need no redirect.

## How old URLs keep working

- **Web app:** one pure function, `normalizeLegacyUrl(pathname, search, hash)` in
  `web/src/lib/legacyRoutes.ts`, maps an old path, query keys and tab values to the current URL; the
  router redirects (`replace`) when it returns something different, and pinned saved views are
  compared through it. A page that moved only as a whole (`/my-week`, `/getting-started`,
  `/focus-timeline`) is mapped as an exact path. The hash travels, except `#flow`, which named a
  section that is now a board's tab.
- **Stored URLs:** migration `0023` rewrote `saved_view` paths and query keys to the English ones.
  The restructure needs no migration: a saved view opens through the router, which redirects it.
- **Links the backend builds:** the command palette's template results point at
  `/presentation/templates/:id`, a deck notification at `/presentation/runs/:id`, and the
  "outside the team" hygiene check at the board's Settings tab.
- **nginx:** `/shared/` and the old `/compartilhado/` both bypass basic auth.
- **API:** old Portuguese `/api` paths answer **308** to the new path (method and body preserved).
  The restructure only added API paths: `GET /spaces/{key}`, `GET /spaces/{key}/risks`,
  `GET /sprints/{id}/changes` and `GET /reports/runs/{id}`.

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
