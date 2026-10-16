import { PANEL_MESSAGE_TYPE } from "@/lib/layout/panel-view"

/**
 * The other apps Personal shows in its middle panel. Personal frames one of an
 * app's real pages with `?panel=1`, and the shell in that app then draws only
 * its middle panel (`src/lib/layout/panel-view.ts`). Every button on the page
 * works, because it is the app itself.
 *
 * Local only for now: each address is the app's dev server from the repo's
 * `local-apps.json`. On the live sites each app has its own domain, and the
 * browser keeps an app's sign-in out of a frame on a different domain, so a
 * live address waits until every app is also reachable under one domain.
 * `workspace/docs/app-panels.md` has the rest.
 */
export type ConnectedApp = {
  /** The first part of Personal's address for it: `/apps/<id>/...`. */
  id: string
  name: string
  /** Where the app runs, with no path. */
  address: string
}

export const CONNECTED_APPS: readonly ConnectedApp[] = [
  { id: "project", name: "Project", address: "http://localhost:3020" },
]

export function findConnectedApp(id: string) {
  return CONNECTED_APPS.find((app) => app.id === id) ?? null
}

/** Personal's own address for one of an app's pages: `/apps/project/dashboard`. */
export function appPanelHref(appId: string, path: string) {
  return `/apps/${appId}${path === "/" ? "" : path}`
}

/**
 * The page the frame loads. Each part of the path is encoded on its own, so a
 * path can never reach another site or carry a search of its own.
 */
export function panelFrameSrc(app: ConnectedApp, path: string) {
  const encoded = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
  return `${new URL(app.address).origin}${encoded.startsWith("/") ? "" : "/"}${encoded}?panel=1`
}

export type PanelReport = { path: string; title: string }

/**
 * Reads where the framed app says it is now. Anything not from this app's own
 * address, not from this page's frame, or not shaped like the shell's note is
 * ignored, since any page can post a message to any window.
 */
export function readPanelReport(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  app: ConnectedApp,
  frame: unknown
): PanelReport | null {
  if (event.origin !== new URL(app.address).origin) return null
  if (!frame || event.source !== frame) return null
  const data: unknown = event.data
  if (typeof data !== "object" || data === null) return null
  const { type, path, title } = data as Record<string, unknown>
  if (type !== PANEL_MESSAGE_TYPE) return null
  if (typeof path !== "string" || !path.startsWith("/")) return null
  return {
    path: decodePath(path),
    title: typeof title === "string" ? title.slice(0, 120) : "",
  }
}

/**
 * The frame reports its address the way the browser keeps it, with `%20` for
 * a space. Personal's own address hands the path back decoded, so the two are
 * compared decoded.
 */
function decodePath(path: string) {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}
