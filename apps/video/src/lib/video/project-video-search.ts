/**
 * The editor's address names the video it has open, `?video=<id>`, and may
 * name the rail panel to open on, `?panel=copy`, which Make this a template
 * uses. Anything else is dropped, and the project opens on its remembered
 * video and its Videos tab.
 */
export type VideoSearch = { video?: string; panel?: "copy" }

export function readVideoSearch(search: Record<string, unknown>): VideoSearch {
  const video = search.video
  return {
    ...(typeof video === "string" && /^[A-Za-z0-9-]{1,36}$/.test(video) ? { video } : {}),
    ...(search.panel === "copy" ? { panel: "copy" as const } : {}),
  }
}
