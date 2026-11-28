/**
 * The editor's address names the video it has open, `?video=<id>`, and may
 * name the rail panel to open on: `?panel=copy`, which Make this a template
 * uses, or `?panel=templates`, which a video made from a template in New
 * video opens on (templates.md). `?from=drafts` says the video was opened
 * from Content's Drafts list, which the header's back arrow returns to; with
 * none it returns to All content. Anything else is dropped, and the project
 * opens on its remembered video and its Videos tab.
 */
export const LINKED_PANELS = ["copy", "templates"] as const
export type LinkedPanel = (typeof LINKED_PANELS)[number]
export type VideoSearch = { video?: string; panel?: LinkedPanel; from?: "drafts" }

export function readVideoSearch(search: Record<string, unknown>): VideoSearch {
  const video = search.video
  return {
    ...(typeof video === "string" && /^[A-Za-z0-9-]{1,36}$/.test(video) ? { video } : {}),
    ...(LINKED_PANELS.includes(search.panel as LinkedPanel) ? { panel: search.panel as LinkedPanel } : {}),
    ...(search.from === "drafts" ? { from: "drafts" as const } : {}),
  }
}
