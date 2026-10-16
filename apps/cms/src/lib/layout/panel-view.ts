import * as React from "react"

/**
 * Panel view: the signed-in shell draws only the page's middle panel, with no
 * left menu and no top bar. Another app asks for it by showing one of this
 * app's pages in a frame named `shell-panel`, with `?panel=1` on the address,
 * so that app's own menu and top bar sit around this app's page. Personal does
 * this to show the other apps' screens in one place.
 *
 * It only holds while the page sits inside a frame. The same address opened in
 * a tab of its own draws the full app. The IDE's preview frames the app too,
 * but under another name and without `?panel=1`, so it keeps the full app.
 *
 * The frame's name is what the browser goes by. It stays with the frame through
 * every page loaded in it, including the sign-in page and wherever that sends
 * people next, while `?panel=1` falls off the address at the first move. The
 * server cannot see the name, so `?panel=1` is what keeps the menu from
 * flashing in on the first page. `docs/shell/panel-view.md` has the rest.
 */

export const PANEL_VIEW_PARAM = "panel"
export const PANEL_FRAME_NAME = "shell-panel"

/** The note a page in panel view sends the page around it after every move. */
export const PANEL_MESSAGE_TYPE = "shell-panel"

export type PanelMessage = {
  type: typeof PANEL_MESSAGE_TYPE
  /** The address inside this app, such as `/dashboard`. */
  path: string
  /** The page's name, the same one the left menu gives it. */
  title: string
}

type PanelWindow = Pick<Window, "self" | "top" | "name">

export function addressAsksForPanelView(searchStr: string) {
  return new URLSearchParams(searchStr).get(PANEL_VIEW_PARAM) === "1"
}

/** The browser's answer: inside a frame that asked by its name or its address. */
export function panelViewInBrowser(searchStr: string, win: PanelWindow) {
  if (win.self === win.top) return false
  return win.name === PANEL_FRAME_NAME || addressAsksForPanelView(searchStr)
}

const noSubscription = () => () => {}

/**
 * Whether the shell draws the page as a panel. The server can only read the
 * address, so the first paint follows `?panel=1` alone; the browser then adds
 * whether the page really is in a frame, and the frame's name.
 */
export function usePanelView(searchStr: string) {
  return React.useSyncExternalStore(
    noSubscription,
    () => panelViewInBrowser(searchStr, window),
    () => addressAsksForPanelView(searchStr)
  )
}

/**
 * Tells the page around the frame where this one is, so its own address and
 * title can follow. Sent to any parent: what it carries is the address inside
 * this app and the menu's name for it, and a page on another site never gets
 * this far, because the sign-in cookie is not sent into another site's frame.
 */
export function usePanelReport(
  panelView: boolean,
  path: string,
  title: string
) {
  React.useEffect(() => {
    if (!panelView || window.parent === window) return
    const message: PanelMessage = { type: PANEL_MESSAGE_TYPE, path, title }
    window.parent.postMessage(message, "*")
  }, [panelView, path, title])
}
