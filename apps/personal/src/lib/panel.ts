/**
 * How Personal talks to the app in its middle panel. The other app's shell
 * draws only its middle panel when the frame is named `shell-panel` and the
 * first address carries `?panel=1`, and after every move it posts
 * `{ type: "shell-panel", path, title }` to Personal. The repo's
 * `docs/shell/panel-view.md` is the other side of this, in
 * `src/lib/layout/panel-view.ts` of every shell app.
 */

export const PANEL_FRAME_NAME = "shell-panel"
const PANEL_MESSAGE_TYPE = "shell-panel"

/**
 * The note Personal sends the framed app to change page itself, with no
 * reload: `{ type: "shell-panel-go", path }`. The shell's `usePanelGo` reads it.
 */
export const PANEL_GO_TYPE = "shell-panel-go"

export type PanelReport = {
  path: string
  title: string
  /** The app takes the "change page" note. Apps from before 18 Oct 2026 don't. */
  canGo: boolean
}

/**
 * Reads where the framed app says it is now. Anything not from the open app's
 * own address, not from Personal's frame, or not shaped like the shell's note
 * is ignored, since any page can post a message to any window.
 */
export function readPanelReport(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  appOrigin: string,
  frame: unknown
): PanelReport | null {
  if (event.origin !== appOrigin) return null
  if (!frame || event.source !== frame) return null
  const data: unknown = event.data
  if (typeof data !== "object" || data === null) return null
  const { type, path, title, canGo } = data as Record<string, unknown>
  if (type !== PANEL_MESSAGE_TYPE) return null
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return null
  }
  return {
    path,
    title: typeof title === "string" ? title.slice(0, 120) : "",
    canGo: canGo === true,
  }
}
