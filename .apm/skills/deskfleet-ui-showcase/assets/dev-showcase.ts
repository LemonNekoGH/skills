import type * as acp from "@agentclientprotocol/sdk/unstable"
import { agentComposerCatalog, agentConfiguration, type AgentConfiguration } from "@deskfleet-repo/packages/protocol/src/agent-configuration.ts"
import type { AgentEvent, AgentInput, AgentReceipt, AgentSnapshot } from "@deskfleet-repo/packages/protocol/src/agent.ts"
import type { CatalogSnapshot } from "@deskfleet-repo/packages/protocol/src/catalog.ts"
import type { GitDiffRequest } from "@deskfleet-repo/packages/protocol/src/git.ts"
import type { AgentProviderConfig, AgentProviderInput, AgentProviderSettings, ProviderSnapshot } from "@deskfleet-repo/packages/protocol/src/provider.ts"
import { DEFAULT_APPEARANCE_SETTINGS } from "@deskfleet-repo/packages/client/src/appearance.ts"
import type { CentralApi, CentralEvent, Machine, Team } from "@deskfleet-repo/packages/client/src/central.ts"
import type { DeskfleetDesktopApi } from "@deskfleet-repo/packages/client/src/desktop-api.ts"
import { DEFAULT_LOCALE } from "@deskfleet-repo/packages/client/src/i18n.ts"
import type { LocalChannelEvent, LocalChannelOpen, LocalChannelsApi } from "@deskfleet-repo/packages/client/src/local-channels.ts"
import {
  createDevShowcaseArchivedSnapshot,
  createDevShowcaseConfiguration,
  createDevShowcaseErrorEvents,
  createDevShowcaseErrorSnapshot,
  createDevShowcaseEvents,
  createDevShowcaseGitDiff,
  createDevShowcaseRemoteSnapshot,
  createDevShowcaseSnapshot,
  DEV_SHOWCASE_ACCOUNT,
  DEV_SHOWCASE_ARCHIVED_SESSION_ID,
  DEV_SHOWCASE_AVAILABLE_COMMANDS,
  DEV_SHOWCASE_CATALOGS,
  DEV_SHOWCASE_CONFIG_OPTIONS,
  DEV_SHOWCASE_ERROR_SESSION_ID,
  DEV_SHOWCASE_GIT_BRANCHES,
  DEV_SHOWCASE_GIT_PREPARATION,
  DEV_SHOWCASE_GIT_STATUS,
  DEV_SHOWCASE_LOCAL_ENROLLMENT,
  DEV_SHOWCASE_LOCAL_MACHINE_ID,
  DEV_SHOWCASE_MACHINES,
  DEV_SHOWCASE_MEMBERS,
  DEV_SHOWCASE_PROVIDER_SNAPSHOT,
  DEV_SHOWCASE_REMOTE_MACHINE_ID,
  DEV_SHOWCASE_REMOTE_SESSION_ID,
  DEV_SHOWCASE_SCHEDULES,
  DEV_SHOWCASE_SESSION_ID,
  DEV_SHOWCASE_SITE,
  DEV_SHOWCASE_TEAM_ID,
  DEV_SHOWCASE_TEAMS,
} from "./dev-showcase-fixtures.ts"

export * from "./dev-showcase-fixtures.ts"

interface SessionRecordState {
  machineId: string
  snapshot: AgentSnapshot
  events: AgentEvent[]
  configuration: AgentConfiguration
  configOptions: acp.SessionConfigOption[]
}

function createInitialSessions(): Map<string, SessionRecordState> {
  const showcaseSnapshot = createDevShowcaseSnapshot()
  const errorSnapshot = createDevShowcaseErrorSnapshot()
  const archivedSnapshot = createDevShowcaseArchivedSnapshot()
  const remoteSnapshot = createDevShowcaseRemoteSnapshot()
  return new Map<string, SessionRecordState>([
    [DEV_SHOWCASE_SESSION_ID, {
      machineId: DEV_SHOWCASE_LOCAL_MACHINE_ID,
      snapshot: showcaseSnapshot,
      events: createDevShowcaseEvents(showcaseSnapshot),
      configuration: createDevShowcaseConfiguration("claude-code"),
      configOptions: structuredClone(DEV_SHOWCASE_CONFIG_OPTIONS),
    }],
    [DEV_SHOWCASE_ERROR_SESSION_ID, {
      machineId: DEV_SHOWCASE_LOCAL_MACHINE_ID,
      snapshot: errorSnapshot,
      events: createDevShowcaseErrorEvents(errorSnapshot),
      configuration: createDevShowcaseConfiguration("codex"),
      configOptions: structuredClone(DEV_SHOWCASE_CONFIG_OPTIONS),
    }],
    [DEV_SHOWCASE_ARCHIVED_SESSION_ID, {
      machineId: DEV_SHOWCASE_LOCAL_MACHINE_ID,
      snapshot: archivedSnapshot,
      events: [],
      configuration: createDevShowcaseConfiguration("claude-code"),
      configOptions: structuredClone(DEV_SHOWCASE_CONFIG_OPTIONS),
    }],
    [DEV_SHOWCASE_REMOTE_SESSION_ID, {
      machineId: DEV_SHOWCASE_REMOTE_MACHINE_ID,
      snapshot: remoteSnapshot,
      events: [],
      configuration: createDevShowcaseConfiguration("codex"),
      configOptions: structuredClone(DEV_SHOWCASE_CONFIG_OPTIONS),
    }],
  ])
}

/** In-memory Central + ACP host for DeskFleet UI Showcase without a daemon or account login. */
export function createDevShowcaseDesktopApi(base?: Partial<DeskfleetDesktopApi>): DeskfleetDesktopApi {
  if (typeof window !== "undefined" && (!window.location.hash || window.location.hash === "#" || window.location.hash === "#/")) {
    window.location.hash = `#/sessions/${DEV_SHOWCASE_SESSION_ID}`
  }

  const centralListeners = new Set<(event: CentralEvent) => void>()
  const channelListeners = new Set<(event: LocalChannelEvent) => void>()
  const openChannels = new Map<string, LocalChannelOpen & { buffer: string }>()
  const teams = structuredClone(DEV_SHOWCASE_TEAMS)
  const machines = structuredClone(DEV_SHOWCASE_MACHINES)
  const catalogs: Record<string, CatalogSnapshot> = structuredClone(DEV_SHOWCASE_CATALOGS)
  const providerState: ProviderSnapshot = structuredClone(DEV_SHOWCASE_PROVIDER_SNAPSHOT)
  const sessions = createInitialSessions()

  const emitCentral = (event: CentralEvent) => {
    for (const listener of centralListeners) listener(event)
  }
  const emitChannelMessage = (connectionId: string, payload: unknown) => {
    const bytes = new TextEncoder().encode(`${JSON.stringify(payload)}\n`)
    for (const listener of channelListeners) listener({ connectionId, kind: "message", data: bytes })
  }
  const broadcastAgentNotification = (machineId: string, method: string, params: unknown) => {
    for (const [connectionId, channel] of openChannels) {
      if (channel.purpose === "agent" && channel.machineId === machineId) {
        emitChannelMessage(connectionId, { jsonrpc: "2.0", method, params })
      }
    }
  }

  function appendSessionEvent(state: SessionRecordState, draft: Omit<AgentEvent, "seq">): AgentEvent {
    const nextSeq = (BigInt(state.snapshot.session.lastEventSeq || "0") + 1n).toString()
    const event: AgentEvent = { ...draft, seq: nextSeq }
    state.snapshot.session.lastEventSeq = nextSeq
    state.snapshot.session.updatedAt = draft.createdAt
    state.events.push(event)
    broadcastAgentNotification(state.machineId, "_deskfleet/session/event", event)
    return event
  }

  function applyConfigSelection(state: SessionRecordState, params: Record<string, unknown>): AgentConfiguration {
    for (const option of state.configOptions) {
      if (option.id === "model" && typeof params.model === "string") option.currentValue = params.model
      if (option.id === "reasoning_effort" && typeof params.reasoningEffort === "string") option.currentValue = params.reasoningEffort
      if (option.id === "mode" && typeof params.mode === "string") option.currentValue = params.mode
      if (params.configValues && typeof params.configValues === "object" && !Array.isArray(params.configValues)) {
        const nextValue = (params.configValues as Record<string, unknown>)[option.id]
        if (typeof nextValue === "string" && option.type === "select") option.currentValue = nextValue
        if (typeof nextValue === "boolean" && option.type === "boolean") option.currentValue = nextValue
      }
    }
    const nextOptions = structuredClone(state.configOptions)
    state.configuration = {
      provider: state.snapshot.session.provider,
      ...agentConfiguration(nextOptions),
      ...agentComposerCatalog(nextOptions, DEV_SHOWCASE_AVAILABLE_COMMANDS),
      updatedAt: new Date().toISOString(),
    }
    return structuredClone(state.configuration)
  }

  async function handleAgentMethod(machineId: string, method: string, rawParams: unknown): Promise<unknown> {
    const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Record<string, unknown>
    const sessionId = typeof params.sessionId === "string" ? params.sessionId : DEV_SHOWCASE_SESSION_ID
    const state = sessions.get(sessionId)

    switch (method) {
      case "initialize":
        return { protocolVersion: 1, agentCapabilities: { loadSession: true } }
      case "_deskfleet/agent/configuration": {
        const providerId = typeof params.provider === "string" ? params.provider : "claude-code"
        return createDevShowcaseConfiguration(providerId)
      }
      case "_deskfleet/session/configuration":
        return structuredClone((state ?? sessions.get(DEV_SHOWCASE_SESSION_ID)!).configuration)
      case "_deskfleet/session/configure":
        return state ? applyConfigSelection(state, params) : createDevShowcaseConfiguration()
      case "_deskfleet/session/switch-agent": {
        if (!state) throw new Error(`Unknown showcase session: ${sessionId}`)
        const providerId = typeof params.provider === "string" ? params.provider : state.snapshot.session.provider
        state.snapshot.session.provider = providerId
        applyConfigSelection(state, {})
        return structuredClone(state.snapshot)
      }
      case "_deskfleet/session/list":
        return [...sessions.values()]
          .filter(item => item.machineId === machineId)
          .map(item => structuredClone(item.snapshot.session))
      case "_deskfleet/session/subscribe":
        if (!state) throw new Error(`Unknown showcase session: ${sessionId}`)
        return structuredClone(state.snapshot)
      case "_deskfleet/session/history": {
        if (!state) return []
        const after = BigInt(typeof params.afterSeq === "string" ? params.afterSeq : "0")
        const limit = typeof params.limit === "number" ? params.limit : 200
        return structuredClone(state.events.filter(event => BigInt(event.seq) > after).slice(0, limit))
      }
      case "_deskfleet/session/read":
        if (state && typeof params.throughSeq === "string") {
          state.snapshot.session.lastReadSeq = params.throughSeq
        }
        return structuredClone((state ?? sessions.get(DEV_SHOWCASE_SESSION_ID)!).snapshot)
      case "_deskfleet/session/unread":
        if (state) state.snapshot.session.lastReadSeq = "0"
        return structuredClone((state ?? sessions.get(DEV_SHOWCASE_SESSION_ID)!).snapshot)
      case "_deskfleet/session/rename":
        if (state && typeof params.title === "string") {
          state.snapshot.session.title = params.title
          state.snapshot.session.titleCustomized = true
        }
        return structuredClone((state ?? sessions.get(DEV_SHOWCASE_SESSION_ID)!).snapshot)
      case "_deskfleet/session/archive":
        if (state) state.snapshot.session.archiveState = "archived"
        return structuredClone((state ?? sessions.get(DEV_SHOWCASE_SESSION_ID)!).snapshot)
      case "_deskfleet/session/restore":
        if (state) state.snapshot.session.archiveState = "active"
        return structuredClone((state ?? sessions.get(DEV_SHOWCASE_SESSION_ID)!).snapshot)
      case "_deskfleet/session/delete":
        sessions.delete(sessionId)
        return null
      case "_deskfleet/session/attend":
      case "_deskfleet/session/leave":
      case "_deskfleet/git/subscribe":
      case "_deskfleet/git/unsubscribe":
        return null
      case "_deskfleet/git/branches":
        return structuredClone(DEV_SHOWCASE_GIT_BRANCHES)
      case "_deskfleet/git/prepare":
        return structuredClone(DEV_SHOWCASE_GIT_PREPARATION)
      case "_deskfleet/git/status":
        return { ...structuredClone(DEV_SHOWCASE_GIT_STATUS), sessionId }
      case "_deskfleet/git/diff":
        return createDevShowcaseGitDiff(params as unknown as GitDiffRequest)
      case "_deskfleet/composer/references":
        return {
          files: [
            { path: "packages/components/src/views/SessionView.vue" },
            { path: "packages/components/src/dev-showcase.ts" },
            { path: "apps/desktop/scripts/dev.ts" },
          ],
        }
      case "_deskfleet/composer/resolve":
        return []
      case "_deskfleet/permission/respond": {
        if (!state) throw new Error(`Unknown showcase session: ${sessionId}`)
        const permission = state.snapshot.permissions.find(item => item.id === params.permissionId)
        if (!permission) throw new Error("Permission not found")
        permission.state = "resolved"
        permission.optionId = typeof params.optionId === "string" ? params.optionId : "allow_once"
        permission.resolvedAt = new Date().toISOString()
        appendSessionEvent(state, {
          sessionId,
          kind: "permission",
          turnId: permission.turnId,
          runGeneration: permission.runGeneration,
          createdAt: permission.resolvedAt,
          payload: structuredClone(permission),
        })
        emitCentral({ type: "catalogChanged", teamId: DEV_SHOWCASE_TEAM_ID, machineId, sessionId })
        return structuredClone(permission)
      }
      case "_deskfleet/input/withdraw": {
        if (state && typeof params.inputId === "string") {
          const input = state.snapshot.inputs.find(item => item.id === params.inputId)
          if (input) {
            input.state = "withdrawn"
            appendSessionEvent(state, {
              sessionId,
              kind: "input",
              inputId: input.id,
              createdAt: new Date().toISOString(),
              payload: structuredClone(input),
            })
          }
        }
        return {
          operationId: String(params.operationId ?? "op-withdraw"),
          commandId: `cmd-${Date.now()}`,
          inputId: typeof params.inputId === "string" ? params.inputId : undefined,
          sessionId,
        } satisfies AgentReceipt
      }
      case "_deskfleet/input/steer":
      case "_deskfleet/input/retry":
      case "_deskfleet/input/submit": {
        const operationId = String(params.operationId ?? `op-${Date.now()}`)
        const commandId = `cmd-${Date.now()}`
        const inputId = typeof params.inputId === "string" ? params.inputId : `input-${Date.now()}`
        if (state && method === "_deskfleet/input/submit" && Array.isArray(params.content)) {
          const created: AgentInput = {
            id: inputId,
            sessionId,
            submissionCommandId: commandId,
            author: { kind: "user", userId: "user-ada" },
            content: params.content as AgentInput["content"],
            acceptedSeq: (BigInt(state.snapshot.session.lastEventSeq || "0") + 1n).toString(),
            state: "pending",
            requestedDelivery: params.delivery === "steer" ? "steer" : "backlog",
            createdAt: new Date().toISOString(),
          }
          state.snapshot.inputs.push(created)
          appendSessionEvent(state, {
            sessionId,
            kind: "input",
            inputId,
            commandId,
            createdAt: created.createdAt,
            payload: structuredClone(created),
          })
        }
        return { operationId, commandId, inputId, sessionId } satisfies AgentReceipt
      }
      case "_deskfleet/turn/cancel":
        return {
          operationId: String(params.operationId ?? `op-${Date.now()}`),
          commandId: `cmd-${Date.now()}`,
          sessionId,
        } satisfies AgentReceipt
      case "_deskfleet/command/get":
        return null
      default:
        return null
    }
  }

  async function handleRpc<T>(machineId: string, method: string, params: unknown): Promise<T> {
    if (method.startsWith("_deskfleet/")) {
      return await handleAgentMethod(machineId, method, params) as T
    }
    const record = (params && typeof params === "object" ? params : {}) as Record<string, unknown>
    switch (method) {
      case "terminalList":
      case "scheduleList":
        return [] as unknown as T
      case "providerList":
        return structuredClone(providerState) as unknown as T
      case "providerCreate": {
        const input = record.provider as AgentProviderInput
        const created: AgentProviderConfig = { ...input, id: `${input.template}-${Date.now()}` }
        providerState.providers.push(created)
        return structuredClone(created) as unknown as T
      }
      case "providerUpdate": {
        const target = providerState.providers.find(item => item.id === record.providerId)
        if (target && record.changes && typeof record.changes === "object") {
          Object.assign(target, record.changes as AgentProviderSettings)
        }
        return structuredClone(target ?? providerState.providers[0]!) as unknown as T
      }
      case "providerRemove":
        providerState.providers = providerState.providers.filter(item => item.id !== record.providerId)
        return null as unknown as T
      case "providerProbe":
        return {
          status: "found",
          binaryPath: "/opt/homebrew/bin/claude",
          version: "1.0.24",
          auth: "authenticated",
          installable: false,
          loginAvailable: true,
        } as unknown as T
      case "providerTest":
        return { agentName: "Claude Code (Showcase)" } as unknown as T
      case "systemStatus":
        return { hostname: "studio-mbp.local", platform: "darwin", arch: "arm64", uptimeSeconds: 86_400 } as unknown as T
      case "capabilities":
        return {
          desktop: true,
          audio: false,
          codecs: ["vp8", "h264"],
          displays: [{ id: "display-1", name: "Built-in Retina XDR Display", width: 1728, height: 1117, primary: true, scaleFactor: 2 }],
        } as unknown as T
      case "directoryList":
        return {
          path: typeof record.path === "string" ? record.path : "/workspace",
          parentPath: "/",
          entries: [
            { name: "deskfleet", path: "/workspace/deskfleet" },
            { name: "cloud-runtime", path: "/workspace/cloud-runtime" },
          ],
        } as unknown as T
      case "workspaceCreate": {
        const catalog = catalogs[machineId] ?? catalogs[DEV_SHOWCASE_LOCAL_MACHINE_ID]!
        const workspaceId = String(100 + catalog.workspaces.length + 1)
        const created = {
          id: workspaceId,
          name: String(record.name ?? "new-workspace"),
          worktrees: [{ id: `wt-${Date.now()}`, workspaceId, directories: Array.isArray(record.directories) ? record.directories as { path: string }[] : [{ path: "/workspace/new" }] }],
        }
        catalog.workspaces.push(created)
        emitCentral({ type: "catalogChanged", teamId: DEV_SHOWCASE_TEAM_ID, machineId })
        return structuredClone(created) as unknown as T
      }
      default:
        return null as unknown as T
    }
  }

  const channels: LocalChannelsApi = {
    async open(options) {
      openChannels.set(options.connectionId, { ...options, buffer: "" })
    },
    async send(connectionId, data) {
      const channel = openChannels.get(connectionId)
      if (!channel) return
      const chunk = typeof data === "string" ? data : new TextDecoder().decode(data)
      channel.buffer += chunk
      const lines = channel.buffer.split("\n")
      channel.buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        const message = JSON.parse(line) as { id?: number | string; method?: string; params?: unknown }
        if (message.method && message.id !== undefined) {
          try {
            const result = await handleAgentMethod(channel.machineId, message.method, message.params)
            emitChannelMessage(connectionId, { jsonrpc: "2.0", id: message.id, result })
          } catch (error) {
            emitChannelMessage(connectionId, {
              jsonrpc: "2.0",
              id: message.id,
              error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
            })
          }
        }
      }
    },
    async close(connectionId) {
      openChannels.delete(connectionId)
    },
    onEvent(listener) {
      channelListeners.add(listener)
      return () => { channelListeners.delete(listener) }
    },
  }

  const central: CentralApi = {
    status: async () => structuredClone(DEV_SHOWCASE_ACCOUNT),
    login: async () => {},
    logout: async () => {},
    openAccountSettings: async () => {},
    githubSettings: async () => ({ configured: true, manageUrl: "https://github.com/apps/deskfleet", authorized: true, login: "ada-lovelace", actAsYou: true }),
    manageGithub: async () => {},
    authorizeGithubApp: async () => {},
    setGithubActAsYou: async enabled => ({ configured: true, manageUrl: "https://github.com/apps/deskfleet", authorized: true, login: "ada-lovelace", actAsYou: enabled }),
    githubPullRequest: async () => ({
      pullRequest: {
        number: 412,
        title: "feat(desktop): add login-free Dev Showcase mode",
        url: "https://github.com/yet-another-ai/deskfleet/pull/412",
        state: "open",
      },
    }),
    billing: async () => ({
      prices: [
        { plan: "go", interval: "month", unitAmount: 2000, currency: "usd" },
        { plan: "pro", interval: "month", unitAmount: 6000, currency: "usd" },
      ],
      plan: "pro",
      limits: { maxActiveSessions: 50, maxTurnsPerSession: null, maxMembers: 25, turnBytes: 107_374_182_400 },
      usage: { activeSessionCount: 3, memberCount: 3, relayedBytes: "10485760" },
      period: { start: "2026-04-01T00:00:00.000Z", end: "2026-05-01T00:00:00.000Z" },
      nextResetAt: "2026-05-01T00:00:00.000Z",
      enterpriseOverride: false,
      subscription: { plan: "pro", status: "active", paidThrough: "2026-05-01T00:00:00.000Z", cancelAtPeriodEnd: false },
      paymentsAvailable: true,
      canManageBilling: true,
    }),
    checkout: async () => {},
    billingPortal: async () => {},
    site: async () => structuredClone(DEV_SHOWCASE_SITE),
    teams: async () => structuredClone(teams),
    createTeam: async (name: string): Promise<Team> => {
      const created: Team = { id: `team-${Date.now()}`, name, role: "owner" }
      teams.push(created)
      return structuredClone(created)
    },
    members: async () => structuredClone(DEV_SHOWCASE_MEMBERS),
    teamUsage: async () => ({ relayedBytes: "10485760", activeSessionCount: 3, memberCount: 3 }),
    teamTurnSettings: async () => ({ availability: "available", urls: [], secretConfigured: false }),
    updateTeamTurnSettings: async (_teamId, settings) => ({ availability: "available", urls: settings.urls, secretConfigured: settings.urls.length > 0 }),
    aiUsage: async (_teamId, query) => ({
      period: query.period,
      timeZone: query.timeZone,
      from: "2026-04-05T00:00:00.000Z",
      to: "2026-04-12T23:59:59.000Z",
      lastSyncedAt: "2026-04-12T10:18:00.000Z",
      totals: { totalTokens: 68_400, inputTokens: 54_200, outputTokens: 14_200, cachedReadTokens: 12_000, cachedWriteTokens: 0, thoughtTokens: 4_100, turnCount: 4, reportedTurnCount: 4 },
      buckets: [],
      heatmap: [],
      models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", totalTokens: 68_400, turnCount: 4, reportedTurnCount: 4 }],
      members: [{ id: "user-ada", name: "Ada Lovelace", totalTokens: 68_400, turnCount: 4, reportedTurnCount: 4 }],
    }),
    aiUsageSessions: async (_teamId, query) => ({ date: query.date, timeZone: query.timeZone, sessions: [], truncated: false }),
    search: async (_teamId, query) => ({
      results: query.q.trim()
        ? [{
          kind: "chat",
          machineId: DEV_SHOWCASE_LOCAL_MACHINE_ID,
          machineName: "Studio MacBook Pro",
          workspaceId: "101",
          workspaceName: "deskfleet",
          resourceId: DEV_SHOWCASE_SESSION_ID,
          title: "Implement Dev Showcase UI & session elements",
          snippet: `Matched "${query.q}" in showcase conversation transcript`,
          updatedAt: "2026-04-12T10:18:00.000Z",
        }]
        : [],
    }),
    scheduleSnapshot: async () => structuredClone(DEV_SHOWCASE_SCHEDULES),
    renameTeam: async (teamId, name) => {
      const target = teams.find(item => item.id === teamId) ?? teams[0]!
      target.name = name
      return structuredClone(target)
    },
    invite: async () => ({ token: "invite-showcase-token", expiresAt: "2026-04-19T00:00:00.000Z" }),
    acceptInvite: async () => structuredClone(teams[0]!),
    setMemberRole: async () => {},
    removeMember: async () => {},
    transferOwnership: async () => {},
    machines: async (teamId) => structuredClone(machines.filter(item => item.teamId === teamId || teamId === DEV_SHOWCASE_TEAM_ID)),
    renameMachine: async (_teamId, machineId, name): Promise<Machine> => {
      const target = machines.find(item => item.id === machineId) ?? machines[0]!
      target.name = name
      if (catalogs[machineId]) catalogs[machineId]!.machineName = name
      return structuredClone(target)
    },
    removeMachine: async () => {},
    enrollHeadless: async (_teamId, request) => ({
      machine: {
        id: `machine-${Date.now()}`,
        teamId: DEV_SHOWCASE_TEAM_ID,
        name: request.name,
        originId: request.originId,
        localMachineId: request.localMachineId,
        online: true,
        capabilities: {},
      },
      token: "showcase-enrollment-token",
    }),
    localEnrollment: async () => structuredClone(DEV_SHOWCASE_LOCAL_ENROLLMENT),
    enrollLocal: async () => structuredClone(DEV_SHOWCASE_LOCAL_ENROLLMENT.registrations[0]!),
    catalog: async (_teamId, machineId) => {
      const snapshot = catalogs[machineId] ?? catalogs[DEV_SHOWCASE_LOCAL_MACHINE_ID]!
      return {
        machineId,
        snapshot: structuredClone(snapshot),
        lastObservedAt: "2026-04-12T10:18:00.000Z",
        providers: {
          revision: providerState.revision,
          providers: providerState.providers.map(({ id, name, icon, template }) => ({ id, name, icon, template })),
        },
      }
    },
    sessions: async (_teamId, machineId, filterSessionId) => {
      return [...sessions.values()]
        .filter(item => item.machineId === machineId && (!filterSessionId || item.snapshot.session.id === filterSessionId))
        .map(({ snapshot }) => ({
          session: structuredClone(snapshot.session),
          turns: snapshot.turns.map(({ id, state, endedAt }) => ({ id, state, endedAt })),
          permissions: snapshot.permissions.map(({ id, state, createdAt }) => ({ id, state, createdAt })),
          elicitations: snapshot.elicitations.map(({ id, state, createdAt }) => ({ id, state, createdAt })),
        }))
    },
    session: async (_teamId, _machineId, sessionId) => {
      const state = sessions.get(sessionId) ?? sessions.get(DEV_SHOWCASE_SESSION_ID)!
      return {
        snapshot: structuredClone(state.snapshot),
        lastEventSeq: state.snapshot.session.lastEventSeq,
        lastObservedAt: "2026-04-12T10:18:00.000Z",
      }
    },
    events: async (_teamId, _machineId, sessionId, after, limit) => {
      const state = sessions.get(sessionId)
      if (!state) return { events: [], lastEventSeq: "0" }
      const afterSeq = BigInt(after || "0")
      const page = state.events.filter(event => BigInt(event.seq) > afterSeq).slice(0, limit)
      return {
        events: structuredClone(page),
        lastEventSeq: state.snapshot.session.lastEventSeq,
      }
    },
    rpc: <T = unknown>(_teamId: string, machineId: string, method: string, params: unknown) => handleRpc<T>(machineId, method, params),
    createPeer: async (_teamId, machineId, purpose) => ({
      peerId: `peer-${machineId}-${purpose}`,
      authorization: {
        peerId: `peer-${machineId}-${purpose}`,
        serverId: "server-showcase",
        teamId: DEV_SHOWCASE_TEAM_ID,
        actor: { kind: "user", userId: "user-ada", deviceId: "device-showcase" },
        targetMachine: { id: machineId, originId: "origin-showcase-studio", localMachineId: "1" },
        transport: "local",
        purpose,
        actions: ["*"],
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      iceServers: [],
    }),
    offerPeer: async () => ({ sdp: "" }),
    startPeer: async () => {},
    candidatePeer: async () => {},
    closePeer: async () => {},
    onEvent(listener) {
      centralListeners.add(listener)
      return () => { centralListeners.delete(listener) }
    },
  }

  return {
    platform: base?.platform ?? "darwin",
    locale: base?.locale ?? DEFAULT_LOCALE,
    central,
    localChannels: channels,
    muxChannels: channels,
    onboarding: {
      get: async () => ({ step: "complete", permissionSteps: [] }),
      permissions: async () => ({}),
      requestPermission: async () => ({}),
      openLocalNetworkSettings: async () => {},
      advancePermission: async () => ({ step: "complete", permissionSteps: [] }),
      complete: async () => ({ step: "complete", permissionSteps: [] }),
    },
    appearance: base?.appearance ?? {
      get: async () => ({ ...DEFAULT_APPEARANCE_SETTINGS, theme: "dark" }),
      set: async settings => settings,
      onChanged: () => () => {},
    },
    applications: base?.applications ?? {
      scan: async () => [
        { id: "vscode", name: "VS Code" },
        { id: "cursor", name: "Cursor" },
        { id: "zed", name: "Zed" },
        { id: "ghostty", name: "Ghostty" },
      ],
      openWorkspace: async () => {},
    },
    updates: base?.updates ?? {
      get: async () => ({ status: "idle", currentVersion: "0.13.0" }),
      check: async () => ({ status: "idle", currentVersion: "0.13.0" }),
      install: async () => {},
      onChanged: () => () => {},
    },
    settings: base?.settings ?? {
      get: async () => ({ enabled: true, status: "running" }),
      setLocalAgentEnabled: async enabled => ({ enabled, status: enabled ? "running" : "stopped" }),
      getLaunchAtStartup: async () => ({ available: true, enabled: false }),
      setLaunchAtStartup: async enabled => ({ available: true, enabled }),
      getKeepAwake: async () => ({ enabled: false }),
      setKeepAwake: async enabled => ({ enabled }),
      getAutoDownloadUpdates: async () => ({ enabled: true }),
      setAutoDownloadUpdates: async enabled => ({ enabled }),
      getWorktreeRoot: async () => ({ root: "/workspace/deskfleet/.worktrees", defaultRoot: "/workspace/deskfleet/.worktrees" }),
      setWorktreeRoot: async root => ({ root: root ?? "/workspace/deskfleet/.worktrees", defaultRoot: "/workspace/deskfleet/.worktrees" }),
      chooseWorktreeRoot: async () => "/workspace/deskfleet/.worktrees",
      getNotifications: async () => ({ enabled: true, taskCompleted: true, taskNeedsInput: true }),
      setNotifications: async settings => settings,
      getRemoteAgentSettings: async () => ({ allowRead: true, allowOperate: true, allowSessions: true }),
      setRemoteAgentSettings: async settings => settings,
      onChanged: () => () => {},
    },
    catalog: {
      list: async () => structuredClone(catalogs[DEV_SHOWCASE_LOCAL_MACHINE_ID]!),
      createWorkspace: async (name, directories) => handleRpc(DEV_SHOWCASE_LOCAL_MACHINE_ID, "workspaceCreate", { name, directories }),
      updateWorkspace: async (workspaceId, name, directories) => ({ id: workspaceId, name, worktrees: [{ id: `wt-${workspaceId}`, workspaceId, directories }] }),
      deleteWorkspace: async () => {},
      onChanged: () => () => {},
    },
    filesystem: {
      listDirectories: path => handleRpc(DEV_SHOWCASE_LOCAL_MACHINE_ID, "directoryList", { path }),
    },
    system: {
      status: () => handleRpc(DEV_SHOWCASE_LOCAL_MACHINE_ID, "systemStatus", {}),
    },
    providers: {
      display: async () => ({
        revision: providerState.revision,
        providers: providerState.providers.map(({ id, name, icon, template }) => ({ id, name, icon, template })),
      }),
      list: () => handleRpc(DEV_SHOWCASE_LOCAL_MACHINE_ID, "providerList", {}),
      create: provider => handleRpc(DEV_SHOWCASE_LOCAL_MACHINE_ID, "providerCreate", { provider }),
      update: (providerId, changes) => handleRpc(DEV_SHOWCASE_LOCAL_MACHINE_ID, "providerUpdate", { providerId, changes }),
      remove: providerId => handleRpc(DEV_SHOWCASE_LOCAL_MACHINE_ID, "providerRemove", { providerId }),
      test: provider => handleRpc(DEV_SHOWCASE_LOCAL_MACHINE_ID, "providerTest", { provider }),
      probe: provider => handleRpc(DEV_SHOWCASE_LOCAL_MACHINE_ID, "providerProbe", { provider }),
      install: async () => ({ id: "term-install", title: "Install provider", cwd: "/workspace/deskfleet", cols: 80, rows: 24, status: "running", createdAt: new Date().toISOString() }),
      login: async () => ({ id: "term-login", title: "Provider login", cwd: "/workspace/deskfleet", cols: 80, rows: 24, status: "running", createdAt: new Date().toISOString() }),
      onChanged: () => () => {},
    },
    agent: {
      offer: async () => ({ sdp: "" }),
      candidate: async () => {},
      close: async () => {},
      onEvent: () => () => {},
    },
    terminal: {
      list: async () => [],
      dial: async () => ({ id: "term-1", title: "zsh", cwd: "/workspace/deskfleet", cols: 80, rows: 24, status: "running", createdAt: new Date().toISOString() }),
      hangup: async () => {},
      onSessionEvent: () => () => {},
      offer: async () => ({ sdp: "" }),
      candidate: async () => {},
      close: async () => {},
      onEvent: () => () => {},
    },
    desktop: {
      target: async () => ({ id: DEV_SHOWCASE_LOCAL_MACHINE_ID, name: "Studio MacBook Pro", online: true, desktop: true, platform: "darwin" }),
      capabilities: () => handleRpc(DEV_SHOWCASE_LOCAL_MACHINE_ID, "capabilities", {}),
      offer: async () => ({ sdp: "" }),
      start: async () => {},
      candidate: async () => {},
      close: async () => {},
      onEvent: () => () => {},
    },
  }
}
