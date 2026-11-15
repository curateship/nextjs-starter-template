import type { RenderJobSummary } from "@/lib/api/video/exports"
import { formatClock } from "@/lib/video/timeline-utils"

/** "2:14 so far": how long something has been going. */
export function timeSoFar(ms: number) {
  return `${formatClock(Math.max(0, ms))} so far`
}

/**
 * The one line that says how a waiting or running export is getting on, the
 * same on the Exports page and in the Export window:
 *
 * - waiting for room on the server's disk: the worker's own words for it
 * - waiting behind others: "Waiting, 2 ahead of it"
 * - next in line: "Waiting to start…"
 * - rendering: "Making it now · 2:14 so far", counted from when the worker
 *   began, once `now` is known
 */
export function exportProgressText(
  job: Pick<RenderJobSummary, "status" | "error_message" | "queue_position" | "started_at">,
  now: number | null
) {
  if (job.status === "running") {
    const since = job.started_at ? Date.parse(job.started_at) : NaN
    return now !== null && Number.isFinite(since)
      ? `Making it now · ${timeSoFar(now - since)}`
      : "Making it now…"
  }
  if (job.status === "queued" && job.error_message) return job.error_message
  if (job.queue_position && job.queue_position > 1) {
    return `Waiting, ${job.queue_position - 1} ahead of it`
  }
  return "Waiting to start…"
}

/** The button that stops waiting or running exports, by how many it stops. */
export function stopExportsLabel(count: number) {
  return count > 1 ? `Stop all ${count} exports` : "Stop export"
}
