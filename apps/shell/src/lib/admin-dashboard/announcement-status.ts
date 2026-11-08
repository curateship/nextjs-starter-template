import type { Announcement } from "@/lib/api/content/announcements"
import { formatUtcDate } from "@/lib/format/format-time"

/**
 * How an announcement reads in a list: whether it is showing, and the days
 * it runs. The Admin dashboard's Announcements
 * tab (left panel's ⋮) and the announcement window both read these.
 */

/** Up now, starting later, or over. */
type AnnouncementStatus = "showing" | "scheduled" | "ended"

export const announcementStatusLabels: Record<AnnouncementStatus, string> = {
  showing: "Showing",
  scheduled: "Scheduled",
  ended: "Ended",
}

export function announcementStatus(
  announcement: Announcement,
  nowMs: number
): AnnouncementStatus {
  const endsAt = announcement.endsAt ? Date.parse(announcement.endsAt) : null
  if (endsAt !== null && endsAt <= nowMs) return "ended"
  if (Date.parse(announcement.startsAt) > nowMs) return "scheduled"
  return "showing"
}

/** The window in words: dates are whole days, kept in UTC so they never shift. */
export function windowText(announcement: Announcement) {
  const from = formatUtcDate(announcement.startsAt)
  return announcement.endsAt
    ? `${from} – ${formatUtcDate(announcement.endsAt)}`
    : `${from} – until retired`
}
