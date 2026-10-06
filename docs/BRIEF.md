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
3. **Click a computer:** the camera zooms to the monitor and an xterm.js terminal appears on (or over) that screen, attached to the agent's pane. Esc or click-out returns to the office. Multiple screens can stay open in Classic view.
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

## Milestones (each ends runnable and verified)

**Revised 2026-10-06 at Jeremy's direction.** The app *is* the 3D office. From the first milestone on, launching the app shows the isometric office, never a window of bare terminals. The earlier order (terminal-in-a-plain-window first) is cancelled.

1. **The 3D office, now.** An isometric Three.js office rendered from a layout model and recognisably the reference screenshot:
   - warm room, walls with windows, a floor with rugs and zones, desks with chairs and monitors, low-poly people at the desks, plants, labels;
   - desks bound to the live agents in the `office` herdr session, with name tags and status dots.
   - If herdr has no agents yet, start 3–4 `omp` agents there so the desks are occupied.
   - Verify with a screenshot of the running app next to the reference.
2. **Click a computer to get a working terminal on that screen.** The camera zooms to the monitor and one correct xterm.js terminal (right size, no duplicates, typing works in `omp`) is attached through `terminal session control`. Esc returns to the office.
   - Keep the terminal plumbing simple: one session per open screen, closed on exit. Don't build a general registry before it's needed.
   - Verify by typing into a live agent from the 3D screen and confirming it with `herdr --session office pane read`.
3. **HUD:** top bar, Trust Inbox, Activity Feed, Chief of Staff dock, Classic/Office toggle.
4. **Customization:** edit mode, hire/fire agents, rooms/zones from workspaces, persistence, multiple companies.
5. **Visual polish** toward the reference screenshot: lighting, characters, decor, typography.
