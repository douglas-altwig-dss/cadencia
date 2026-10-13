# Cadência

Cadência tracks, week by week, what each team delivered in the sprint, what got stuck and what slid into the next sprint. A **team** is a Jira **space**, and a space owns one or more **boards** — the two are never used interchangeably. It then fills the Friday presentation into the company's own PowerPoint template. It only **reads** from Jira Cloud and never writes to it.

- It collects the full change history of every item and freezes the state of each item at weekly checkpoints (Friday 18:00, America/Sao_Paulo, configurable). The difference between two checkpoints becomes a story: delivered, in progress, stalled, carried over.
- It classifies risk with evidence. Each item is in one of six situations: on track, aging, stalled, blocked, overdue or carried over. For each one it shows the rule that fired, the last transition, its date and its author.
- It measures flow: lead time and cycle time as P50/P85/P95 with the sample size, throughput, WIP, flow efficiency, commitment adherence and carryover rate. People are compared with the median of the boards in view and are never ranked, and they are listed under the space they work in (someone who works in two teams appears under both).
- It compares planned against actual: theoretical capacity, a greedy theoretical allocation (labelled as a heuristic), and committed against delivered, with added scope kept apart.
- It generates the deck by opening the original `.pptx` and replacing content inside it. Layouts, theme, fonts and brand stay intact. It can clone one slide per board or per project, continue long tables on copies of their slide, skip a slide that has nothing to say, and validate the result before delivery. The space name is what fills the template's project-name slot.

The product spec (PRD, in Portuguese) is at https://claude.ai/artifact/7LGp9NsDcVfRMZ9nwVTvLJ.

## Running it

**Development container (recommended).** Open the folder in VS Code and choose *Reopen in Container*. `docker-compose.dev.yml` starts PostgreSQL, the API (with reload), the collector and the web app (Vite), and `make setup` installs everything. The web app is at http://localhost:5173 and the API docs are at http://localhost:8000/docs.

**Containers, like production.** Copy `.env.example` to `.env`, put the Jira API token in `secrets/jira_api_token`, then run `make up`. The web app is at http://localhost:8080. Before anyone else can reach that port, turn on sign-in (below).

**Without Docker.** You need Python 3.12 and Node 24. Run `make setup`, then `make api` and `make web` in two terminals. The database is local SQLite (`./cadencia.db`).

### Access

Out of the box the app is open to whoever reaches it, which is fine on your own machine and nowhere else. `make auth LOGIN=<name>` asks for a password and turns sign-in on; run it once per person, then `make up` again.

- People sign in to the web app with that user and password (nginx, HTTP basic auth, `secrets/web_htpasswd`).
- The API refuses every request without `Authorization: Bearer <token>`. The first `make auth` generates the token into `secrets/api_token`, and nginx adds it to requests after sign-in, so nobody types it. Scripts calling the API directly send it themselves. `/api/health` stays public for health checks.
- The API port is published on `127.0.0.1` only, so from the network it is reached through the web app.

In development, set `CADENCIA_API_TOKEN` in `.env` and the Vite proxy forwards it the same way. An empty token leaves the API open.

**No Jira credentials yet?** `make demo` fills the database with a fictional instance: two spaces over three boards, and items built to trigger every risk rule. It also loads a sample template with its mapping.

The first time you open the app, **Primeiros passos** (`/inicio`) walks through the same path in the browser: connect, discover, choose boards, run the first collection with live progress, then upload the template.

## First steps with a real instance (milestone M0)

```bash
cadencia test-connection          # identity and permissions, or the cause of the failure
cadencia discover                 # spaces, boards, custom fields found, statuses
cadencia spaces                   # the teams, with the boards under each one
cadencia boards --select 12 34    # boards to track (also on the Configuração page)
cadencia collect --full           # first collection
cadencia summary --sprint 123     # M1: sprint summary as JSON, to check against the board
cadencia manifest modelo.pptx     # every replaceable area of the template, with stable ids
```

Then open **Apresentação**, upload the template, review the suggested mapping, pick the board for each slide, save and generate. While mapping, the slide is shown with its real content already resolved, so you see what it will say before generating anything. A finished deck can be presented from the browser (arrows, speaker notes, a talk timer) instead of only downloaded.

### Finding your way around

- **Ctrl+K** (⌘K on a Mac) searches boards, sprints, item keys, people, templates and saved views, and runs actions such as "Coletar agora". The **Buscar** button in the header opens the same palette.
- **?** lists the keyboard shortcuts of the screen you are on.
- The bookmark in the header **saves the current screen with its filters** under a name. Pinned views appear in the left menu, and every view is a shareable link.
- **Minha semana** shows one person's open items, risks, deadlines in the next seven days and what they finished in the last seven, across every board. The person you pick is remembered in your browser.
- Lists (risks, changes, forecast, health, my week) have **Abrir no Jira**, which opens the same items as a Jira search.
- The settings button in the header holds **display preferences**: compact tables, patterns on charts (so series never depend on colour alone) and reduced motion.
- The dashboard's **Personalizar** menu shows, hides and reorders its columns and the indicator tiles above it (at-risk items, window throughput, sprint progress and commitment adherence, each with its trend). On a phone the dashboard becomes one card per board.

### Weekly questions

- **O que mudou** (a tab on every board and sprint) compares the last frozen checkpoint with now, or any two checkpoints: new and resolved risks, completed, entered and left, status and owner changes, and how the totals moved.
- **Previsão de entrega**, on the sprint overview and on each epic, runs a Monte Carlo simulation over the board's own daily throughput: the chance of finishing what is left by the end of the sprint, and the dates with 50%, 85% and 95% chance. The sample and its confidence are always shown.
- **Status → Saúde dos dados** lists the Jira hygiene problems that skew the numbers (unestimated items, statuses outside every column, sprints without dates, work in progress with no owner, owners outside the team) with where to fix each.
- **Status → Coleta** shows a running collection board by board, with the current step, progress through the item histories, an estimate of the time left and a **Cancelar** button.

### Notifications

**Configuração → Notificações** sends messages to Slack, Teams (incoming webhooks), any URL (a JSON webhook) or e-mail. Each channel picks its events: a deck was generated, the risk digest, a scheduled collection failed. The **risk digest** sends one message per space with what became stalled, blocked or overdue since the last checkpoint, on the days and at the hour you choose; a space with nothing new gets no message. Webhook addresses are shown masked. Set `CADENCIA_PUBLIC_URL` so messages link back to the app, and `CADENCIA_SMTP_*` for e-mail.

### Managing templates

**Gerenciar modelos**, in the header menu, lists every template with its slide count, size, whether it has a mapping or manual edits, and how many decks were generated from it. Upload a new `.pptx` there (the same file uploaded twice is recognised and reused, not duplicated) or delete one. Deleting removes the template file, its previews, its mapping and its manual edits; the presentations already generated from it stay downloadable.

### Editing the generated deck

Apresentação is a single editor, not a stack of tabs, and it works the way Google Slides and PowerPoint Online work — a filmstrip of live thumbnails on the left, the slide filling the window, one toolbar that changes with what is selected, and a properties panel on the right. The canvas shows the deck that was just generated, read out of the .pptx itself: group transforms resolved, theme and master inheritance applied, connectors drawn as lines and freeforms as their real outlines.

The filmstrip shows each slide as it really is — same aspect ratio, same elements in the same places, same fonts, colours and background — drawn by the same renderer as the canvas, so a thumbnail changes as you type rather than when you save. Both side panels drag from their inner edge to whatever width suits the screen, and the width is remembered; the canvas keeps a floor so a panel can never swallow it, and a double click on a splitter puts it back.

Double-click a box and type on the slide, with the caret where the words are. Drag, resize and rotate with snapping guides, rulers and a quarter-inch grid; rubber-band a group and move it as one; right-click for copy, duplicate, order and delete; drag thumbnails to reorder slides. Select a shape and one panel answers both questions — where its content comes from (typed here, a data field, or a variable) and how it looks. Align, distribute, copy between slides, ungroup, edit speaker notes, undo and redo.

Nothing has to be saved by hand: edits are written a second or so after you stop, with the state shown next to the slide. Ctrl+S saves immediately, Ctrl+Z / Ctrl+Shift+Z step through the history, Ctrl+D duplicates, Ctrl+scroll zooms, Tab walks the shapes and the canvas fits the window by default.

Edits are stored beside the mapping rather than inside the .pptx, so **the next run refreshes the data and replays them** — no more exporting, fixing in PowerPoint and losing it next week. Shapes the data fills are marked, so it is obvious what a re-run will rewrite. The template file, the variables, the deck's rules and the generation history live in drawers off the header menu.

Beyond moving and styling shapes, the editor has:

- **Localizar e substituir** (Ctrl+H) across the slide or the whole deck, keeping each word's formatting, and across the variables' values with a preview before anything is written. Shapes filled by data are listed but left alone.
- **Format painter**: copy a shape's look (Ctrl+Shift+C) and paste it onto other shapes, on any slide (Ctrl+Shift+V).
- **Lock** a shape (Ctrl+L) so it cannot be moved, resized or deleted, and **hide** a shape while you work behind it. Neither reaches the .pptx.
- **Tables**: column widths, and fill, colour, size, bold, italic and alignment per cell or per row, with a one-click header style. They are kept when next week's data refills the table.
- **Conditional formatting** in a binding's layout options: "when the value is greater than 80, paint it red", on the text or the fill, read the way the slide shows the value ("85%" is 85).
- **Comments** on a slide or a shape, with replies and resolve. They belong to the template slide, so every board's copy shows them, and the thumbnails count the open ones.
- **Speaker notes with data**: `{{board.nome}}: {{riscos.itens|contagem}} itens em risco — {{riscos.itens|chaves}}` fills in per board. The modifiers `|contagem`, `|chaves` and `|lista` write a list into running text.
- **Histórico de versões** (Arquivo menu): autosave keeps a rolling copy every ten minutes, you can save a named version, see what restoring one would change, and restore it. Restoring keeps the current state as a version first.
- Validation problems link to their slide and shape (**abrir no editor**) or to the variable manager.

A template can also **generate on its own schedule** (Regras da apresentação → Geração agendada), for example Friday at 10:00 before the meeting, from the data at that moment or from the last checkpoint, and send the result to the channels.

**Presenting on two screens**: in present mode, **Tela da plateia** (or `s`) opens a second window with just the slide, for the projector; your window becomes the presenter view with the current and next slide, the notes and a timer.

### Variables

Text that never changes between presentations — a project definition, a scope note, a footer — belongs to the project, not to the deck. A **variable** is a name you write as `{{texto.definicao}}` in any text field of a slide; what it says depends on the target being filled. Manage them under **Apresentação → Variáveis**: create the name, then give it a value at whichever level it belongs to.

Values are looked for from the narrowest level outwards — **slide → board → space → all projects** — and the first one found wins. So a wording that is right for the whole company is set once as the default, a space overrides it for its own decks, a board narrows it further, and a single slide can say something no other slide says. A variable is available in every template by default, or can be assigned to one template alone when it only makes sense there. The preview and the editor show the resolved text rather than the marker, and a name with no value that reaches the target is reported instead of silently blank.

## Tasks

| `make …`   | what it does                                        |
|------------|-----------------------------------------------------|
| `setup`    | installs backend and frontend dependencies          |
| `up`/`down`| starts or stops the containers                      |
| `collect`  | incremental collection (`FULL=1` for reconciliation) |
| `test`     | backend tests and frontend type check               |
| `lint`     | ruff and tsc                                        |
| `deck`     | generates a deck: `make deck TEMPLATE=<id>`         |
| `demo`     | loads the demo instance                             |

## Layout

```
backend/cadencia/   jira/ (async client) · domain/ (pure rules) · store/ (DB) · analytics/ (views)
                    collector/ (collection and scheduler) · api/ (FastAPI) · report/ (.pptx) · cli.py
backend/tests/      pytest; the demo instance is a fake Jira served through httpx.MockTransport
web/                React + TypeScript + Vite, Mantine, TanStack Query/Table, ECharts
```
