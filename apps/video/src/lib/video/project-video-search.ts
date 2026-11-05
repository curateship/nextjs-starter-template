/**
 * The editor's address names the video it has open, `?video=<id>`, and may
 * name the rail panel to open on: `?panel=copy`, which Make this a template
 * uses, or `?panel=templates`, which a video made from a template in New
 * video opens on (templates.md). Anything else is dropped, and the project
 * opens on its remembered video and its Videos tab.
 */
export const LINKED_PANELS = ["copy", "templates"] as const
export type LinkedPanel = (typeof LINKED_PANELS)[number]
export type VideoSearch = { video?: string; panel?: LinkedPanel }

export function readVideoSearch(search: Record<string, unknown>): VideoSearch {
  const video = search.video
  return {
    ...(typeof video === "string" && /^[A-Za-z0-9-]{1,36}$/.test(video) ? { video } : {}),
    ...(LINKED_PANELS.includes(search.panel as LinkedPanel) ? { panel: search.panel as LinkedPanel } : {}),
  }
}
