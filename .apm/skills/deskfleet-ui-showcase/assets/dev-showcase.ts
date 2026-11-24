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
import type { SpeechApi, SpeechEvent } from "@deskfleet-repo/packages/client/src/speech.ts"
import {
  createDevShowcaseArchivedSnapshot,
  createDevShowcaseConfiguration,
  createDevShowcaseErrorEvents,
  createDevShowcaseErrorSnapshot,
  createDevShowcaseEvents,
  createDevShowcaseGitDiff,
  createDevShowcaseMachineSnapshot,
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
  DEV_SHOWCASE_MACHINE_SESSION_ID,
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
  DEV_SHOWCASE_TERMINAL_OUTPUT,
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
  const machineSnapshot = createDevShowcaseMachineSnapshot()
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
    [DEV_SHOWCASE_MACHINE_SESSION_ID, {
      machineId: DEV_SHOWCASE_LOCAL_MACHINE_ID,
      snapshot: machineSnapshot,
      events: [],
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
  if (typeof window !== "undefined") {
    const search = new URLSearchParams(window.location.search)
    if (search.get("route") !== "new" && (!window.location.hash || window.location.hash === "#" || window.location.hash === "#/")) {
      window.location.hash = `#/sessions/${DEV_SHOWCASE_SESSION_ID}`
    }
  }

  const centralListeners = new Set<(event: CentralEvent) => void>()
  const channelListeners = new Set<(event: LocalChannelEvent) => void>()
  const speechListeners = new Set<(event: SpeechEvent) => void>()
  const activeSpeech = new Map<string, ReturnType<typeof setInterval>>()
  const emitSpeech = (event: SpeechEvent) => {
    for (const listener of speechListeners) listener(event)
  }
  const speech: SpeechApi = {
    async status() {
      return { supported: true }
    },
    async start(request) {
      const existing = activeSpeech.get(request.sessionId)
      if (existing) clearInterval(existing)
      emitSpeech({ sessionId: request.sessionId, type: "started" })
      let step = 0
      const timer = setInterval(() => {
        step += 1
        const level = 0.2 + 0.65 * Math.abs(Math.sin(step * 0.7))
        emitSpeech({ sessionId: request.sessionId, type: "level", level })
        if (step === 6) {
          emitSpeech({
            sessionId: request.sessionId,
            type: "result",
            text: "Check the composer icon alignment in dark and light themes.",
            final: false,
          })
        }
      }, 120)
      activeSpeech.set(request.sessionId, timer)
    },
    async stop(sessionId) {
      const timer = activeSpeech.get(sessionId)
      if (timer) {
        clearInterval(timer)
        activeSpeech.delete(sessionId)
      }
      emitSpeech({
        sessionId,
        type: "result",
        text: "Check the composer icon alignment in dark and light themes.",
        final: true,
      })
      emitSpeech({ sessionId, type: "ended" })
    },
    async cancel(sessionId) {
      const timer = activeSpeech.get(sessionId)
      if (timer) {
        clearInterval(timer)
        activeSpeech.delete(sessionId)
      }
      emitSpeech({ sessionId, type: "ended" })
    },
    onEvent(listener) {
      speechListeners.add(listener)
      return () => { speechListeners.delete(listener) }
    },
  }
  const openChannels = new Map<string, LocalChannelOpen & { buffer: string }>()
  const teams = structuredClone(DEV_SHOWCASE_TEAMS)
  const machines = structuredClone(DEV_SHOWCASE_MACHINES)
  const catalogs: Record<string, CatalogSnapshot> = structuredClone(DEV_SHOWCASE_CATALOGS)
  const providerState: ProviderSnapshot = structuredClone(DEV_SHOWCASE_PROVIDER_SNAPSHOT)
  const sessions = createInitialSessions()
  const stoppedSessions = new Set<string>()
  const showcaseTerminals = [
    { id: "term-1", title: "zsh", cwd: "/workspace/deskfleet", cols: 80, rows: 24, status: "running" as const },
    { id: "term-2", title: "cargo watch", cwd: "/workspace/deskfleet", cols: 80, rows: 24, status: "running" as const },
  ]
  let createdSessionSeq = 0

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
      case "_deskfleet/session/create": {
        const now = new Date().toISOString()
        const newId = `90${++createdSessionSeq}`
        const workspaceId = typeof params.workspaceId === "string" && params.workspaceId ? params.workspaceId : undefined
        const providerId = typeof params.provider === "string" ? params.provider : "claude-code"
        const context = params.context === "worktree" ? "worktree" : "directory"
        const title = typeof params.title === "string" && params.title.trim() ? params.title.trim() : "New session"
        const deferStartup = params.deferStartup === true
        const catalog = catalogs[machineId] ?? catalogs[DEV_SHOWCASE_LOCAL_MACHINE_ID]!
        catalog.sessionIds.unshift(newId)
        const workspace = workspaceId ? catalog.workspaces.find(item => item.id === workspaceId) : undefined
        if (workspace) {
          workspace.worktrees.push({
            id: `wt-${newId}`,
            sessionId: newId,
            workspaceId: workspace.id,
            directories: [{ path: "/workspace/deskfleet" }],
          })
        }
        const initialSnapshot: AgentSnapshot = {
          session: {
            id: newId,
            ...(workspaceId ? { workspaceId } : {}),
            title,
            provider: providerId,
            context,
            lifecycle: deferStartup ? "provisioning" : "ready",
            archiveState: "active",
            capabilities: { steering: true, resume: true, fork: true, additionalDirectories: true },
            lastEventSeq: "0",
            createdAt: now,
            updatedAt: now,
          },
          runs: deferStartup
            ? []
            : [{ generation: 1, sessionId: newId, state: "starting", startedAt: now }],
          turns: [],
          inputs: [],
          permissions: [],
          elicitations: [],
        }
        const record: SessionRecordState = {
          machineId,
          snapshot: initialSnapshot,
          events: [],
          configuration: createDevShowcaseConfiguration(providerId),
          configOptions: structuredClone(DEV_SHOWCASE_CONFIG_OPTIONS),
        }
        applyConfigSelection(record, params)
        sessions.set(newId, record)
        emitCentral({ type: "catalogChanged", teamId: DEV_SHOWCASE_TEAM_ID, machineId, sessionId: newId })
        if (!deferStartup) {
          await new Promise(resolve => setTimeout(resolve, 1600))
          return structuredClone(record.snapshot)
        }
        setTimeout(() => {
          if (stoppedSessions.has(newId)) return
          const createdAt = new Date().toISOString()
          record.snapshot.session.lifecycle = "ready"
          appendSessionEvent(record, {
            sessionId: newId,
            kind: "session",
            createdAt,
            payload: structuredClone(record.snapshot.session),
          })
          const startingRun = {
            generation: 1,
            sessionId: newId,
            state: "starting" as const,
            startedAt: createdAt,
          }
          record.snapshot.runs = [startingRun]
          appendSessionEvent(record, {
            sessionId: newId,
            kind: "run",
            runGeneration: 1,
            createdAt,
            payload: structuredClone(startingRun),
          })
        }, 1400)
        return structuredClone(record.snapshot)
      }
      case "_deskfleet/session/stop": {
        if (!state) throw new Error(`Unknown showcase session: ${sessionId}`)
        stoppedSessions.add(sessionId)
        const now = new Date().toISOString()
        if (state.snapshot.session.lifecycle === "provisioning") {
          state.snapshot.session.lifecycle = "ready"
          appendSessionEvent(state, {
            sessionId,
            kind: "session",
            createdAt: now,
            payload: structuredClone(state.snapshot.session),
          })
        }
        const existingRun = state.snapshot.runs.at(-1)
        const stoppedRun = {
          generation: existingRun?.generation ?? 1,
          sessionId,
          state: "stopped" as const,
          startedAt: existingRun?.startedAt ?? now,
          endedAt: now,
        }
        if (existingRun) {
          state.snapshot.runs[state.snapshot.runs.length - 1] = stoppedRun
        } else {
          state.snapshot.runs.push(stoppedRun)
        }
        appendSessionEvent(state, {
          sessionId,
          kind: "run",
          runGeneration: stoppedRun.generation,
          createdAt: now,
          payload: structuredClone(stoppedRun),
        })
        return structuredClone(state.snapshot)
      }
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
      case "_deskfleet/session/yolo": {
        if (!state) throw new Error(`Unknown showcase session: ${sessionId}`)
        if (typeof params.enabled !== "boolean") throw new Error("Invalid YOLO flag")
        const now = new Date().toISOString()
        const actor = { kind: "user" as const, userId: "user-ada" }
        state.snapshot.session.yolo = params.enabled
        state.snapshot.session.yoloActor = params.enabled ? actor : undefined
        state.snapshot.session.updatedAt = now
        appendSessionEvent(state, {
          sessionId,
          kind: "session",
          createdAt: now,
          payload: structuredClone(state.snapshot.session),
        })
        if (params.enabled) {
          for (const permission of state.snapshot.permissions) {
            if (permission.state !== "pending") continue
            const option = permission.request.options.find(item => item.kind === "allow_always")
              ?? permission.request.options.find(item => item.kind === "allow_once")
              ?? permission.request.options[0]
            if (!option) continue
            permission.state = "resolved"
            permission.optionId = option.optionId
            permission.resolvedAt = now
            appendSessionEvent(state, {
              sessionId,
              kind: "permission",
              turnId: permission.turnId,
              runGeneration: permission.runGeneration,
              createdAt: now,
              payload: structuredClone(permission),
            })
          }
        }
        emitCentral({ type: "catalogChanged", teamId: DEV_SHOWCASE_TEAM_ID, machineId, sessionId })
        return structuredClone(state.snapshot)
      }
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
          const latestRun = state.snapshot.runs.at(-1)
          const delivery = params.delivery === "steer" ? "steer" : "backlog"
          const created: AgentInput = {
            id: inputId,
            sessionId,
            submissionCommandId: commandId,
            author: { kind: "user", userId: "user-ada" },
            content: params.content as AgentInput["content"],
            acceptedSeq: (BigInt(state.snapshot.session.lastEventSeq || "0") + 1n).toString(),
            state: "pending",
            requestedDelivery: delivery,
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
          if (state.snapshot.session.lifecycle === "ready" && (!latestRun || !["starting", "running"].includes(latestRun.state))) {
            stoppedSessions.delete(sessionId)
            const nextRun = {
              generation: (latestRun?.generation ?? 0) + 1,
              sessionId,
              state: "starting" as const,
              startedAt: created.createdAt,
            }
            state.snapshot.runs.push(nextRun)
            appendSessionEvent(state, {
              sessionId,
              kind: "run",
              runGeneration: nextRun.generation,
              createdAt: created.createdAt,
              payload: structuredClone(nextRun),
            })
          }
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

  const nowMs = Date.now()
  const isoOffset = (hours: number) => new Date(nowMs + hours * 3_600_000).toISOString()
  const showcaseSchedules: Record<string, Array<Record<string, unknown>>> = {
    [DEV_SHOWCASE_LOCAL_MACHINE_ID]: [
      {
        id: "sched-nightly-triage",
        title: "Nightly CI & PR triage",
        prompt: "Review failed CI checks across open pull requests and post a summary.",
        workspaceId: "101",
        enabled: true,
        target: { kind: "new", provider: "claude-code", context: "worktree" },
        trigger: { kind: "daily", time: "09:00", timeZone: "Asia/Shanghai" },
        createdAt: isoOffset(-240),
        updatedAt: isoOffset(-2),
        nextRunAt: isoOffset(14),
        lastRun: {
          id: "run-101",
          state: "completed",
          scheduledFor: isoOffset(-2),
          startedAt: isoOffset(-2),
          endedAt: isoOffset(-1.9),
          sessionId: DEV_SHOWCASE_SESSION_ID,
        },
        runs: [
          {
            id: "run-101",
            state: "completed",
            scheduledFor: isoOffset(-2),
            startedAt: isoOffset(-2),
            endedAt: isoOffset(-1.9),
            sessionId: DEV_SHOWCASE_SESSION_ID,
          },
        ],
      },
      {
        id: "sched-weekly-deps",
        title: "Weekly dependency audit",
        prompt: "Check outdated Rust and pnpm packages and prepare a summary.",
        workspaceId: "101",
        enabled: false,
        target: { kind: "new", provider: "codex", context: "directory" },
        trigger: { kind: "weekly", time: "10:30", timeZone: "Asia/Shanghai", weekdays: [1, 4] },
        createdAt: isoOffset(-360),
        updatedAt: isoOffset(-48),
        runs: [],
      },
      {
        id: "sched-release-notes",
        title: "Draft release changelog",
        prompt: "Summarize merged PRs since the latest git tag into release notes.",
        workspaceId: "102",
        enabled: true,
        target: { kind: "new", provider: "claude-code", context: "directory" },
        trigger: { kind: "manual" },
        createdAt: isoOffset(-120),
        updatedAt: isoOffset(-12),
        runs: [],
      },
    ],
    [DEV_SHOWCASE_REMOTE_MACHINE_ID]: [
      {
        id: "sched-runner-smoke",
        title: "Staging smoke verification",
        prompt: "Run smoke checks on staging and report any latency regressions.",
        workspaceId: "201",
        enabled: true,
        target: { kind: "new", provider: "codex", context: "worktree" },
        trigger: { kind: "interval", minutes: 360 },
        createdAt: isoOffset(-180),
        updatedAt: isoOffset(-4),
        nextRunAt: isoOffset(2),
        runs: [],
      },
    ],
  }

  async function handleRpc<T>(machineId: string, method: string, params: unknown): Promise<T> {
    if (method.startsWith("_deskfleet/")) {
      return await handleAgentMethod(machineId, method, params) as T
    }
    const record = (params && typeof params === "object" ? params : {}) as Record<string, unknown>
    switch (method) {
      case "terminalList":
        return structuredClone(showcaseTerminals) as unknown as T
      case "terminalDial": {
        const terminalId = typeof record.terminalId === "string" ? record.terminalId : `term-${Date.now()}`
        let found = showcaseTerminals.find(item => item.id === terminalId)
        if (!found) {
          found = {
            id: terminalId,
            title: "zsh",
            cwd: typeof record.cwd === "string" ? record.cwd : "/workspace/deskfleet",
            cols: typeof record.cols === "number" ? record.cols : 80,
            rows: typeof record.rows === "number" ? record.rows : 24,
            status: "running" as const,
          }
          showcaseTerminals.push(found)
        }
        return structuredClone(found) as unknown as T
      }
      case "terminalHangup": {
        const idx = showcaseTerminals.findIndex(item => item.id === record.terminalId)
        if (idx >= 0) showcaseTerminals.splice(idx, 1)
        return null as unknown as T
      }
      case "scheduleList":
        return structuredClone(showcaseSchedules[machineId] ?? []) as unknown as T
      case "scheduleCreate": {
        const schedule = (record.schedule ?? {}) as Record<string, unknown>
        const created = {
          ...schedule,
          id: `sched-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          runs: [],
        }
        showcaseSchedules[machineId] ??= []
        showcaseSchedules[machineId]!.unshift(created)
        emitCentral({ type: "catalogChanged", teamId: DEV_SHOWCASE_TEAM_ID, machineId })
        return structuredClone(created) as unknown as T
      }
      case "scheduleUpdate": {
        const list = showcaseSchedules[machineId] ?? []
        const target = list.find(item => item.id === record.scheduleId)
        if (target && record.changes && typeof record.changes === "object") {
          Object.assign(target, record.changes, { updatedAt: new Date().toISOString() })
        }
        emitCentral({ type: "catalogChanged", teamId: DEV_SHOWCASE_TEAM_ID, machineId })
        return structuredClone(target ?? list[0]) as unknown as T
      }
      case "scheduleDelete": {
        showcaseSchedules[machineId] = (showcaseSchedules[machineId] ?? []).filter(item => item.id !== record.scheduleId)
        emitCentral({ type: "catalogChanged", teamId: DEV_SHOWCASE_TEAM_ID, machineId })
        return null as unknown as T
      }
      case "scheduleRun": {
        const run = {
          id: `run-${Date.now()}`,
          state: "running",
          scheduledFor: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          sessionId: DEV_SHOWCASE_SESSION_ID,
        }
        return run as unknown as T
      }
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
        return {
          hostname: machineId === DEV_SHOWCASE_LOCAL_MACHINE_ID ? "studio-mbp.local" : "runner-us-east",
          platform: machineId === DEV_SHOWCASE_LOCAL_MACHINE_ID ? "darwin" : "linux",
          arch: machineId === DEV_SHOWCASE_LOCAL_MACHINE_ID ? "arm64" : "x64",
          uptimeSeconds: 86_400,
          ...(machineId === DEV_SHOWCASE_LOCAL_MACHINE_ID ? { battery: { percent: 78, state: "charging" } } : {}),
        } as unknown as T
      case "capabilities":
        return {
          audio: false,
          displays: [
            { id: 1, width: 1920, height: 1080, refreshRateHz: 60, codecs: ["av1", "h265", "h264"] },
            { id: 2, width: 2560, height: 1440, refreshRateHz: 120, codecs: ["av1", "h265", "h264"] },
          ],
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
      if (channel.purpose === "terminal") {
        const message = JSON.parse(chunk) as { id?: number | string; method?: string; params?: Record<string, unknown> }
        const emitTerminal = (payload: unknown) => {
          const text = JSON.stringify(payload)
          for (const listener of channelListeners) listener({ connectionId, kind: "message", data: text })
        }
        if (message.method && message.id !== undefined) {
          const termId = typeof message.params?.sessionId === "string" ? message.params.sessionId : "term-1"
          const term = showcaseTerminals.find(item => item.id === termId) ?? showcaseTerminals[0]!
          if (message.method === "attach") {
            emitTerminal({ id: message.id, result: structuredClone(term) })
            const output = btoa(String.fromCharCode(...new TextEncoder().encode(DEV_SHOWCASE_TERMINAL_OUTPUT)))
            queueMicrotask(() => {
              emitTerminal({ event: { kind: "output", sessionId: term.id, data: output, offset: DEV_SHOWCASE_TERMINAL_OUTPUT.length } })
              emitTerminal({ event: { kind: "ready", sessionId: term.id } })
            })
          } else {
            emitTerminal({ id: message.id, result: null })
          }
        }
        return
      }
      channel.buffer += chunk
      const lines = channel.buffer.split("\n")
      channel.buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        const message = JSON.parse(line) as { id?: number | string; method?: string; params?: Record<string, unknown> }
        if (message.method && message.id !== undefined) {
          if (channel.purpose === "terminal") {
            const termId = typeof message.params?.sessionId === "string" ? message.params.sessionId : "term-1"
            const term = showcaseTerminals.find(item => item.id === termId) ?? showcaseTerminals[0]!
            if (message.method === "attach") {
              emitChannelMessage(connectionId, { id: message.id, result: structuredClone(term) })
              const output = btoa(String.fromCharCode(...new TextEncoder().encode(DEV_SHOWCASE_TERMINAL_OUTPUT)))
              queueMicrotask(() => {
                emitChannelMessage(connectionId, { event: { kind: "output", sessionId: term.id, data: output, offset: DEV_SHOWCASE_TERMINAL_OUTPUT.length } })
                emitChannelMessage(connectionId, { event: { kind: "ready", sessionId: term.id } })
              })
            } else {
              emitChannelMessage(connectionId, { id: message.id, result: null })
            }
            continue
          }
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
    superAgentAvailability: async () => ({ enabled: true }),
    superAgentConfig: async () => ({ mode: "hosted", hostedConfigured: true, canConfigure: true, byoa: null }) as never,
    updateSuperAgentConfig: async () => ({ mode: "hosted", hostedConfigured: true, canConfigure: true, byoa: null }) as never,
    superAgentSessions: async () => ([
      { sessionId: "sa-release-plan", title: "Plan v0.24 sidebar redesign rollout", lastActiveAt: Date.now() - 120_000, engine: "hosted" },
      { sessionId: "sa-triage", title: "Cross-machine build runner triage", lastActiveAt: Date.now() - 3_600_000, engine: "hosted" },
    ]) as never,
    registerSuperAgentMachineSession: async (_teamId, input) => ({
      sessionId: `sa-${Date.now()}`,
      title: input.title ?? "Super Agent",
      lastActiveAt: Date.now(),
      engine: "byoa",
    }) as never,
    superAgentUsage: async () => ({ admitted: true, runtimeConfigured: true, includedCredits: 1000, usedCredits: 120 }) as never,
    createSuperAgentSession: async () => ({ sessionId: `sa-${Date.now()}` }),
    sendSuperAgentMessage: async (_teamId, sessionId) => ({ sessionId, deliveryId: `del-${Date.now()}` }),
    cancelSuperAgentTurn: async () => {},
    superAgentHistory: async () => ({ items: [], nextIndex: 0, hasMore: false }) as never,
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
    githubRepositoryItems: async () => ({ items: [], hasMore: false }) as never,
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
    updateTelemetryConsent: async () => {},
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
      from: "2026-04-01",
      to: "2026-04-14",
      lastSyncedAt: "2026-04-12T10:18:00.000Z",
      totals: { totalTokens: 68_400, inputTokens: 54_200, outputTokens: 14_200, cachedReadTokens: 12_000, cachedWriteTokens: 0, thoughtTokens: 4_100, turnCount: 18, reportedTurnCount: 18 },
      buckets: [
        { start: "2026-04-08T00:00:00.000Z", totalTokens: 14_200, turnCount: 4, reportedTurnCount: 4, models: { "claude-sonnet-4-5": 14_200 }, members: { "user-ada": 14_200 } },
        { start: "2026-04-10T00:00:00.000Z", totalTokens: 26_400, turnCount: 7, reportedTurnCount: 7, models: { "claude-sonnet-4-5": 26_400 }, members: { "user-ada": 26_400 } },
        { start: "2026-04-12T00:00:00.000Z", totalTokens: 27_800, turnCount: 7, reportedTurnCount: 7, models: { "claude-sonnet-4-5": 27_800 }, members: { "user-ada": 27_800 } },
      ],
      heatmap: Array.from({ length: 371 }, (_, idx) => {
        const d = new Date(Date.parse("2026-04-14T00:00:00.000Z") - (370 - idx) * 86_400_000)
        const date = d.toISOString().slice(0, 10)
        if (date === "2026-04-05") return { date, totalTokens: 29_100, turnCount: 6, reportedTurnCount: 6 }
        if (date === "2026-04-08") return { date, totalTokens: 14_200, turnCount: 4, reportedTurnCount: 4 }
        if (date === "2026-04-10") return { date, totalTokens: 26_400, turnCount: 7, reportedTurnCount: 7 }
        if (date === "2026-04-12") return { date, totalTokens: 27_800, turnCount: 7, reportedTurnCount: 7 }
        if ((idx * 13 + 5) % 9 === 0) return { date, totalTokens: 0, turnCount: 0, reportedTurnCount: 0 }
        const levelTokens = ((idx * 7 + 3) % 4 + 1) * 6_500
        return { date, totalTokens: levelTokens, turnCount: 2, reportedTurnCount: 2 }
      }),
      models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", totalTokens: 68_400, turnCount: 18, reportedTurnCount: 18 }],
      members: [{ id: "user-ada", name: "Ada Lovelace", totalTokens: 68_400, turnCount: 18, reportedTurnCount: 18 }],
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
    scheduleSnapshot: async (_teamId, machineId) => ({
      tasks: structuredClone(showcaseSchedules[machineId] ?? []),
      lastObservedAt: "2026-04-12T10:18:00.000Z",
    }) as never,
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
    offerPeer: async (peerId, sdp) => {
      const peer = new RTCPeerConnection()
      const canvas = document.createElement("canvas")
      canvas.width = 1280
      canvas.height = 720
      const ctx = canvas.getContext("2d")!
      const state = {
        scrollY: 160,
        lastDeltaX: 0,
        lastDeltaY: 0,
        wheelEvents: 0,
      };
      (window as unknown as Record<string, unknown>).__deskfleetShowcaseDesktop = state

      const draw = () => {
        ctx.fillStyle = "#0f172a"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        // Top bar of simulated remote desktop
        ctx.fillStyle = "#1e293b"
        ctx.fillRect(0, 0, canvas.width, 36)
        ctx.fillStyle = "#94a3b8"
        ctx.font = "600 14px -apple-system, BlinkMacSystemFont, sans-serif"
        ctx.fillText("Build Runner us-east · Remote Desktop (1920 × 1080)", 18, 23)

        // Simulated scrollable log/editor window on remote desktop
        const winX = 96
        const winY = 68
        const winW = 1088
        const winH = 592
        ctx.fillStyle = "#111827"
        ctx.fillRect(winX, winY, winW, winH)
        ctx.strokeStyle = "#334155"
        ctx.lineWidth = 2
        ctx.strokeRect(winX, winY, winW, winH)

        // Window header
        ctx.fillStyle = "#1f2937"
        ctx.fillRect(winX, winY, winW, 44)
        ctx.fillStyle = "#e2e8f0"
        ctx.font = "600 15px -apple-system, BlinkMacSystemFont, sans-serif"
        ctx.fillText("release-notes.md", winX + 20, winY + 28)

        // Status pill on the left side of the window header so Stream settings never covers it
        const badgeText = state.wheelEvents === 0
          ? `Scroll offset: ${Math.round(state.scrollY)} px · Ready`
          : state.lastDeltaY < 0
            ? `Scroll offset: ${Math.round(state.scrollY)} px · Wheel deltaY < 0 (Reversed ↑)`
            : `Scroll offset: ${Math.round(state.scrollY)} px · Wheel deltaY > 0 (Normal ↓)`
        ctx.fillStyle = state.lastDeltaY < 0 ? "#065f46" : state.lastDeltaY > 0 ? "#1e3a8a" : "#334155"
        ctx.fillRect(winX + 180, winY + 8, 460, 28)
        ctx.fillStyle = "#f8fafc"
        ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace"
        ctx.fillText(badgeText, winX + 194, winY + 27)

        // Clip scrollable body
        ctx.save()
        ctx.beginPath()
        ctx.rect(winX + 2, winY + 45, winW - 20, winH - 47)
        ctx.clip()

        const rowHeight = 46
        for (let i = 1; i <= 40; i += 1) {
          const y = winY + 60 + (i - 1) * rowHeight - state.scrollY
          if (y + rowHeight < winY + 44 || y > winY + winH) continue
          ctx.fillStyle = i % 2 === 0 ? "#1e293b" : "#172033"
          ctx.fillRect(winX + 18, y, winW - 52, rowHeight - 8)
          ctx.fillStyle = "#38bdf8"
          ctx.font = "600 14px ui-monospace, SFMono-Regular, Menlo, monospace"
          ctx.fillText(`#${String(i).padStart(2, "0")}`, winX + 34, y + 24)
          ctx.fillStyle = "#e2e8f0"
          ctx.font = "500 14px -apple-system, BlinkMacSystemFont, sans-serif"
          ctx.fillText(`Remote workspace item ${i} — scroll wheel over stream to move viewport`, winX + 86, y + 24)
        }
        ctx.restore()

        // Scrollbar track & thumb
        const trackX = winX + winW - 14
        const trackY = winY + 48
        const trackH = winH - 52
        ctx.fillStyle = "#0f172a"
        ctx.fillRect(trackX, trackY, 8, trackH)
        const maxScroll = 800
        const thumbH = 96
        const thumbY = trackY + Math.max(0, Math.min(1, state.scrollY / maxScroll)) * (trackH - thumbH)
        ctx.fillStyle = "#60a5fa"
        ctx.fillRect(trackX, thumbY, 8, thumbH)
      }

      draw()
      const timer = setInterval(draw, 16)
      const stream = canvas.captureStream(60)
      for (const track of stream.getTracks()) {
        peer.addTrack(track, stream)
      }

      peer.ondatachannel = ({ channel }) => {
        channel.onopen = () => {
          channel.send(JSON.stringify({ type: "ready" }))
        }
        channel.onmessage = (event) => {
          try {
            const msg = JSON.parse(String(event.data)) as { type?: string; requestId?: number; control?: boolean; deltaX?: number; deltaY?: number }
            if (msg.type === "configure") {
              channel.send(JSON.stringify({ type: "configured", requestId: msg.requestId, control: Boolean(msg.control) }))
            } else if (msg.type === "wheel") {
              const dx = Number(msg.deltaX ?? 0)
              const dy = Number(msg.deltaY ?? 0)
              state.lastDeltaX = dx
              state.lastDeltaY = dy
              state.wheelEvents += 1
              state.scrollY = Math.max(0, Math.min(800, state.scrollY + dy))
              draw()
            }
          } catch {
            // ignore
          }
        }
      }

      peer.onicecandidate = ({ candidate }) => {
        if (!candidate) return
        const json = candidate.toJSON()
        emitCentral({
          type: "peerEvent",
          peerId,
          event: {
            kind: "iceCandidate",
            candidate: {
              candidate: json.candidate ?? "",
              ...(json.sdpMid != null ? { sdpMid: json.sdpMid } : {}),
              ...(json.sdpMLineIndex != null ? { sdpMlineIndex: json.sdpMLineIndex } : {}),
              ...(json.usernameFragment != null ? { usernameFragment: json.usernameFragment } : {}),
            },
          },
        })
      }

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "closed" || peer.connectionState === "failed") {
          clearInterval(timer)
        }
      }

      ;(central as unknown as { __peers?: Map<string, { peer: RTCPeerConnection; timer: ReturnType<typeof setInterval> }> }).__peers ??= new Map()
      ;(central as unknown as { __peers: Map<string, { peer: RTCPeerConnection; timer: ReturnType<typeof setInterval> }> }).__peers.set(peerId, { peer, timer })

      await peer.setRemoteDescription({ type: "offer", sdp })
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      return { sdp: answer.sdp ?? "" }
    },
    startPeer: async () => {},
    candidatePeer: async (peerId, candidate) => {
      const entry = (central as unknown as { __peers?: Map<string, { peer: RTCPeerConnection }> }).__peers?.get(peerId)
      if (!entry) return
      await entry.peer.addIceCandidate({
        candidate: candidate.candidate,
        ...(candidate.sdpMid != null ? { sdpMid: candidate.sdpMid } : {}),
        ...(candidate.sdpMlineIndex != null ? { sdpMLineIndex: candidate.sdpMlineIndex } : {}),
        ...(candidate.usernameFragment != null ? { usernameFragment: candidate.usernameFragment } : {}),
      })
    },
    closePeer: async (peerId) => {
      const peers = (central as unknown as { __peers?: Map<string, { peer: RTCPeerConnection; timer: ReturnType<typeof setInterval> }> }).__peers
      const entry = peers?.get(peerId)
      if (entry) {
        clearInterval(entry.timer)
        entry.peer.close()
        peers?.delete(peerId)
      }
    },
    onEvent(listener) {
      centralListeners.add(listener)
      return () => { centralListeners.delete(listener) }
    },
  }

  return {
    platform: base?.platform ?? "darwin",
    locale: base?.locale ?? DEFAULT_LOCALE,
    googleTag: { send: async () => {} },
    central,
    localChannels: channels,
    muxChannels: channels,
    ...((base?.platform ?? "darwin") === "darwin" || base?.platform === "win32" ? { speech: base?.speech ?? speech } : {}),
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
    files: base?.files ?? {
      list: async () => ({
        path: "/workspace/deskfleet",
        parentPath: "/workspace",
        homePath: "/Users/ada",
        roots: [{ name: "/", path: "/" }],
        entries: [
          { name: "README.md", path: "/workspace/deskfleet/README.md", kind: "file" as const, size: 4096, modifiedAt: Date.now() },
          { name: "ScreenRecording_11-11.mp4", path: "/workspace/deskfleet/ScreenRecording_11-11.mp4", kind: "file" as const, size: 69_206_016, modifiedAt: Date.now() },
        ],
      }),
      chooseLocalDirectory: async () => null,
      enqueue: async () => "transfer-showcase",
      transfers: async () => [],
      cancel: async () => {},
      retry: async () => {},
      onChanged: () => () => {},
      resolveResource: async () => ({
        path: "/workspace/deskfleet/ScreenRecording_11-11.mp4",
        name: "ScreenRecording_11-11.mp4",
        kind: "file" as const,
        size: 69_206_016,
        modifiedAt: Date.now(),
      }),
      readResource: async request => ({
        name: request.uri.split("/").pop() || "resource",
        mimeType: "text/plain",
        data: new Uint8Array(),
      }),
      saveResource: async () => null,
      uploadAttachment: async (
        request: { sessionId?: string; draftId?: string; name: string; data: Uint8Array },
        options?: { onProgress?: (progress: { transferredBytes: number; totalBytes: number }) => void; signal?: AbortSignal },
      ) => {
        const totalBytes = request.data.byteLength || 69_206_016
        const steps = [0, 0.18, 0.42, 0.68, 0.88, 1]
        for (const ratio of steps) {
          if (options?.signal?.aborted) {
            throw new DOMException("Attachment upload cancelled", "AbortError")
          }
          options?.onProgress?.({
            transferredBytes: Math.round(totalBytes * ratio),
            totalBytes,
          })
          if (ratio < 1) {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, 380)
              options?.signal?.addEventListener("abort", () => {
                clearTimeout(timer)
                reject(new DOMException("Attachment upload cancelled", "AbortError"))
              }, { once: true })
            })
          }
        }
        const scope = request.sessionId ?? `.drafts/${request.draftId ?? "draft"}`
        const path = `/workspace/deskfleet/session-attachments/${scope}/${request.name}`
        return {
          path,
          uri: `file://${path}`,
          name: request.name,
          size: request.data.byteLength,
        }
      },
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
