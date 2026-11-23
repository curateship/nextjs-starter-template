/**
 * Where a library video stands with the two things the background worker
 * makes for it: the smooth 720p copy the editor plays and scrubs, and the
 * strip of frames drawn along its clip. Pictures and sound get neither, so
 * they are always ready.
 *
 * No row yet counts as preparing: the worker gives a new upload its rows
 * within one fifteen-second tick. A failure wins over work still going, so a
 * file never says it is getting ready while half of it has already given up.
 */

export type MediaPreparation = "ready" | "preparing" | "failed"

export function mediaPreparation(item: {
  file_type: string
  proxy_status: string | null
  filmstrip_status: string | null
}): MediaPreparation {
  if (item.file_type !== "video") return "ready"
  const statuses = [item.proxy_status, item.filmstrip_status]
  if (statuses.includes("error")) return "failed"
  return statuses.every((status) => status === "ready") ? "ready" : "preparing"
}
