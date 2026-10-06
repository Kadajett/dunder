# herdr-office: product brief

Owner: Jeremy (kadajett). Written 2026-10-06 by Friday, his manager agent. This file is the source of truth for the goal; re-read it before every milestone.

## Goal

Build an **Electron desktop app** that shows a **fully customizable 3D isometric office** where AI coding agents work. It orchestrates agents for one large project or a whole company.
- **Inspiration:** orpex.ai ("AI-native company, runs on Orpex"). Reference screenshot: `docs/reference/orpex-office.png`. Look at https://orpex.ai for product context. Copy the experience, not their assets.
- **Backend:** herdr, using a **dedicated herdr session named `office`**.

**The core requirement:** every agent sits at a computer in the office. **Clicking a computer zooms into that screen and gives a fully interactive terminal** for that agent. It must be a real terminal, not a log view:
- typing, Ctrl keys, arrows, colors;
- resize;
- full-screen TUIs like `omp`, `claude`, `htop`;
- copy/paste;
- scrollback.

## What's in the reference screenshot (match this level of polish)

- **Isometric room:** warm beige walls with windows; low-poly/voxel desks, chairs and monitors; plants, bookshelves, a sofa break room, a reception desk, a server rack ("ACCESS"), a wall bell, and a wall sign with the company name ("KELLER TALENT · AI-native recruiting · runs on Orpex").
- **Zones:** floor rugs mark areas ("#SALES growth · client love", "#DELIVERY watch them coordinate — live", "LIBRARY — company brain 147 memories", "MAILROOM 2 replies need you", "CLIENTS — open the CRM", "RECEPTION — hiring 3 open roles", "BREAK ROOM").
- **Agents:** characters at desks with dark name tags (`● NORA`, `● JONAS`, …). The dot shows live status. Speech bubbles show their latest notable action ("Fintech CTO confirmed Thursday 14:00").
- **Top bar:**
  - company switcher (logo, name, subtitle);
  - nav: Clients, Inbox, Brain, Team;
  - stat tiles (revenue, AI cost);
  - **Trust Inbox: "what needs you"**, with a count;
  - clock with day and part of day;
  - **Classic / Office view toggle**;
  - user avatar.
  - Dunder deliberately departs from the reference here (Jeremy, 2026-10-06): the bar is only the company switcher, the Trust Inbox icon with its count, the clock and one menu (Clients, Brain, Team, Office/Classic, edit mode, app updates). The stat tiles live in the Team panel and the AI-spend wall placard; there is no avatar.
- **Bottom left:** the live **Activity Feed** (timestamped `Agent: action` cards, collapsible, with a count).
- **Bottom right:** a chat dock for the **Chief of Staff** agent (avatar, name, role, online dot).
- **Floating callouts** on objects (e.g. "4 bundles in your tray").

## Mapping onto herdr

All app state about agents comes from herdr. All agent actions go through herdr.

| Office concept | herdr |
|---|---|
| Company | the `office` herdr session (`herdr --session office …`; socket `~/.config/herdr/sessions/office/herdr.sock`) |
| Room / zone (#sales, #delivery…) | a herdr workspace (or tab), with its label |
| Desk + computer | a herdr pane |
| Agent at the desk | a herdr agent in that pane (`agent start <name> --kind omp\|claude\|codex… --pane <id> -- <args>`) |
| Status dot | `agent_status` (working / idle / blocked / done); live via `events.subscribe` (`pane.agent_status_changed`) |
| Trust Inbox ("needs you") | agents in `blocked`, plus `done` work not yet seen |
| Activity Feed | herdr events, plus agent metadata/summaries (`pane report-metadata`, `agent read`) |
| Speech bubble | the latest summary per agent |
| Hire someone | create a desk, start an agent with a role prompt and a model |
| The interactive screen | `herdr --session office terminal session control <target> --cols N --rows N` (and `observe` for read-only previews) |

**Verified on this machine (herdr 0.9.3):** `herdr terminal session observe <pane-id> --cols N --rows N` streams newline-delimited JSON, `{"bytes":"<base64 terminal output>"}`. That is the raw byte stream for xterm.js. `control` (with `--takeover`) is the read-write variant; work out its input and resize protocol from `herdr api schema --json`, `herdr terminal --help` and experiments. Other useful API methods: `pane.send_input`, `pane.send_keys`, `pane.resize`, `pane.read`, `layout.apply`, `session.snapshot`, `events.subscribe`. The herdr skill (`herdr --skill`) documents the CLI.

## Must-haves

1. **herdr bridge** in the Electron main process: start/ensure the `office` session server, list and subscribe, start/stop agents, and a terminal stream per opened screen. The renderer talks to it over IPC only.
2. **Isometric 3D office** (e.g. Three.js with an orthographic camera) rendered from a layout model. Desks are bound to live herdr agents; status, name tags and bubbles update live.
3. **Click a computer:** the camera zooms to the monitor and a real interactive terminal appears on that screen, attached to the agent's pane (see Architecture). Leaving is a click outside the screen or the "Back to office" control, never Esc. Multiple screens can stay open in Classic view.
4. **HUD:** top bar, Trust Inbox, Activity Feed and Chief of Staff dock, as in the screenshot, driven by real herdr data. Stat tiles may start as placeholders, as long as they are clearly marked as such.
5. **Fully customizable:** an edit mode to add/move/rotate/delete desks, rooms, rugs, labels and decor; rename the company; hire/fire/rename agents with a role, model and harness (omp/claude/codex). Layout and company config persist to disk (JSON) and reload. More than one company (switcher).
6. **Classic view:** a non-3D grid/list of the same agents and terminals.

## Rules

- **Only touch the `office` herdr session** (`herdr --session office …`).
  - The default herdr session runs Jeremy's other agents (Friday, friday-personal, BeadsAgent, river-*). Never create, stop, prompt or close anything there except your own pane.
  - Never `server stop` the default session.
  - Agents you start for testing go in `office`.
- **New-project engineering defaults** from your global AGENTS.md: TypeScript strict, Biome, real tests for the bridge and layout model, small modules.
- **Beads is the plan:** an epic per milestone, child beads per unit, `discovered-from` for follow-ups, and close reasons stating what was verified. Use parallel `task` subagents for independent units.
- **Prove it by running it.** Launch the real Electron app (display `:0`, Wayland available), take screenshots, open a computer, type into a live `omp` agent's terminal, and confirm the input with `herdr --session office pane read`. Report only what you exercised.
- **Commits:** commit at the end of each green milestone.

## Architecture: the 3D office and its terminals

Jeremy, 2026-10-06: **the 3D office is the core of the app, and the terminal plumbing is just as important.** Both are first-class: the office is what he looks at, and live terminals are what make the desks real.

### Every desk's screen has two modes

1. **Ambient (office overview).** Every monitor mesh shows its agent's live screen as a texture, so the office visibly works.
   - **Source:** one shared read-only `herdr --session office terminal session observe <pane> --cols C --rows R` stream per pane, fed into `@xterm/headless`.
   - **Painting:** a small painter rasterizes the cell buffer (glyphs and colors; no cursor blink) into an `OffscreenCanvas` that becomes a `CanvasTexture`.
   - **Budget:** repaint only dirty monitors that are in the camera frustum, at most ~4 fps each; textures around 512×320.
   - **Resync:** a fresh observe attach always starts with a full repaint (verified: the stream opens with `ESC[?2026h … ESC[2J ESC[1;1H …`). So when a preview falls behind, drop its backlog and re-attach rather than queueing.
2. **Focused (you clicked the computer).**
   - **Camera:** it tweens (~400 ms, eased) until the monitor faces the viewer head-on and fills roughly 70% of the viewport. Skewed text in an isometric view is unreadable, so head-on is what makes the terminal usable.
   - **The terminal:** a real xterm.js (DOM, WebGL renderer addon) is mounted exactly over the monitor's projected screen rectangle (or drei `<Html transform>` on the monitor plane). It is attached through `terminal session control` (protocol 22, already in `src/shared/terminal.ts`), and the texture underneath is hidden.
   - **Size:** the fit addon computes cols/rows for that rectangle and sends `terminal.resize`, debounced on window resize and when the camera settles.
   - **Full input:** every key, including Esc, Ctrl, Alt and arrows; paste (Ctrl+Shift+V); copy on selection (Ctrl+Shift+C); wheel → `terminal.scroll`; mouse → `terminal.mouse` when the app inside enables mouse mode; IME composition.
   - **Leaving: never Esc**, since `omp`, vim and every TUI need it. Use a click outside the screen rectangle, a visible "Back to office" button, and one chord TUIs don't use, shown as a hint.
   - **On leave:** send `terminal.release`, dispose the xterm, tween back, and the ambient texture resumes.
   - **Pane size:** `control` resizes the pane's PTY. Decide (and document) whether to restore the previous size on release.

### Main-process stream manager (keep and extend the existing `TerminalRegistry`)

- **Observe:** one process per pane, reference-counted by subscriber id (monitor textures, Classic tiles). It starts on the first subscribe and stops ~2 s after the last unsubscribe. Subscribe and unsubscribe are idempotent, so React StrictMode double-mounts can never spawn or kill processes.
- **Control:** at most one session per pane, with the current registry semantics (reopening supersedes, sequenced exit). Previews keep observing while a screen is focused.
- **Transport:** coalesce each pane's bytes per ~16 ms, then send them as `Uint8Array` over one `MessagePort` per window, not one IPC message per stdout line.
- **Lifecycle:** kill every child process when a window closes or the app quits. Restart a dead observe with backoff, and show "disconnected" on that monitor.
- **Contract tests against a real `office` session** started in test setup:
  - observe repaints on attach;
  - `terminal.input` text shows up in `pane read`;
  - `terminal.resize` changes the pane size;
  - release works;
  - takeover supersedes;
  - refcount: two subscribes → one process, and unsubscribing all → the process exits.

### 3D scene

- **Stack:** react-three-fiber + drei (already installed). An `OrthographicCamera` at the reference's dimetric/isometric angle; pan and zoom only (no free orbit), with zoom limits; a smooth tween into focus mode.
- **Data:** the zod layout model (pure ops, JSON on disk) drives everything: rooms/zones ↔ herdr workspaces, desks ↔ agent names, decor items. The scene is a pure function of (layout, live agent state).
- **Geometry:** procedural low-poly, no external assets. Instanced meshes for repeated decor; soft directional plus hemisphere light, PCF soft shadows; a warm palette sampled from the reference.
- **Text:** labels, name tags and speech bubbles are drei `<Html>` (DOM), crisp like the reference.
- **Interaction:** hovering a monitor outlines it and shows the agent's card; clicking a monitor enters focus mode; clicking a character opens its card (status, role, model, last summary, "Open screen").
- **Behaviour from status:** typing when working, leaning back when idle, a raised hand and red bubble when blocked, a green check when done (until seen).
- **Performance:** `frameloop="demand"` with invalidation on state and animation, so CPU stays low with many live screens.
- **Calisthenics:** once a day (local time in `<userData>/calisthenics.json` as `dailyTime`, default `15:00`; it catches up for up to 2 h if the app was not running, and `lastRunDate` keeps it to once per day) or when someone rings the wall bell, main (`src/main/calisthenics/`) pushes a `Workout` (`calisthenics:workout`). Every agent that is not blocked walks to an open-floor spot near the break room (or beside its desk if unreachable), faces the camera, and does the shared routine in `src/shared/calisthenics.ts` (mountain reach, tree, warrior II, forward fold, jumping jacks, breathing). Each pose is a function of `Date.now() - startedAt`, so everyone moves in sync. While the routine plays, every omp agent gets `/compact` (via `herdr agent prompt`), followed by a reminder to re-read `bd prime`/`bd memories`, AGENTS.md and its todos. Blocked agents are skipped, and working agents are queued until their turn ends. Main follows each omp agent's session JSONL (`agent_session.value`); a `{"type":"compaction"}` line that main did not ask for starts a solo workout for that agent.

The bare terminal view may survive only as a hidden developer route (e.g. `?debug=terminals`) for testing the bridge. It must never appear in normal use.

## Milestones (each ends runnable and verified)

**Revised 2026-10-06 at Jeremy's direction.** The app *is* the 3D office. From the first milestone on, launching the app shows the isometric office, never a window of bare terminals. The earlier order (terminal-in-a-plain-window first) is cancelled.

1. **The 3D office, now.** An isometric Three.js office rendered from a layout model and recognisably the reference screenshot:
   - warm room, walls with windows, a floor with rugs and zones, desks with chairs and monitors, low-poly people at the desks, plants, labels;
   - desks bound to the live agents in the `office` herdr session, with name tags and status dots.
   - If herdr has no agents yet, start 3–4 `omp` agents there so the desks are occupied.
   - Verify with a screenshot of the running app next to the reference.
2. **Live screens: ambient previews on every monitor, and click-to-focus into a working terminal** (Architecture above). One correct terminal: right size, no duplicates, typing works in `omp`, and leaving never uses Esc.
   - Extend the existing `TerminalRegistry` into the stream manager above. Run its contract tests against the real `office` session.
   - Verify: a screenshot of the office with live screens; type into a live agent from the focused 3D screen and confirm it with `herdr --session office pane read`.
3. **HUD:** top bar, Trust Inbox, Activity Feed, Chief of Staff dock, Classic/Office toggle.
4. **Customization:** edit mode, hire/fire agents, rooms/zones from workspaces, persistence, multiple companies.
5. **Visual polish** toward the reference screenshot: lighting, characters, decor, typography.
