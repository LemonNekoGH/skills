import { DEFAULT_APPEARANCE_SETTINGS } from "@deskfleet-repo/packages/client/src/appearance.ts"
import type { DeskfleetDesktopApi } from "@deskfleet-repo/packages/client/src/desktop-api.ts"
import { createDevShowcaseDesktopApi } from "./dev-showcase.ts"

const params = new URLSearchParams(window.location.search)
const platformParam = params.get("platform")
const platform: DeskfleetDesktopApi["platform"] =
  platformParam === "darwin" || platformParam === "win32" || platformParam === "linux" || platformParam === "web"
    ? platformParam
    : "darwin"
const themeParam = params.get("theme")
const theme = themeParam === "light" || themeParam === "dark" || themeParam === "system" ? themeParam : "dark"

const showcaseApi = createDevShowcaseDesktopApi({
  platform,
  appearance: {
    get: async () => ({ ...DEFAULT_APPEARANCE_SETTINGS, theme }),
    set: async settings => settings,
    onChanged: () => () => {},
  },
})

Object.defineProperty(window, "deskfleet", {
  value: {
    ...showcaseApi,
    googleTag: { send: async () => {} },
  },
  configurable: true,
  writable: true,
})
