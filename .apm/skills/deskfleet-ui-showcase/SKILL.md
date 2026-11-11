---
name: deskfleet-ui-showcase
description: Launch a deterministic, login-free DeskFleet UI showcase server with preloaded fleet hierarchy, full-featured session snapshots, and error-state views without modifying the DeskFleet repository. Use when styling, inspecting, testing, or recording DeskFleet frontend components and session UI states.
---

# DeskFleet UI Showcase

Start a deterministic, login-free DeskFleet renderer preview against any DeskFleet checkout or worktree without modifying tracked repository files or starting a local daemon.

## Why this skill is deterministic

Do not invent ad-hoc mock data in the target repository. This skill bundles fixed TypeScript fixtures and an in-memory `DeskfleetDesktopApi` host in `assets/`:

- `assets/dev-showcase-fixtures.ts`: Preloaded Team, online/offline Machines, Workspaces, Worktrees, Providers, Git status/diff/branches, and full `AgentSnapshot` + `AgentEvent[]` streams.
- `assets/dev-showcase.ts`: Interactive in-memory `CentralApi`, `LocalChannelsApi`, and desktop settings/provider handlers.
- `assets/bootstrap.ts`: Injects `window.deskfleet` before `apps/desktop/src/renderer/src/main.ts` runs.
- `scripts/serve-showcase.mjs`: Runs `apps/desktop/vite.renderer.config.ts` with an in-memory Vite plugin that wires `bootstrap.ts`, initial route navigation, and pre-expanded session disclosures without touching any file in the DeskFleet checkout.

## Start the showcase server

From the DeskFleet repository root (or pass `--repo /path/to/deskfleet`):

```sh
mise exec -- node "$skill_dir/scripts/serve-showcase.mjs" --repo "$deskfleet_repo"
```

Options:

- `--repo <path>`: Path to the DeskFleet checkout or session worktree (defaults to `process.cwd()`).
- `--port <number>`: Port to bind (defaults to `5179` or `DESKFLEET_SHOWCASE_PORT`, falling back to the next free port unless `--port` is explicitly passed).
- `--host <host>`: Host address (defaults to `127.0.0.1`).

The script prints a JSON receipt with `status: "ready"` and the URLs for each preloaded view.

## Preloaded routes and UI coverage

Open the printed URLs with `agent-browser` or a desktop browser:

1. **Primary Showcase Session (`#/sessions/sess-showcase`)**
   - **Multi-block User Prompt**: Markdown text, embedded `resource` pasted snippet, and `resource_link` file chip (`SessionView.vue`).
   - **Plan Card (`AgentPlan`)**: `completed`, `in_progress`, and `pending` plan items.
   - **Reasoning (`agent_thought_chunk`)**: Pre-expanded collapsible thinking block.
   - **Tool Call Cards (`AgentToolCall`)**:
     - `execute` (`tool-cmd-check`): Pre-expanded with recorded ANSI terminal output (`AgentTerminal`) and `Exited (0)` badge.
     - `edit` (`tool-edit-session-view`): Pre-expanded with `+18 -4` line stats and `oldText` / `newText` code diff (`diff` block).
     - `search` (`tool-search-1`): Completed search with file locations.
     - `other` (`tool-mcp-query`): Completed MCP `sqlite.query` call.
     - `execute` (`tool-failed-probe`): Failed command (`status: "failed"`).
   - **Media Blocks**: Inline SVG `image` preview and playable WAV `audio` block.
   - **Assistant Rich Text**: Heading, bullet list, GFM table, and syntax-highlighted TypeScript code block.
   - **Bottom Composer & Controls**:
     - Pending `Permission Request` card (`Allow once`, `Always allow in session`, `Reject` buttons work interactively).
     - Queued `AgentBacklog` input item (`Send now`, `Edit`, `Remove`).
     - `AgentUsage` context window ring (`68,420 / 200,000` tokens, `$0.1845`).
     - Provider / Model / Mode / Reasoning effort configuration selector (`Claude Code · Claude Sonnet 4.5 · High`) and `/plan`, `/review`, `/compact`, `/test` slash commands.
2. **Error State Session (`#/sessions/sess-error`)**
   - Displays a session in `lifecycle: "error"` with the top `ErrorNotice` banner and failed turn state.
3. **Archived Sessions (`#/sessions/archived`)**
   - Displays `sess-archived` with restore/delete controls.
4. **Query overrides**
   - `?theme=dark` (default) or `?theme=light` switches the initial appearance theme.
   - `?platform=darwin` (default), `?platform=win32`, `?platform=linux`, or `?platform=web` switches platform chrome behavior.

## Inspecting with `agent-browser`

1. Start `serve-showcase.mjs` in a background task and wait for its JSON readiness output.
2. Open `http://127.0.0.1:<port>/#/sessions/sess-showcase` in `agent-browser`.
3. Edit styles or Vue components in `packages/components/src/`; Vite HMR updates the showcase live while `git status` only reflects your real product edits.
4. Stop the background server task when finished.

## Protocol maintenance

When DeskFleet's provisional protocol types in `apps/daemon/src/*-protocol.ts` or `packages/client/src/*` add new required fields, update `assets/dev-showcase-fixtures.ts` and `assets/dev-showcase.ts` in this skill directory so future runs stay deterministic.
