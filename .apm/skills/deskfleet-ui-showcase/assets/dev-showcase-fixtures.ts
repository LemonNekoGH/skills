import type * as acp from "@agentclientprotocol/sdk/unstable"
import { agentComposerCatalog, agentConfiguration, type AgentConfiguration } from "@deskfleet-repo/packages/protocol/src/agent-configuration.ts"
import type { AgentEvent, AgentInput, AgentPermission, AgentRun, AgentSessionRecord, AgentSnapshot, AgentTurn } from "@deskfleet-repo/packages/protocol/src/agent.ts"
import type { CatalogSnapshot } from "@deskfleet-repo/packages/protocol/src/catalog.ts"
import type { GitBranchesSnapshot, GitFileDiff, GitPreparationSnapshot, GitStatusSnapshot } from "@deskfleet-repo/packages/protocol/src/git.ts"
import type { ProviderSnapshot } from "@deskfleet-repo/packages/protocol/src/provider.ts"
import type { AccountState, LocalMachineStatus, Machine, SiteSettings, Team, TeamMember } from "@deskfleet-repo/packages/client/src/central.ts"
import { MUX_PROFILE } from "@deskfleet-repo/packages/protocol/src/mux.ts"
import type { ScheduleSnapshot } from "@deskfleet-repo/packages/client/src/search.ts"

export const DEV_SHOWCASE_TEAM_ID = "team-core"
export const DEV_SHOWCASE_SECONDARY_TEAM_ID = "team-design"
export const DEV_SHOWCASE_LOCAL_MACHINE_ID = "machine-studio"
export const DEV_SHOWCASE_REMOTE_MACHINE_ID = "machine-runner"
export const DEV_SHOWCASE_OFFLINE_MACHINE_ID = "machine-lab"
export const DEV_SHOWCASE_WORKSPACE_ID = "101"
export const DEV_SHOWCASE_SECONDARY_WORKSPACE_ID = "102"
export const DEV_SHOWCASE_SESSION_ID = "sess-showcase"
export const DEV_SHOWCASE_ERROR_SESSION_ID = "sess-error"
export const DEV_SHOWCASE_ARCHIVED_SESSION_ID = "sess-archived"
export const DEV_SHOWCASE_REMOTE_SESSION_ID = "sess-remote-build"

const SHOWCASE_PROVIDER_SESSION_ID = "prov-sess-showcase"
const SHOWCASE_TURN_ID = "turn-showcase-1"

const SHOWCASE_SVG_BASE64 = btoa(
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="220" viewBox="0 0 480 220" fill="none">`
  + `<rect width="480" height="220" rx="16" fill="#0F172A"/>`
  + `<rect x="24" y="24" width="432" height="172" rx="12" fill="#1E293B" stroke="#334155"/>`
  + `<circle cx="64" cy="64" r="14" fill="#38BDF8"/>`
  + `<rect x="92" y="54" width="180" height="20" rx="6" fill="#E2E8F0"/>`
  + `<rect x="48" y="98" width="384" height="12" rx="6" fill="#64748B"/>`
  + `<rect x="48" y="122" width="312" height="12" rx="6" fill="#475569"/>`
  + `<rect x="48" y="152" width="120" height="24" rx="6" fill="#22C55E"/>`
  + `</svg>`,
)

// Minimal valid 1-sample 8kHz mono PCM WAV header + sample (46 bytes) for the audio player block.
const SHOWCASE_WAV_BASE64 = "UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAA="

export const DEV_SHOWCASE_TERMINAL_OUTPUT = [
  "$ pnpm --filter @deskfleet/desktop typecheck\r\n",
  "\u001B[36m> @deskfleet/desktop@0.13.0 typecheck\u001B[0m\r\n",
  "\u001B[36m> vue-tsc --noEmit\u001B[0m\r\n",
  "\u001B[32m✓\u001B[0m Verified 148 components with 0 errors in 2.41s\r\n",
].join("")

export const DEV_SHOWCASE_CONFIG_OPTIONS: acp.SessionConfigOption[] = [
  {
    id: "mode",
    name: "Mode",
    category: "mode",
    type: "select",
    currentValue: "architect",
    options: [
      { value: "code", name: "Code", description: "Write and modify files directly" },
      { value: "architect", name: "Architect", description: "Plan and coordinate multi-step changes" },
      { value: "ask", name: "Ask", description: "Read-only exploration and Q&A" },
    ],
  },
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "claude-sonnet-4-5",
    options: [
      { value: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", description: "Balanced speed and coding depth" },
      { value: "claude-opus-4-5", name: "Claude Opus 4.5", description: "Deep reasoning for complex architecture" },
      { value: "gpt-5.2-codex", name: "GPT-5.2 Codex", description: "Fast iterative refactoring" },
    ],
  },
  {
    id: "reasoning_effort",
    name: "Reasoning",
    category: "thought_level",
    type: "select",
    currentValue: "high",
    options: [
      { value: "low", name: "Low", description: "Minimal thinking latency" },
      { value: "medium", name: "Medium", description: "Standard reasoning depth" },
      { value: "high", name: "High", description: "Thorough multi-step verification" },
    ],
  },
]

export const DEV_SHOWCASE_AVAILABLE_COMMANDS: acp.AvailableCommand[] = [
  { name: "plan", description: "Draft a step-by-step execution plan before editing files", input: { hint: "<task summary>" } },
  { name: "review", description: "Review unstaged Git changes for regressions", input: { hint: "[path]" } },
  { name: "compact", description: "Summarize earlier turns to free context window space" },
  { name: "test", description: "Run targeted unit tests for modified packages", input: { hint: "<filter>" } },
]

export function createDevShowcaseConfiguration(provider = "claude-code"): AgentConfiguration {
  return {
    provider,
    ...agentConfiguration(DEV_SHOWCASE_CONFIG_OPTIONS),
    ...agentComposerCatalog(DEV_SHOWCASE_CONFIG_OPTIONS, DEV_SHOWCASE_AVAILABLE_COMMANDS),
    updatedAt: "2026-04-12T10:15:00.000Z",
  }
}

export function createDevShowcaseSnapshot(): AgentSnapshot {
  const turnStartedAt = new Date(Date.now() - 42_000).toISOString()
  const session: AgentSessionRecord = {
    id: DEV_SHOWCASE_SESSION_ID,
    workspaceId: DEV_SHOWCASE_WORKSPACE_ID,
    provider: "claude-code",
    providerSessionId: SHOWCASE_PROVIDER_SESSION_ID,
    title: "Implement Dev Showcase UI & Session Inspector",
    context: "worktree",
    lifecycle: "ready",
    archiveState: "active",
    capabilities: { steering: true, resume: true, fork: true, additionalDirectories: true },
    configuration: createDevShowcaseConfiguration("claude-code"),
    lastEventSeq: "18",
    lastCompletedSeq: "16",
    lastReadSeq: "18",
    createdAt: "2026-04-12T10:00:00.000Z",
    updatedAt: turnStartedAt,
  }

  const run: AgentRun = {
    sessionId: DEV_SHOWCASE_SESSION_ID,
    generation: 1,
    providerSessionId: SHOWCASE_PROVIDER_SESSION_ID,
    pid: 48210,
    state: "running",
    startedAt: turnStartedAt,
  }

  const deliveredInput: AgentInput = {
    id: "input-showcase-1",
    sessionId: DEV_SHOWCASE_SESSION_ID,
    submissionCommandId: "cmd-showcase-1",
    author: { kind: "user", userId: "user-ada" },
    acceptedSeq: "1",
    state: "delivered",
    requestedDelivery: "backlog",
    actualDelivery: "turn_start",
    turnId: SHOWCASE_TURN_ID,
    createdAt: turnStartedAt,
    deliveredAt: turnStartedAt,
    content: [
      {
        type: "text",
        text: "Build a login-free Dev Showcase mode (`DESKFLEET_DEV_SHOWCASE=1`) that renders every session UI element: plan cards, reasoning, command/edit/search/MCP tool calls, code diffs, image & audio media blocks, markdown tables, pending permission requests, and queued inputs.",
      },
      {
        type: "resource",
        resource: {
          uri: "pasted://selection-1",
          mimeType: "text/plain",
          text: "export const DEV_SHOWCASE_ENV = \"DESKFLEET_DEV_SHOWCASE\"\n// Isolated profile directory is created via mkdtempSync in apps/desktop/scripts/dev.ts",
        },
      },
      {
        type: "resource_link",
        name: "SessionView.vue",
        uri: "file:///workspace/deskfleet/packages/components/src/views/SessionView.vue",
        mimeType: "text/x-vue",
      },
    ],
  }

  const queuedInput: AgentInput = {
    id: "input-showcase-queued",
    sessionId: DEV_SHOWCASE_SESSION_ID,
    submissionCommandId: "cmd-showcase-2",
    author: { kind: "user", userId: "user-ada" },
    acceptedSeq: "17",
    state: "pending",
    requestedDelivery: "backlog",
    createdAt: "2026-04-12T10:17:30.000Z",
    content: [
      {
        type: "text",
        text: "After approving the staging migration permission, capture a dark-mode screenshot and verify the sidebar error session banner.",
      },
    ],
  }

  const turn: AgentTurn = {
    id: SHOWCASE_TURN_ID,
    sessionId: DEV_SHOWCASE_SESSION_ID,
    initialInputId: deliveredInput.id,
    dispatchCommandId: "cmd-showcase-1",
    runGeneration: 1,
    state: "running",
    consumed: false,
    startedAt: turnStartedAt,
  }

  const pendingPermission: AgentPermission = {
    id: "perm-showcase-1",
    sessionId: DEV_SHOWCASE_SESSION_ID,
    turnId: SHOWCASE_TURN_ID,
    runGeneration: 1,
    toolCallId: "tool-perm-deploy",
    state: "pending",
    createdAt: "2026-04-12T10:17:10.000Z",
    request: {
      sessionId: SHOWCASE_PROVIDER_SESSION_ID,
      toolCall: {
        toolCallId: "tool-perm-deploy",
        title: "pnpm --filter @deskfleet/desktop showcase:verify --env staging",
        kind: "execute",
        status: "pending",
        locations: [{ path: "/workspace/deskfleet/apps/desktop/package.json", line: 12 }],
      },
      options: [
        { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
        { optionId: "allow-always", name: "Always allow in session", kind: "allow_always" },
        { optionId: "reject-once", name: "Reject", kind: "reject_once" },
      ],
    },
  }

  return {
    session,
    runs: [run],
    inputs: [deliveredInput, queuedInput],
    turns: [turn],
    permissions: [pendingPermission],
    elicitations: [],
  }
}

export function createDevShowcaseEvents(snapshot = createDevShowcaseSnapshot()): AgentEvent[] {
  const sessionId = snapshot.session.id
  const deliveredInput = snapshot.inputs[0]!
  const queuedInput = snapshot.inputs[1]!
  const turn = snapshot.turns[0]!
  const permission = snapshot.permissions[0]!

  const acpUpdate = (
    seq: number,
    createdAt: string,
    update: acp.SessionUpdate,
  ): AgentEvent => ({
    sessionId,
    seq: String(seq),
    kind: "acp",
    turnId: SHOWCASE_TURN_ID,
    runGeneration: 1,
    createdAt,
    payload: {
      sessionId: SHOWCASE_PROVIDER_SESSION_ID,
      update,
    },
  })

  return [
    {
      sessionId,
      seq: "1",
      kind: "input",
      turnId: SHOWCASE_TURN_ID,
      inputId: deliveredInput.id,
      runGeneration: 1,
      createdAt: "2026-04-12T10:00:05.000Z",
      payload: deliveredInput,
    },
    {
      sessionId,
      seq: "2",
      kind: "turn",
      turnId: SHOWCASE_TURN_ID,
      runGeneration: 1,
      createdAt: "2026-04-12T10:00:06.000Z",
      payload: { ...turn, state: "running" },
    },
    acpUpdate(3, "2026-04-12T10:00:07.000Z", {
      sessionUpdate: "config_option_update",
      configOptions: DEV_SHOWCASE_CONFIG_OPTIONS,
    }),
    acpUpdate(4, "2026-04-12T10:00:08.000Z", {
      sessionUpdate: "available_commands_update",
      availableCommands: DEV_SHOWCASE_AVAILABLE_COMMANDS,
    }),
    acpUpdate(5, "2026-04-12T10:00:10.000Z", {
      sessionUpdate: "usage_update",
      used: 68_420,
      size: 200_000,
      cost: { amount: 0.1845, currency: "USD" },
    }),
    acpUpdate(6, "2026-04-12T10:00:12.000Z", {
      sessionUpdate: "agent_thought_chunk",
      content: {
        type: "text",
        text: "We need an isolated Dev Showcase runtime so engineers and AI agents can inspect every DeskFleet UI state with a single command (`pnpm desktop:showcase`). Let's verify the existing session projection, wire up the fixture snapshots, and ensure default dev/build paths remain untouched.",
      },
    }),
    acpUpdate(7, "2026-04-12T10:00:15.000Z", {
      sessionUpdate: "plan",
      entries: [
        {
          content: "Wire DESKFLEET_DEV_SHOWCASE=1 and isolated Electron userData directory in dev.ts",
          priority: "high",
          status: "completed",
        },
        {
          content: "Populate showcase AgentSnapshot with tool calls, diffs, media blocks, permissions, and backlog",
          priority: "high",
          status: "in_progress",
        },
        {
          content: "Document showcase launch workflow in agents/docs/environment.md and verify with Vitest",
          priority: "medium",
          status: "pending",
        },
      ],
    }),
    acpUpdate(8, "2026-04-12T10:00:20.000Z", {
      sessionUpdate: "tool_call",
      toolCallId: "tool-search-1",
      title: "Search session components and projection types",
      kind: "search",
      status: "completed",
      locations: [
        { path: "/workspace/deskfleet/packages/components/src/views/SessionView.vue", line: 1 },
        { path: "/workspace/deskfleet/packages/components/src/services/agent-conversation.ts", line: 42 },
      ],
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: "Found 6 matching components in packages/components/src/components/session/ (AgentConversation.vue, AgentPlan.vue, AgentToolCall.vue, AgentPermissions.vue, AgentBacklog.vue, AgentUsage.vue).",
          },
        },
      ],
    }),
    acpUpdate(9, "2026-04-12T10:00:28.000Z", {
      sessionUpdate: "tool_call",
      toolCallId: "tool-cmd-check",
      title: "pnpm --filter @deskfleet/desktop typecheck",
      kind: "execute",
      status: "completed",
      rawInput: {
        command: "pnpm --filter @deskfleet/desktop typecheck",
        cwd: "/workspace/deskfleet",
      },
      rawOutput: {
        exitCode: 0,
        stdout: "Verified 148 components with 0 errors in 2.41s",
      },
      content: [
        {
          type: "terminal",
          terminalId: "term-showcase-1",
        },
      ],
      _meta: {
        terminal_info: { terminal_id: "term-showcase-1", cwd: "/workspace/deskfleet" },
        terminal_output: { terminal_id: "term-showcase-1", data: DEV_SHOWCASE_TERMINAL_OUTPUT },
        terminal_exit: { terminal_id: "term-showcase-1", exit_code: 0 },
      },
    }),
    acpUpdate(10, "2026-04-12T10:00:40.000Z", {
      sessionUpdate: "tool_call",
      toolCallId: "tool-edit-session-view",
      title: "Update SessionView.vue and dev-showcase.ts",
      kind: "edit",
      status: "completed",
      locations: [
        { path: "/workspace/deskfleet/packages/components/src/views/SessionView.vue", line: 48 },
      ],
      content: [
        {
          type: "diff",
          path: "packages/components/src/views/SessionView.vue",
          oldText: [
            "const props = defineProps<{ sessionId: string }>()",
            "const reading = useConversationReadingStore()",
            "provide(conversationReadingKey, () => reading.session(props.sessionId))",
            "const { t } = useI18n()",
          ].join("\n"),
          newText: [
            "const props = defineProps<{ sessionId: string }>()",
            "const reading = useConversationReadingStore()",
            "// Pre-expand showcase disclosures when DESKFLEET_DEV_SHOWCASE=1 is active.",
            "provide(conversationReadingKey, () => reading.session(props.sessionId))",
            "const { t } = useI18n()",
            "",
            "// Showcase mode exposes all session controls for visual inspection.",
            "const showcaseReady = computed(() => Boolean(props.sessionId))",
            "const showcaseMetrics = {",
            "  cards: 8,",
            "  mediaBlocks: 2,",
            "  pendingPermissions: 1,",
            "  queuedInputs: 1,",
            "  disclosuresExpanded: true,",
            "  themePreview: 'adaptive',",
            "  isolatedProfile: true,",
            "  verified: true,",
            "}",
            "void showcaseReady",
            "void showcaseMetrics",
          ].join("\n"),
        },
      ],
    }),
    acpUpdate(11, "2026-04-12T10:00:52.000Z", {
      sessionUpdate: "tool_call",
      toolCallId: "tool-mcp-query",
      title: "mcp: sqlite.query (SELECT id, title, lifecycle FROM agent_sessions LIMIT 3)",
      kind: "other",
      status: "completed",
      rawInput: {
        server: "sqlite-inspector",
        tool: "query",
        sql: "SELECT id, title, lifecycle FROM agent_sessions LIMIT 3;",
      },
      rawOutput: {
        rows: [
          { id: "sess-showcase", title: "Implement Dev Showcase UI & Session Inspector", lifecycle: "ready" },
          { id: "sess-error", title: "Migrate legacy OAuth tokens", lifecycle: "error" },
        ],
      },
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: "Returned 2 rows from local SQLite catalog snapshot in 4.2ms.",
          },
        },
      ],
    }),
    acpUpdate(12, "2026-04-12T10:01:02.000Z", {
      sessionUpdate: "tool_call",
      toolCallId: "tool-failed-probe",
      title: "curl --fail http://127.0.0.1:5999/healthz",
      kind: "execute",
      status: "failed",
      rawInput: { command: "curl --fail http://127.0.0.1:5999/healthz" },
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: "curl: (7) Failed to connect to 127.0.0.1 port 5999: Connection refused (expected in login-free showcase mode)",
          },
        },
      ],
    }),
    acpUpdate(13, "2026-04-12T10:01:15.000Z", {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "image",
        mimeType: "image/svg+xml",
        data: SHOWCASE_SVG_BASE64,
        uri: "file:///workspace/deskfleet/docs/public/showcase-preview.svg",
      },
    }),
    acpUpdate(14, "2026-04-12T10:01:18.000Z", {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "audio",
        mimeType: "audio/wav",
        data: SHOWCASE_WAV_BASE64,
      },
    }),
    acpUpdate(15, "2026-04-12T10:01:25.000Z", {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: [
          "### Dev Showcase Mode Summary",
          "",
          "The showcase environment is active with an isolated profile and preloaded fixtures:",
          "",
          "- **Multi-block User Prompt**: Text, embedded pasted resource, and clickable file chip (`SessionView.vue`).",
          "- **Plan & Reasoning**: Live 3-step `AgentPlan` (`completed`, `in_progress`, `pending`) and collapsible reasoning.",
          "- **Tool Calls & Diff**: Terminal output (`execute`), file diff with `+18 -4` badge (`edit`), `search`, `mcp`, and `failed` status.",
          "- **Media & Rich Text**: Inline SVG image preview, WAV audio player, GFM table, and syntax-highlighted code.",
          "",
          "| Surface Area | Fixture ID | Status | Highlights |",
          "| :--- | :--- | :--- | :--- |",
          "| Primary Session | `sess-showcase` | `awaiting_permission` | Full conversation, plan, tools, media, backlog |",
          "| Error Session | `sess-error` | `error` | Displays top `ErrorNotice` banner in sidebar/session |",
          "| Online Machine | `machine-studio` | `online` | 2 workspaces, 3 worktrees, Git diff & branches |",
          "| Offline Machine | `machine-lab` | `offline` | Cached catalog browsing while disconnected |",
          "",
          "```ts",
          "// Launch login-free UI showcase",
          "export function isDevShowcaseEnabled(env = process.env): boolean {",
          "  return env.DESKFLEET_DEV_SHOWCASE === \"1\"",
          "}",
          "```",
        ].join("\n"),
      },
    }),
    acpUpdate(16, "2026-04-12T10:17:09.000Z", {
      sessionUpdate: "tool_call",
      toolCallId: "tool-perm-deploy",
      title: "pnpm --filter @deskfleet/desktop showcase:verify --env staging",
      kind: "execute",
      status: "pending",
      locations: [{ path: "/workspace/deskfleet/apps/desktop/package.json", line: 12 }],
    }),
    {
      sessionId,
      seq: "17",
      kind: "input",
      inputId: queuedInput.id,
      runGeneration: 1,
      createdAt: "2026-04-12T10:17:30.000Z",
      payload: queuedInput,
    },
    {
      sessionId,
      seq: "18",
      kind: "permission",
      turnId: SHOWCASE_TURN_ID,
      runGeneration: 1,
      createdAt: "2026-04-12T10:17:10.000Z",
      payload: permission,
    },
  ]
}

export const DEV_SHOWCASE_DEFAULT_DISCLOSURES: Record<string, boolean> = {
  "thought:message-6": true,
  [`activity:tool-${JSON.stringify([1, SHOWCASE_PROVIDER_SESSION_ID, "tool-search-1"])}`]: true,
  [`tool:tool-${JSON.stringify([1, SHOWCASE_PROVIDER_SESSION_ID, "tool-cmd-check"])}`]: true,
  [`tool:tool-${JSON.stringify([1, SHOWCASE_PROVIDER_SESSION_ID, "tool-edit-session-view"])}`]: true,
}

export function createDevShowcaseErrorSnapshot(): AgentSnapshot {
  const session: AgentSessionRecord = {
    id: DEV_SHOWCASE_ERROR_SESSION_ID,
    workspaceId: DEV_SHOWCASE_WORKSPACE_ID,
    provider: "codex",
    providerSessionId: "prov-sess-error",
    title: "Migrate legacy OAuth tokens (Error State Demo)",
    context: "worktree",
    lifecycle: "error",
    archiveState: "active",
    configuration: createDevShowcaseConfiguration("codex"),
    lastEventSeq: "2",
    lastCompletedSeq: "2",
    lastReadSeq: "1",
    createdAt: "2026-04-12T09:30:00.000Z",
    updatedAt: "2026-04-12T09:31:15.000Z",
    error: "Worktree checkout failed: fatal: reference is not a tree: 9f8e7d6c5b4a3210 (simulated showcase error banner).",
  }
  const input: AgentInput = {
    id: "input-error-1",
    sessionId: DEV_SHOWCASE_ERROR_SESSION_ID,
    submissionCommandId: "cmd-error-1",
    author: { kind: "user", userId: "user-ada" },
    acceptedSeq: "1",
    state: "delivered",
    requestedDelivery: "backlog",
    actualDelivery: "turn_start",
    turnId: "turn-error-1",
    createdAt: "2026-04-12T09:30:05.000Z",
    deliveredAt: "2026-04-12T09:30:06.000Z",
    content: [{ type: "text", text: "Run the OAuth token schema migration on the legacy worktree." }],
  }
  const turn: AgentTurn = {
    id: "turn-error-1",
    sessionId: DEV_SHOWCASE_ERROR_SESSION_ID,
    initialInputId: input.id,
    dispatchCommandId: "cmd-error-1",
    runGeneration: 1,
    state: "failed",
    consumed: false,
    startedAt: "2026-04-12T09:30:06.000Z",
    endedAt: "2026-04-12T09:31:15.000Z",
    error: "Provider process exited with code 128: unable to prepare Git worktree.",
  }
  const elicitation = {
    id: "elicit-error-1",
    sessionId: DEV_SHOWCASE_ERROR_SESSION_ID,
    turnId: "turn-error-1",
    runGeneration: 1,
    state: "pending" as const,
    createdAt: "2026-04-12T09:31:20.000Z",
    request: {
      sessionId: "prov-sess-error",
      mode: "form" as const,
      message: "Choose worktree recovery options:",
      requestedSchema: {
        type: "object",
        properties: {
          strategy: {
            type: "string",
            title: "Recovery strategy",
            default: "recreate",
            oneOf: [
              { const: "recreate", title: "Recreate worktree", description: "Reset cleanly from committed HEAD" },
              { const: "keep", title: "Keep existing checkout", description: "Preserve untracked local files" },
            ],
          },
          scopes: {
            type: "array",
            title: "Verification targets",
            default: ["web"],
            items: {
              anyOf: [
                { const: "web", title: "Web client", description: "Run Vite + UnoCSS verification" },
                { const: "desktop", title: "Desktop client", description: "Run Electron renderer suite" },
              ],
            },
          },
        },
        required: ["strategy"],
      },
    },
  }
  return {
    session,
    runs: [{ sessionId: DEV_SHOWCASE_ERROR_SESSION_ID, generation: 1, state: "failed", startedAt: "2026-04-12T09:30:05.000Z", endedAt: "2026-04-12T09:31:15.000Z", error: session.error }],
    inputs: [input],
    turns: [turn],
    permissions: [],
    elicitations: [elicitation],
  }
}

export function createDevShowcaseErrorEvents(snapshot = createDevShowcaseErrorSnapshot()): AgentEvent[] {
  return [
    { sessionId: snapshot.session.id, seq: "1", kind: "input", turnId: "turn-error-1", inputId: snapshot.inputs[0]!.id, runGeneration: 1, createdAt: "2026-04-12T09:30:05.000Z", payload: snapshot.inputs[0]! },
    { sessionId: snapshot.session.id, seq: "2", kind: "turn", turnId: "turn-error-1", runGeneration: 1, createdAt: "2026-04-12T09:31:15.000Z", payload: snapshot.turns[0]! },
    { sessionId: snapshot.session.id, seq: "3", kind: "elicitation", turnId: "turn-error-1", runGeneration: 1, createdAt: "2026-04-12T09:31:20.000Z", payload: snapshot.elicitations[0]! },
  ]
}

function createCompletedStubSnapshot(options: {
  id: string
  workspaceId: string
  provider: string
  providerSessionId: string
  title: string
  archiveState: "active" | "archived"
  prompt: string
  createdAt: string
  updatedAt: string
}): AgentSnapshot {
  const inputId = `input-${options.id}`
  const turnId = `turn-${options.id}`
  const cmdId = `cmd-${options.id}`
  const session: AgentSessionRecord = {
    id: options.id,
    workspaceId: options.workspaceId,
    provider: options.provider,
    providerSessionId: options.providerSessionId,
    title: options.title,
    context: "directory",
    lifecycle: "ready",
    archiveState: options.archiveState,
    capabilities: { steering: true, resume: true, fork: true, additionalDirectories: true },
    lastEventSeq: "0",
    lastCompletedSeq: "0",
    lastReadSeq: "0",
    createdAt: options.createdAt,
    updatedAt: options.updatedAt,
  }
  const input: AgentInput = {
    id: inputId,
    sessionId: options.id,
    submissionCommandId: cmdId,
    author: { kind: "user", userId: "user-ada" },
    acceptedSeq: "1",
    state: "delivered",
    requestedDelivery: "backlog",
    actualDelivery: "turn_start",
    turnId,
    createdAt: options.createdAt,
    deliveredAt: options.createdAt,
    content: [{ type: "text", text: options.prompt }],
  }
  const turn: AgentTurn = {
    id: turnId,
    sessionId: options.id,
    initialInputId: input.id,
    dispatchCommandId: cmdId,
    runGeneration: 1,
    state: "completed",
    consumed: true,
    startedAt: options.createdAt,
    endedAt: options.updatedAt,
    stopReason: "end_turn",
  }
  return { session, runs: [], inputs: [input], turns: [turn], permissions: [], elicitations: [] }
}

export function createDevShowcaseArchivedSnapshot(): AgentSnapshot {
  return createCompletedStubSnapshot({
    id: DEV_SHOWCASE_ARCHIVED_SESSION_ID,
    workspaceId: DEV_SHOWCASE_SECONDARY_WORKSPACE_ID,
    provider: "claude-code",
    providerSessionId: "prov-sess-archived",
    title: "Audit WebRTC TURN relay fallback metrics",
    archiveState: "archived",
    prompt: "Summarize TURN relay fallback latency across regions.",
    createdAt: "2026-04-10T15:00:00.000Z",
    updatedAt: "2026-04-10T15:20:00.000Z",
  })
}

export function createDevShowcaseRemoteSnapshot(): AgentSnapshot {
  return createCompletedStubSnapshot({
    id: DEV_SHOWCASE_REMOTE_SESSION_ID,
    workspaceId: "201",
    provider: "codex",
    providerSessionId: "prov-sess-remote",
    title: "Verify Linux x86_64 release artifacts",
    archiveState: "active",
    prompt: "Check cargo build --release artifacts on the runner.",
    createdAt: "2026-04-12T08:00:00.000Z",
    updatedAt: "2026-04-12T08:05:00.000Z",
  })
}

export const DEV_SHOWCASE_ACCOUNT: AccountState = {
  serverUrl: "https://fleet.deskfleet.dev",
  siteAdmin: true,
  user: { id: "user-ada", name: "Ada Lovelace", email: "ada@deskfleet.dev" },
}

export const DEV_SHOWCASE_SITE: SiteSettings = {
  siteName: "DeskFleet",
  announcement: "",
  allowTeamCreation: true,
  termsOfServiceUrl: "",
  privacyTermsUrl: "",
}

export const DEV_SHOWCASE_TEAMS: Team[] = [
  { id: DEV_SHOWCASE_TEAM_ID, name: "DeskFleet Core", role: "owner" },
  { id: DEV_SHOWCASE_SECONDARY_TEAM_ID, name: "Design Systems", role: "admin" },
]

export const DEV_SHOWCASE_MEMBERS: TeamMember[] = [
  { userId: "user-ada", name: "Ada Lovelace", email: "ada@deskfleet.dev", role: "owner" },
  { userId: "user-linus", name: "Linus Torvalds", email: "linus@deskfleet.dev", role: "admin" },
  { userId: "user-grace", name: "Grace Hopper", email: "grace@deskfleet.dev", role: "member" },
]

export const DEV_SHOWCASE_MACHINES: Machine[] = [
  {
    id: DEV_SHOWCASE_LOCAL_MACHINE_ID,
    teamId: DEV_SHOWCASE_TEAM_ID,
    name: "Studio MacBook Pro",
    originId: "origin-showcase-studio",
    localMachineId: "1",
    online: true,
    lastSeenAt: "2026-04-12T10:18:00.000Z",
    capabilities: {
      desktop: true,
      platform: "darwin",
      mux: MUX_PROFILE,
      muxServer: MUX_PROFILE,
      remoteAgent: { read: true, operate: true, session: true },
    },
  },
  {
    id: DEV_SHOWCASE_REMOTE_MACHINE_ID,
    teamId: DEV_SHOWCASE_TEAM_ID,
    name: "Build Runner us-east",
    originId: "origin-showcase-runner",
    localMachineId: "2",
    online: true,
    lastSeenAt: "2026-04-12T10:17:50.000Z",
    capabilities: {
      desktop: true,
      platform: "linux",
      mux: MUX_PROFILE,
      muxServer: MUX_PROFILE,
      remoteAgent: { read: true, operate: true, session: true },
    },
  },
  {
    id: DEV_SHOWCASE_OFFLINE_MACHINE_ID,
    teamId: DEV_SHOWCASE_TEAM_ID,
    name: "Lab Workstation",
    originId: "origin-showcase-lab",
    localMachineId: "3",
    online: false,
    lastSeenAt: "2026-04-11T22:14:00.000Z",
    capabilities: {
      desktop: true,
      platform: "win32",
    },
  },
]

export const DEV_SHOWCASE_LOCAL_ENROLLMENT: LocalMachineStatus = {
  machineName: "Studio MacBook Pro",
  registrations: [
    {
      configured: true,
      connected: true,
      revoked: false,
      serverUrl: "https://fleet.deskfleet.dev",
      teamId: DEV_SHOWCASE_TEAM_ID,
      machineId: DEV_SHOWCASE_LOCAL_MACHINE_ID,
      machineName: "Studio MacBook Pro",
      identity: { originId: "origin-showcase-studio", machineId: DEV_SHOWCASE_LOCAL_MACHINE_ID },
    },
  ],
}

export const DEV_SHOWCASE_PROVIDER_SNAPSHOT: ProviderSnapshot = {
  revision: "rev-showcase-1",
  shellEnvironmentDefault: true,
  templates: [
    { id: "claude-code", name: "Claude Code", defaultBinaryPath: "claude" },
    { id: "codex", name: "Codex", defaultBinaryPath: "codex" },
    { id: "cursor", name: "Cursor", defaultBinaryPath: "cursor-agent" },
    { id: "antigravity", name: "Antigravity", defaultBinaryPath: "agy" },
  ],
  providers: [
    { id: "claude-code", template: "claude-code", name: "Claude Code", binaryPath: "/opt/homebrew/bin/claude", env: {} },
    { id: "codex", template: "codex", name: "Codex", binaryPath: "/opt/homebrew/bin/codex", env: {} },
    { id: "cursor", template: "cursor", name: "Cursor Agent", binaryPath: "/usr/local/bin/cursor-agent", env: {} },
  ],
}

export const DEV_SHOWCASE_CATALOGS: Record<string, CatalogSnapshot> = {
  [DEV_SHOWCASE_LOCAL_MACHINE_ID]: {
    teamId: DEV_SHOWCASE_TEAM_ID,
    machineId: DEV_SHOWCASE_LOCAL_MACHINE_ID,
    machineName: "Studio MacBook Pro",
    sessionIds: [DEV_SHOWCASE_SESSION_ID, DEV_SHOWCASE_ERROR_SESSION_ID, DEV_SHOWCASE_ARCHIVED_SESSION_ID],
    sessions: [],
    githubBranches: [
      {
        sessionId: DEV_SHOWCASE_SESSION_ID,
        repositories: [{ repository: "yet-another-ai/deskfleet", headRepository: "yet-another-ai/deskfleet", branch: "feat/dev-showcase" }],
      },
    ],
    workspaces: [
      {
        id: DEV_SHOWCASE_WORKSPACE_ID,
        name: "deskfleet",
        worktrees: [
          { id: "wt-main-101", workspaceId: DEV_SHOWCASE_WORKSPACE_ID, directories: [{ path: "/workspace/deskfleet" }] },
          { id: "wt-sess-showcase", workspaceId: DEV_SHOWCASE_WORKSPACE_ID, sessionId: DEV_SHOWCASE_SESSION_ID, directories: [{ path: "/workspace/deskfleet/.worktrees/feat-dev-showcase" }] },
          { id: "wt-sess-error", workspaceId: DEV_SHOWCASE_WORKSPACE_ID, sessionId: DEV_SHOWCASE_ERROR_SESSION_ID, directories: [{ path: "/workspace/deskfleet/.worktrees/fix-legacy-auth" }] },
        ],
      },
      {
        id: DEV_SHOWCASE_SECONDARY_WORKSPACE_ID,
        name: "cloud-runtime",
        worktrees: [
          { id: "wt-main-102", workspaceId: DEV_SHOWCASE_SECONDARY_WORKSPACE_ID, directories: [{ path: "/workspace/cloud-runtime" }, { path: "/workspace/cloud-protocol" }] },
        ],
      },
    ],
  },
  [DEV_SHOWCASE_REMOTE_MACHINE_ID]: {
    teamId: DEV_SHOWCASE_TEAM_ID,
    machineId: DEV_SHOWCASE_REMOTE_MACHINE_ID,
    machineName: "Build Runner us-east",
    sessionIds: [DEV_SHOWCASE_REMOTE_SESSION_ID],
    sessions: [],
    workspaces: [
      {
        id: "201",
        name: "release-pipeline",
        worktrees: [
          { id: "wt-main-201", workspaceId: "201", directories: [{ path: "/srv/deskfleet/release-pipeline" }] },
        ],
      },
    ],
  },
}

export const DEV_SHOWCASE_GIT_STATUS: GitStatusSnapshot = {
  sessionId: DEV_SHOWCASE_SESSION_ID,
  directories: [{ path: "/workspace/deskfleet/.worktrees/feat-dev-showcase", repositoryId: "repo-deskfleet" }],
  repositories: [
    {
      id: "repo-deskfleet",
      root: "/workspace/deskfleet/.worktrees/feat-dev-showcase",
      branch: "feat/dev-showcase",
      head: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      changes: [
        { path: "packages/components/src/views/SessionView.vue", kind: "unstaged", status: "modified", additions: 18, deletions: 4 },
        { path: "packages/components/src/dev-showcase.ts", kind: "untracked", status: "untracked", additions: 142, deletions: 0 },
        { path: "apps/desktop/scripts/dev.ts", kind: "staged", status: "modified", additions: 14, deletions: 2 },
      ],
    },
  ],
}

export const DEV_SHOWCASE_GIT_BRANCHES: GitBranchesSnapshot = {
  workspaceId: DEV_SHOWCASE_WORKSPACE_ID,
  currentBranch: "main",
  branches: ["main", "feat/dev-showcase", "release/0.13"],
}

export const DEV_SHOWCASE_GIT_PREPARATION: GitPreparationSnapshot = {
  workspaceId: DEV_SHOWCASE_WORKSPACE_ID,
  context: "worktree",
  status: "ready",
  repositories: [{ root: "/workspace/deskfleet", branch: "main", changes: [] }],
  baseRevisions: [{ path: "/workspace/deskfleet", revision: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" }],
}

export function createDevShowcaseGitDiff(request: { sessionId: string; repositoryId: string; path: string; kind: "staged" | "unstaged" | "untracked" }): GitFileDiff {
  return {
    ...request,
    binary: false,
    truncated: false,
    patch: [
      `--- a/${request.path}`,
      `+++ b/${request.path}`,
      "@@ -46,4 +46,6 @@",
      " const reading = useConversationReadingStore()",
      "+// Pre-expand showcase disclosures when DESKFLEET_DEV_SHOWCASE=1 is active.",
      " provide(conversationReadingKey, () => reading.session(props.sessionId))",
    ].join("\n"),
  }
}

export const DEV_SHOWCASE_SCHEDULES: ScheduleSnapshot = {
  tasks: [],
  lastObservedAt: "2026-04-12T10:00:00.000Z",
}
