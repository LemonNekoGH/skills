#!/usr/bin/env node
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const skillDir = resolve(scriptDir, "..")
const bootstrapPath = resolve(skillDir, "assets/bootstrap.ts").replaceAll("\\", "/")

function parseArgs(argv) {
  const options = {
    repo: process.cwd(),
    host: "127.0.0.1",
    port: Number(process.env.DESKFLEET_SHOWCASE_PORT || 5179),
    strictPort: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--repo" && argv[index + 1]) {
      options.repo = argv[++index]
    } else if (arg === "--port" && argv[index + 1]) {
      options.port = Number(argv[++index])
      options.strictPort = true
    } else if (arg === "--host" && argv[index + 1]) {
      options.host = argv[++index]
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: node serve-showcase.mjs [--repo <deskfleet-root>] [--port <port>] [--host <host>]",
          "",
          "Starts a non-invasive Vite dev server for DeskFleet UI Showcase with preloaded",
          "login-free fixtures (#/sessions/sess-showcase, #/sessions/sess-error, etc.).",
        ].join("\n"),
      )
      process.exit(0)
    }
  }
  return options
}

function findDeskfleetRepoRoot(startDir) {
  let current = resolve(startDir)
  while (true) {
    if (
      existsSync(resolve(current, "apps/desktop/vite.renderer.config.ts"))
      && existsSync(resolve(current, "packages/components/package.json"))
    ) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) {
      throw new Error(
        `Could not locate DeskFleet repository root from "${startDir}". Pass --repo /path/to/deskfleet.`,
      )
    }
    current = parent
  }
}

const DEFAULT_DISCLOSURES_LITERAL = JSON.stringify({
  "thought:message-6": true,
  [`activity:tool-${JSON.stringify([1, "prov-sess-showcase", "tool-search-1"])}`]: true,
  [`tool:tool-${JSON.stringify([1, "prov-sess-showcase", "tool-cmd-check"])}`]: true,
  [`tool:tool-${JSON.stringify([1, "prov-sess-showcase", "tool-edit-session-view"])}`]: true,
})

function createShowcaseVitePlugin() {
  return {
    name: "deskfleet-ui-showcase",
    enforce: "pre",
    transform(code, id) {
      const cleanId = id.split("?")[0]?.replaceAll("\\", "/") ?? ""

      if (cleanId.endsWith("/apps/desktop/src/renderer/src/main.ts")) {
        return {
          code: `import ${JSON.stringify(bootstrapPath)};\n${code}`,
          map: null,
        }
      }

      if (cleanId.endsWith("/packages/components/src/composables/useAccountSession.ts")) {
        const target = "let machineDestination: { teamId: string; machineId: string; route: RouteLocationRaw } | undefined"
        if (code.includes(target) && !code.includes(`${target} =`)) {
          const replacement = `${target} = (() => { const route = (typeof window !== "undefined" && window.location.hash.replace(/^#/, "")) || "/sessions/sess-showcase"; const match = /^\\/machines\\/([^/?]+)/.exec(route); return { teamId: "team-core", machineId: match?.[1] ?? "machine-studio", route } })()`
          return {
            code: code
              .replace(target, replacement)
              .replace(
                /      members\.value = \[\]\r?\n      machineDestination = undefined/,
                "      members.value = []\n      if (machineDestination?.teamId !== teamId.value) machineDestination = undefined",
              ),
            map: null,
          }
        }
      }

      if (cleanId.endsWith("/packages/components/src/stores/conversation-reading.ts")) {
        const target = "sessions.set(id, { disclosures: {} })"
        if (code.includes(target)) {
          const replacement = `sessions.set(id, { disclosures: id === "sess-showcase" ? ${DEFAULT_DISCLOSURES_LITERAL} : {} })`
          return {
            code: code.replace(target, replacement),
            map: null,
          }
        }
      }

      return null
    },
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const repoRoot = findDeskfleetRepoRoot(options.repo)
  const desktopPkgPath = resolve(repoRoot, "apps/desktop/package.json")
  const desktopRequire = createRequire(desktopPkgPath)

  const viteEntryPath = desktopRequire.resolve("vite")
  const { createServer } = await import(pathToFileURL(viteEntryPath).href)

  const server = await createServer({
    configFile: resolve(repoRoot, "apps/desktop/vite.renderer.config.ts"),
    plugins: [createShowcaseVitePlugin()],
    resolve: {
      alias: [
        { find: "@deskfleet-repo", replacement: repoRoot },
      ],
    },
    server: {
      host: options.host,
      port: options.port,
      strictPort: options.strictPort,
      fs: {
        allow: [repoRoot, skillDir],
      },
    },
  })

  await server.listen()
  const address = server.httpServer?.address()
  const actualPort = typeof address === "object" && address ? address.port : options.port
  const baseUrl = `http://${options.host}:${actualPort}`

  console.log(
    JSON.stringify(
      {
        status: "ready",
        repoRoot,
        url: `${baseUrl}/#/sessions/sess-showcase`,
        routes: {
          showcaseSession: `${baseUrl}/#/sessions/sess-showcase`,
          errorSession: `${baseUrl}/#/sessions/sess-error`,
          archivedSessions: `${baseUrl}/#/sessions/archived`,
          newSession: `${baseUrl}/#/`,
          appearanceSettings: `${baseUrl}/#/settings/appearance`,
          lightTheme: `${baseUrl}/?theme=light#/sessions/sess-showcase`,
        },
      },
      null,
      2,
    ),
  )

  const shutdown = async () => {
    await server.close()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
