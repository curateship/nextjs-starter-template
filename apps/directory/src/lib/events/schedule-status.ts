import { formatEventClock, formatEventShortDay } from "@/lib/events/event-time"

/**
 * Whether an event is going ahead (task events/27). Apart from draft and
 * published: a published event can be cancelled or postponed, and stays on
 * the site with a banner, a label on its card, and its sign-ups closed.
 *
 * Postponed means there is no new date yet (Tyler, 19 Nov 2026: "New date
 * unknown"). When the admin gives it one, it goes back to scheduled with a
 * "Rescheduled from" note.
 *
 * Browser-safe: the event record, the public page and the server all use it.
 */

export const SCHEDULE_STATUSES = ["scheduled", "postponed", "cancelled"] as const

export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number]

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  scheduled: "Scheduled",
  postponed: "Postponed",
  cancelled: "Cancelled",
}

/** A stored value read safely: anything unknown is going ahead. */
export function readScheduleStatus(value: unknown): ScheduleStatus {
  return value === "cancelled" || value === "postponed" ? value : "scheduled"
}

/**
 * What everybody on an event's list is emailed about the latest change.
 * "back-on" is a cancelled or postponed event going ahead on the same date.
 */
export type ScheduleNotice = "cancelled" | "postponed" | "rescheduled" | "back-on"

/** Where an event was before the admin gave it a new date. */
export type RescheduledFrom = { date: string; time: string }

/**
 * The line at the top of an event's page, or null for an event going ahead
 * as first planned.
 */
export function scheduleBannerText(
  status: ScheduleStatus,
  rescheduledFrom: RescheduledFrom | null
): string | null {
  if (status === "cancelled") return "This event is cancelled."
  if (status === "postponed") return "This event is postponed. A new date has not been set yet."
  if (rescheduledFrom) {
    return `Rescheduled from ${formatEventShortDay(rescheduledFrom.date)}, ${formatEventClock(rescheduledFrom.time)}.`
  }
  return null
}
