import * as React from "react"
import { Link } from "@tanstack/react-router"
import { GaugeIcon, MegaphoneIcon, PencilLineIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { EmptyRow } from "@/components/shared/feed-card"
import { titleLink } from "@/lib/nav/title-link"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs } from "@/components/ui/tabs"
import { UnderlineTab, UnderlineTabsList } from "@/components/ui/underline-tabs"
import {
  isAiLimitNotification,
  type NotificationItem,
} from "@/lib/api/notification"
import { focusRing } from "@/lib/layout/focus-ring"
import {
  dayRangeText,
  daysBetween,
  formatClockTime,
  formatDate,
} from "@/lib/format/format-time"
import { cn } from "@/lib/utils"

/**
 * Every notice the app has sent, newest first, grouped into days.
 *
 * It is a feed rather than a card: it is the Activity tab of the combined
 * Needs you / Activity widget, which owns the card and its header. Its own
 * All/Unread switch rides along on the footer strip below the feed.
 */

type ActivityEvent = {
  id: string
  /** Whose event this is — the bold start of the line. */
  who: string
  /** The rest of the sentence after the name. */
  text: string
  /** A muted second line, when there is something to quote. */
  detail: string | null
  /** The kind of thing that happened, in a chip while it is unopened. */
  kind: string
  /** Where the thing it happened to lives, so the line can open it. */
  link: { to: string; open: string } | null
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
    kind: "Update",
    link: null,
    avatarUrl: item.actor_avatar_url,
    icon: null,
    createdAt: new Date(item.created_at),
    read: Boolean(item.read_at),
  }

  // Deleting the thing takes its notices with it, so these ids are only ever
  // missing on a notice that was never about one.
  const feedbackLink = item.feedback_id
    ? { to: "/admin/feedback", open: item.feedback_id }
    : null

  if (item.type === "feedback_comment") {
    return {
      ...event,
      text: `commented on ${owner} feedback`,
      detail: item.feedback_message,
      kind: "Comment",
      link: feedbackLink,
    }
  }
  if (item.type === "feedback_vote") {
    return {
      ...event,
      text: `gave ${owner} feedback a thumbs up`,
      detail: item.feedback_message,
      kind: "Thumbs up",
      link: feedbackLink,
    }
  }
  if (item.type === "feedback_merged") {
    // The detail quotes the surviving item — the duplicate is already gone.
    return {
      ...event,
      text: `merged ${owner} feedback into another item`,
      detail: item.feedback_message,
      kind: "Merged",
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
      kind: item.type === "ai_limit_warning" ? "AI warning" : "AI limit",
      icon: GaugeIcon,
    }
  }
  if (item.type === "announcement") {
    return {
      ...event,
      who: "Announcement",
      text: "went live",
      detail: item.announcement_title,
      kind: "Announcement",
      icon: MegaphoneIcon,
      link: item.announcement_id
        ? { to: "/admin/announcements", open: item.announcement_id }
        : null,
    }
  }
  return {
    ...event,
    who: "Changelog",
    text: "was published",
    detail: item.changelog_title,
    kind: "Update",
    icon: PencilLineIcon,
    link: item.changelog_entry_id
      ? { to: "/changelog", open: item.changelog_entry_id }
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

/**
 * The feed, with no card or header around it, and the strip along the bottom:
 * the All/Unread switch on the left and the link to the full table on the
 * right. The switch lives down here rather than up in the header because the
 * header belongs to whoever owns the card, and on the combined Needs you /
 * Activity widget that header is already carrying its own tabs.
 */
export function ActivityFeed({
  items,
  filter,
  onFilterChange,
  unread,
  footerTo = "/admin/notifications",
  footerLabel = "View all notifications",
}: {
  items: NotificationItem[]
  filter: "all" | "unread"
  onFilterChange: (filter: "all" | "unread") => void
  /** How many are unopened, shown after the Unread tab. */
  unread: number
  footerTo?: string | null
  footerLabel?: string
}) {
  const events = React.useMemo(() => items.map(toActivityEvent), [items])
  const shown = filter === "unread" ? events.filter((e) => !e.read) : events

  // The heading a group carries, the days it covers, and how much of it is
  // still unopened — grouped in the order the events already came in.
  const today = new Date()
  const groups: { index: number; events: ActivityEvent[] }[] = []
  for (const event of shown) {
    const index = bucketIndex(event.createdAt, today)
    const group = groups.at(-1)
    if (group?.index === index) group.events.push(event)
    else groups.push({ index, events: [event] })
  }

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        {groups.length ? (
          <div className="flex flex-col divide-y">
            {groups.map((group, groupIndex) => (
              <div
                key={`${group.index}-${groupIndex}`}
                className="flex flex-col divide-y"
              >
                <div className="flex items-center gap-2 bg-muted/40 px-4 py-2 sm:px-5">
                  <span className="text-xs font-semibold">
                    {dayBuckets[group.index]}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {dayRangeText(
                      group.events.at(-1)!.createdAt,
                      group.events[0]!.createdAt
                    )}
                  </span>
                  {countUnread(group.events) ? (
                    <span className="text-xs text-muted-foreground">
                      · {countUnread(group.events)} unread
                    </span>
                  ) : null}
                </div>
                {group.events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 px-4 py-3 sm:px-5"
                  >
                    <span
                      className={cn(
                        "mt-3.5 size-2 shrink-0 rounded-full",
                        event.read ? "bg-transparent" : "bg-red-500 dark:bg-red-400"
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
                          search={{ open: event.link.open }}
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
          <EmptyRow>
            {filter === "unread"
              ? "Everything in the latest activity has been opened."
              : "No notices sent yet."}
          </EmptyRow>
        )}
      </ScrollArea>

      <div className="flex h-12 shrink-0 items-stretch justify-between gap-4 border-t px-4 sm:px-5">
        <Tabs
          className="h-full"
          value={filter}
          onValueChange={(value) => onFilterChange(value as "all" | "unread")}
        >
          {/* `-mb-px` so the line under the chosen tab lands on the card's own
              hairline rather than a pixel above it. */}
          <UnderlineTabsList className="-mb-px text-sm">
            <UnderlineTab value="all" label="All" />
            {/* The count is what this tab will show, not the whole table's
                unread figure — a number that did not match the rows under it
                would be the tray's dishonest bell all over again. */}
            <UnderlineTab value="unread" label="Unread" count={unread} />
          </UnderlineTabsList>
        </Tabs>
        {footerTo ? (
          <Link
            to={footerTo}
            className={cn(
              "flex shrink-0 items-center rounded-md text-sm font-medium transition-colors hover:text-muted-foreground",
              focusRing
            )}
          >
            {footerLabel}
          </Link>
        ) : null}
      </div>
    </>
  )
}
