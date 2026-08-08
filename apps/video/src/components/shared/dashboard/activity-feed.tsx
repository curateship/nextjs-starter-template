import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  GaugeIcon,
  MegaphoneIcon,
  PencilLineIcon,
  UserCheckIcon,
  XIcon,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { EmptyRow } from "@/components/shared/feed-card"
import { titleLink } from "@/lib/nav/title-link"
import { focusRing } from "@/lib/layout/focus-ring"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  type NotificationItem,
} from "@/lib/api/notification"
import {
  automationApprovalNotificationText,
  isAiLimitNotification,
  notificationTypeLabels,
  type NotificationType,
} from "@/lib/notification-types"
import {
  emptyActivityText,
  keepShownActivity,
  type ActivityFilter,
  type ActivityRange,
} from "@/lib/dashboard/activity-filter"
import type { UrgentItem } from "@/lib/dashboard/urgent-items"
import {
  dayRangeText,
  daysBetween,
  formatClockTime,
  formatDate,
} from "@/lib/format/format-time"
import { cn } from "@/lib/utils"

/**
 * Everything the app has to say on one feed: the things waiting on somebody at
 * the top under "Urgent", then every notice it has sent, newest first, grouped
 * into days.
 *
 * It is a feed rather than a card: the card, its heading and its two controls
 * belong to `ActivityCard`, which owns them because the same two controls also
 * decide what this draws.
 */

// ---------------------------------------------------------------------------
// One notice, as the feed says it.

type ActivityEvent = {
  id: string
  /** Whose event this is — the bold start of the line. */
  who: string
  /** The rest of the sentence after the name. */
  text: string
  /** A muted second line, when there is something to quote. */
  detail: string | null
  /** What kind of notice it is, which is what the dropdown filters on. */
  type: NotificationType
  /** That kind in words, in a chip while it is unopened. */
  kind: string
  /**
   * Where the thing it happened to lives, so the line can open it. The same
   * shape an urgent row uses, because an approval opens a run inside its
   * flow's editor and needs a path piece and a search value, not just an id.
   */
  link: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
  } | null
  /** The person's photo, when they have one. */
  avatarUrl: string | null
  /**
   * Shown in place of a photo when the app itself did it — an update or an
   * announcement is posted by the product, not by a person.
   */
  icon: React.ComponentType<{ className?: string }> | null
  createdAt: Date
  read: boolean
}

function toActivityEvent(item: NotificationItem): ActivityEvent {
  const actor = item.actor_name ?? "Someone"
  // Whose feedback it was. Naming both people keeps it plain who did what to
  // whom without guessing at anybody's pronouns.
  const owner =
    item.recipient_name && item.recipient_name !== item.actor_name
      ? `${item.recipient_name}'s`
      : "their own"

  const event: ActivityEvent = {
    id: item.id,
    who: actor,
    text: "",
    detail: null,
    type: item.type,
    kind: notificationTypeLabels[item.type] ?? "Update",
    link: null,
    avatarUrl: item.actor_avatar_url,
    icon: null,
    createdAt: new Date(item.created_at),
    read: Boolean(item.read_at),
  }

  // Deleting the thing takes its notices with it, so these ids are only ever
  // missing on a notice that was never about one.
  const feedbackLink = item.feedback_id
    ? { to: "/admin/feedback", search: { open: item.feedback_id } }
    : null

  if (item.type === "feedback_comment") {
    return {
      ...event,
      text: `commented on ${owner} feedback`,
      detail: item.feedback_message,
      link: feedbackLink,
    }
  }
  if (item.type === "feedback_vote") {
    return {
      ...event,
      text: `gave ${owner} feedback a thumbs up`,
      detail: item.feedback_message,
      link: feedbackLink,
    }
  }
  if (item.type === "feedback_merged") {
    // The detail quotes the surviving item — the duplicate is already gone.
    return {
      ...event,
      text: `merged ${owner} feedback into another item`,
      detail: item.feedback_message,
      link: feedbackLink,
    }
  }
  // Somebody ran into their monthly AI ceiling. The one useful click here is
  // the AI dashboard, but this line has no per-person filter to hand it, so
  // the words carry the who and the what on their own.
  if (isAiLimitNotification(item.type)) {
    return {
      ...event,
      who: item.recipient_name,
      text:
        item.type === "ai_limit_warning"
          ? "passed 80% of their monthly AI allowance"
          : "used up their monthly AI allowance",
      icon: GaugeIcon,
    }
  }
  // A run stopped to ask somebody a question. Like an announcement, the notice
  // is the message — the words come from the one place that writes them, so the
  // tray, the notifications table and this feed all say the same thing.
  if (item.type === "automation_approval") {
    return {
      ...event,
      who: item.automation_name ?? "An automation",
      text:
        automationApprovalNotificationText[
          item.automation_approval_state ?? "pending"
        ].message,
      detail: null,
      icon: UserCheckIcon,
      // Straight to the run that is waiting, the way the notifications table
      // opens one. Without both ids there is no run to open, so no link.
      link:
        item.automation_id && item.automation_run_id
          ? {
              to: "/admin/automations/$automationId",
              params: { automationId: item.automation_id },
              search: { run: item.automation_run_id },
            }
          : null,
    }
  }
  if (item.type === "announcement") {
    return {
      ...event,
      who: "Announcement",
      text: "went live",
      detail: item.announcement_title,
      icon: MegaphoneIcon,
      link: item.announcement_id
        ? {
            to: "/admin/announcements",
            search: { open: item.announcement_id },
          }
        : null,
    }
  }
  return {
    ...event,
    who: "Changelog",
    text: "was published",
    detail: item.changelog_title,
    icon: PencilLineIcon,
    link: item.changelog_entry_id
      ? { to: "/changelog", search: { open: item.changelog_entry_id } }
      : null,
  }
}

/** The face beside a line: a photo, initials, or the app's own mark. */
function ActivityAvatar({ event }: { event: ActivityEvent }) {
  if (event.icon) {
    return (
      <Avatar className="mt-0.5 size-8">
        <AvatarFallback>
          <event.icon className="size-4" />
        </AvatarFallback>
      </Avatar>
    )
  }

  return (
    <Avatar className="mt-0.5 size-8">
      {/* Left out entirely rather than given an empty src, which the browser
          reads as a request for the page itself. */}
      {event.avatarUrl ? (
        <AvatarImage src={event.avatarUrl} alt={event.who} />
      ) : null}
      <AvatarFallback className="text-xs">{initials(event.who)}</AvatarFallback>
    </Avatar>
  )
}

/** Up to two letters, the way the account menu writes them. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

/** Which heading an event sits under: today, yesterday, this week, or older. */
const dayBuckets = [
  "Today",
  "Yesterday",
  "Earlier this week",
  "Earlier",
] as const

function bucketIndex(date: Date, today: Date) {
  const days = daysBetween(date, today)
  if (days <= 0) return 0
  if (days === 1) return 1
  return days < 7 ? 2 : 3
}

function countUnread(events: ActivityEvent[]) {
  return events.filter((event) => !event.read).length
}

// ---------------------------------------------------------------------------
// The urgent rows.

/**
 * One thing waiting on somebody: what it is, where the fix is, and a way to
 * wave it off.
 *
 * The X only appears on hover, so a row that is nothing but a nuisance can be
 * put away without a second control sitting on every line forever. It appears
 * on keyboard focus too — hover is not a thing a keyboard can do, and this is
 * the row's only action besides opening it.
 */
function UrgentRow({
  item,
  first,
  onDismiss,
}: {
  item: UrgentItem
  /** The one to do first, which is the only one that carries the colour. */
  first: boolean
  onDismiss: (item: UrgentItem) => void
}) {
  return (
    <div className="group flex items-center gap-3 px-4 py-3 sm:px-5">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground",
          first &&
            "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300"
        )}
        aria-hidden
      >
        <item.icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start">
        <Link
          to={item.to}
          params={item.params}
          search={item.search}
          hash={item.hash}
          className={cn(titleLink, "max-w-full text-sm font-medium")}
          title={item.title}
        >
          {item.title}
        </Link>
        <p
          className="w-full truncate text-xs text-muted-foreground"
          title={item.detail}
        >
          {item.detail}
        </p>
      </div>
      {/* Where a notice puts its time, so the two kinds of row line up. A row
          the app records no date for says that outright rather than leaving a
          gap that reads as "just now". */}
      <span
        className="shrink-0 text-xs text-muted-foreground tabular-nums"
        title={
          item.since
            ? `Since ${formatDate(item.since)}`
            : "Nothing in the app records when this started"
        }
      >
        {item.since ? formatDate(item.since) : "No date"}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button asChild variant={first ? "default" : "outline"}>
          <Link
            to={item.to}
            params={item.params}
            search={item.search}
            hash={item.hash}
          >
            {item.action}
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          // Hidden until the row is hovered, so a control nobody needs most of
          // the time is not sitting on every line. Shown on keyboard focus,
          // which is the only way in without a pointer — and shown outright on
          // a narrow screen, where there is no hover at all and an invisible
          // button that still takes taps would be worse than a visible one.
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
          onClick={() => onDismiss(item)}
          title="Put this away"
          aria-label={`Put away: ${item.title}`}
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The feed.

/**
 * The feed with no card or header around it, plus the strip along the bottom
 * holding the link to the full table.
 *
 * Both controls are handed in rather than owned here, because the card's
 * heading reads from them too.
 */
export function ActivityFeed({
  urgent,
  items,
  filter,
  range,
  onDismissUrgent,
  footerTo = "/admin/notifications",
  footerLabel = "View all notifications",
}: {
  /**
   * The things waiting on somebody, already settled by the card: dismissed
   * ones dropped, the day tabs applied, and empty outright where the dropdown
   * asked for one kind of notice. This draws what it is handed.
   */
  urgent: UrgentItem[]
  items: NotificationItem[]
  filter: ActivityFilter
  range: ActivityRange
  onDismissUrgent: (item: UrgentItem) => void
  footerTo?: string | null
  footerLabel?: string
}) {
  const events = React.useMemo(() => items.map(toActivityEvent), [items])

  // One `now` for the whole render, so a row cannot land in one bucket and be
  // counted in another.
  const today = new Date()
  const shown = keepShownActivity(events, filter, range, today)

  // The heading a group carries, the days it covers, and how much of it is
  // still unopened — grouped in the order the events already came in.
  const groups: { index: number; events: ActivityEvent[] }[] = []
  for (const event of shown) {
    const index = bucketIndex(event.createdAt, today)
    const group = groups.at(-1)
    if (group?.index === index) group.events.push(event)
    else groups.push({ index, events: [event] })
  }

  return (
    <>
      <ScrollArea
        className="min-h-0 flex-1"
        // `[&>div]:block!` because Radix wraps what it is given in a
        // `display: table` box, which sizes to its widest line rather than to
        // the card. One long urgent detail then stretches every row and pushes
        // the buttons out past the card's edge, where they are clipped.
        viewportClassName="[&>div]:block!"
      >
        {urgent.length || groups.length ? (
          <div className="flex flex-col divide-y">
            {urgent.length ? (
              <div className="flex flex-col divide-y">
                <GroupHeading
                  title="Urgent"
                  detail={`${urgent.length} waiting on you`}
                />
                {urgent.map((item, index) => (
                  <UrgentRow
                    key={item.id}
                    item={item}
                    first={index === 0}
                    onDismiss={onDismissUrgent}
                  />
                ))}
              </div>
            ) : null}
            {groups.map((group, groupIndex) => (
              <div
                key={`${group.index}-${groupIndex}`}
                className="flex flex-col divide-y"
              >
                <GroupHeading
                  title={dayBuckets[group.index]!}
                  detail={dayRangeText(
                    group.events.at(-1)!.createdAt,
                    group.events[0]!.createdAt
                  )}
                  unread={countUnread(group.events)}
                />
                {group.events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 px-4 py-3 sm:px-5"
                  >
                    <span
                      className={cn(
                        "mt-3.5 size-2 shrink-0 rounded-full",
                        event.read
                          ? "bg-transparent"
                          : "bg-red-500 dark:bg-red-400"
                      )}
                      aria-hidden
                    />
                    <ActivityAvatar event={event} />
                    <div className="flex min-w-0 flex-1 flex-col items-start pt-1">
                      <p
                        className="w-full truncate text-sm"
                        title={`${event.who} ${event.text}`}
                      >
                        <span className="font-medium">{event.who}</span>{" "}
                        {event.text}
                      </p>
                      {event.detail && event.link ? (
                        <Link
                          to={event.link.to}
                          params={event.link.params}
                          search={event.link.search}
                          className={cn(
                            titleLink,
                            "max-w-full text-sm text-muted-foreground"
                          )}
                          title={event.detail}
                        >
                          {event.detail}
                        </Link>
                      ) : event.detail ? (
                        <p
                          className="w-full truncate text-sm text-muted-foreground"
                          title={event.detail}
                        >
                          {event.detail}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 pt-1">
                      <span
                        className={cn(
                          "text-xs",
                          event.read
                            ? "text-muted-foreground"
                            : "rounded-md bg-muted px-2 py-0.5 text-foreground/80"
                        )}
                      >
                        {event.kind}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {group.index < 2
                          ? formatClockTime(event.createdAt)
                          : formatDate(event.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <EmptyRow>{emptyActivityText(filter, range)}</EmptyRow>
        )}
      </ScrollArea>

      {footerTo ? (
        <div className="flex h-12 shrink-0 items-center justify-end border-t px-4 sm:px-5">
          <Link
            to={footerTo}
            className={cn(
              "flex shrink-0 items-center rounded-md text-sm font-medium transition-colors hover:text-muted-foreground",
              focusRing
            )}
          >
            {footerLabel}
          </Link>
        </div>
      ) : null}
    </>
  )
}

/** The sticky-looking grey bar above each run of rows. */
function GroupHeading({
  title,
  detail,
  unread = 0,
}: {
  title: string
  detail: string
  unread?: number
}) {
  return (
    <div className="flex items-center gap-2 bg-muted/40 px-4 py-2 sm:px-5">
      <span className="text-xs font-semibold">{title}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {detail}
      </span>
      {unread ? (
        <span className="text-xs text-muted-foreground">· {unread} unread</span>
      ) : null}
    </div>
  )
}
