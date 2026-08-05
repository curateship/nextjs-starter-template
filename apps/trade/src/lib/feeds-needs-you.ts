import {
  BellIcon,
  MegaphoneIcon,
  MessageSquarePlusIcon,
  PencilLineIcon,
} from "lucide-react"

import type { NeedsYouItem } from "@/components/shared/needs-you-card"
import type { FeedsAnnouncementRow, FeedsSummary } from "@/lib/api/admin-overview"
import { daysBetween, formatTimeAgo, formatUtcDate } from "@/lib/format-time"
import { plural } from "@/lib/plural"

/**
 * What the four feeds have waiting on somebody, most pressing first.
 *
 * It sits apart from the Overview's own rules — suspended accounts, broken
 * automations, subscriptions ending — because these four are about what the
 * app has been telling people, and they were written before the Overview
 * existed. A row only appears while it is true.
 */
export function buildFeedsNeedsYou(summary: FeedsSummary): NeedsYouItem[] {
  const { notifications, changelog, feedback, announcements } = summary
  const items: NeedsYouItem[] = []

  if (notifications.unread > 0) {
    items.push({
      id: "notifications",
      icon: BellIcon,
      title: `${notifications.unread.toLocaleString()} ${plural(notifications.unread, "notice")} nobody has opened`,
      detail: `${waitedText(notifications.oldestUnreadAt)} · ${notifications.sentLast7Days.toLocaleString()} sent this week`,
      action: "Review",
      to: "/admin/notifications",
    })
  }

  if (changelog.drafts > 0) {
    items.push({
      id: "changelog",
      icon: PencilLineIcon,
      title: `${changelog.drafts.toLocaleString()} changelog ${plural(changelog.drafts, "draft")} unpublished`,
      detail: `${changelog.lastPublishedAt ? `Last shipped ${formatTimeAgo(changelog.lastPublishedAt)}` : "Nothing published yet"} · ${changelog.published.toLocaleString()} published in all`,
      action: "Open drafts",
      to: "/changelog",
    })
  }

  if (feedback.noReply > 0) {
    items.push({
      id: "feedback",
      icon: MessageSquarePlusIcon,
      title: `${feedback.noReply.toLocaleString()} feedback ${plural(feedback.noReply, "item")} with no reply`,
      detail: `${feedback.last7Days.toLocaleString()} new this week${weekOnWeekText(feedback.last7Days, feedback.previous7Days)} · ${feedback.total.toLocaleString()} in all`,
      action: "Reply",
      to: "/admin/feedback",
    })
  }

  if (announcements.nextScheduled) {
    const next = announcements.nextScheduled
    items.push({
      id: "announcement",
      icon: MegaphoneIcon,
      title: `${next.title} goes live ${untilText(next.startsAt)}`,
      detail: `Scheduled ${scheduleText(next)}`,
      action: "Open",
      to: "/admin/announcements",
      search: { open: next.id },
    })
  }

  return items
}

const RELATIVE_DAYS = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" })

/** How long the longest-waiting unopened notice has been sitting there. */
function waitedText(oldestUnreadAt: string | null) {
  if (!oldestUnreadAt) return "None waiting"
  const days = daysBetween(new Date(oldestUnreadAt), new Date())
  if (days <= 0) return "Oldest arrived today"
  return `Oldest has waited ${days} ${plural(days, "day")}`
}

/** "in 6 days", "tomorrow", "today". */
function untilText(startsAt: string) {
  return RELATIVE_DAYS.format(
    -daysBetween(new Date(startsAt), new Date()),
    "day"
  )
}

/** ", up 2" — this week against the seven days before it. */
function weekOnWeekText(thisWeek: number, lastWeek: number) {
  const change = thisWeek - lastWeek
  if (change === 0) return ", same as last week"
  return change > 0 ? `, up ${change}` : `, down ${Math.abs(change)}`
}

/** "Aug 6, 2025 – Aug 30, 2025", or just when it starts if it never ends. */
function scheduleText(announcement: FeedsAnnouncementRow) {
  const from = formatUtcDate(announcement.startsAt)
  return announcement.endsAt
    ? `${from} – ${formatUtcDate(announcement.endsAt)}`
    : `from ${from}`
}
