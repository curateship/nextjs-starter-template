import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  BellIcon,
  MegaphoneIcon,
  MessageSquarePlusIcon,
  PencilLineIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { FeedsSummary } from "@/lib/api/feeds"
import {
  feedbackTypeBadgeVariants,
  feedbackTypeClassNames,
  feedbackTypeLabels,
} from "@/lib/feedback-type"
import { formatDate } from "@/lib/money"
import { cn } from "@/lib/utils"

/**
 * The front door for everything the app tells people: announcements, tray
 * notices, the changelog, and the feedback coming back. Every figure is read
 * from the same tables the page it links to reads, so a tile and its page can
 * never disagree.
 */

export function AdminFeedsDashboard({ summary }: { summary: FeedsSummary }) {
  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      <HeadlineFigures summary={summary} />

      {/* Two even columns: notices and feedback down the left, announcements
          and updates down the right. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <NotificationsCard notifications={summary.notifications} />
        <AnnouncementsCard announcements={summary.announcements} />
        <FeedbackCard feedback={summary.feedback} />
        <ChangelogCard changelog={summary.changelog} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The headline row: one card, the figures side by side, hairlines between them.

function HeadlineFigures({ summary }: { summary: FeedsSummary }) {
  const { announcements, notifications, changelog, feedback } = summary

  const figures = [
    {
      to: "/admin/announcements",
      icon: MegaphoneIcon,
      label: "Announcements",
      value: announcements.showingNow.toLocaleString(),
      footer: `showing now, ${announcements.scheduled.toLocaleString()} scheduled`,
    },
    {
      to: "/admin/notifications",
      icon: BellIcon,
      label: "Notifications",
      value: notifications.sentLast7Days.toLocaleString(),
      footer: `sent this week, ${notifications.unread.toLocaleString()} unread`,
    },
    {
      to: "/changelog",
      icon: PencilLineIcon,
      label: "Changelog",
      value: changelog.drafts.toLocaleString(),
      footer: `${changelog.drafts === 1 ? "draft" : "drafts"} waiting, ${changelog.published.toLocaleString()} published`,
    },
    {
      to: "/admin/feedback",
      icon: MessageSquarePlusIcon,
      label: "Feedback",
      value: feedback.last7Days.toLocaleString(),
      footer: `new this week, ${feedback.total.toLocaleString()} in all`,
    },
  ]

  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4 lg:gap-0">
        {figures.map((figure, index) => (
          <div key={figure.label} className="flex items-start">
            <Link
              to={figure.to}
              className="group/figure -m-2 min-w-0 flex-1 space-y-1 rounded-lg p-2 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <figure.icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate text-xs font-medium sm:text-sm">
                  {figure.label}
                </span>
              </div>
              {/* Mono and tabular so the figures line up across the row and do
                  not jump about as they change. */}
              <p className="font-mono text-2xl leading-tight font-semibold tracking-tight tabular-nums lg:text-[28px]">
                {figure.value}
              </p>
              <p className="text-xs text-muted-foreground">{figure.footer}</p>
            </Link>
            {index < figures.length - 1 ? (
              <div
                className="mx-4 hidden h-full w-px shrink-0 bg-border lg:block xl:mx-6"
                aria-hidden
              />
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// The list cards. Each is a Card with the same flat header row the membership
// charts use — a bordered icon chip, the title, and a link to the full page.

function ListCard({
  icon: Icon,
  title,
  to,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  to: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-0 py-0", className)}>
      <div className="flex min-h-14 items-center justify-between gap-2 border-b px-4 py-2 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40"
            aria-hidden
          >
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <h2 className="text-sm font-medium sm:text-base">{title}</h2>
        </div>
        <Link
          to={to}
          className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          View all
        </Link>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">{children}</div>
    </Card>
  )
}

function EmptyList({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

// ---------------------------------------------------------------------------
// The timeline the notices and activity cards share: events grouped by day
// down a hairline, each with who did it, when, and any detail underneath.

type TimelineEvent = {
  id: string
  /** Whose event this is — the bold start of the line, and the avatar letter. */
  who: string
  /** The rest of the sentence after the name. */
  text: string
  /** A muted second line, when there is something to quote. */
  detail?: string | null
  /** Little grey chips under the line. */
  chips?: string[]
  createdAt: string
}

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
})

/** Events in the order given, grouped under a header per calendar day. */
function groupByDay(events: TimelineEvent[]) {
  const groups: { date: string; events: TimelineEvent[] }[] = []
  for (const event of events) {
    const date = formatDate(event.createdAt)
    const group = groups.at(-1)
    if (group?.date === date) group.events.push(event)
    else groups.push({ date, events: [event] })
  }
  return groups
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="relative flex flex-col gap-4">
      {/* The line runs behind the day dots and the avatars. */}
      <div className="absolute inset-y-2 left-[15px] w-px bg-border" aria-hidden />
      {groupByDay(events).map((group) => (
        <div key={group.date} className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <span
              className="relative z-10 ml-[9px] size-3.5 shrink-0 rounded-full border-2 border-border bg-background"
              aria-hidden
            />
            <span className="text-sm font-semibold">{group.date}</span>
          </div>
          {group.events.map((event) => (
            <div key={event.id} className="flex gap-3">
              <span
                className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-medium text-muted-foreground"
                aria-hidden
              >
                {event.who.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 text-sm">
                    <span className="font-medium">{event.who}</span>{" "}
                    {event.text}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {timeFormatter.format(new Date(event.createdAt))}
                  </span>
                </div>
                {event.detail ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {event.detail}
                  </p>
                ) : null}
                {event.chips?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {event.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function NotificationsCard({
  notifications,
}: {
  notifications: FeedsSummary["notifications"]
}) {
  const events = notifications.latest.map((item): TimelineEvent => {
    const from = item.actor_name ? ` from ${item.actor_name}` : ""
    const text =
      item.type === "feedback_vote"
        ? `got a thumbs up${from} on their feedback`
        : item.type === "feedback_comment"
          ? `got a comment${from} on their feedback`
          : item.type === "announcement"
            ? "got an announcement"
            : "got an update notice"

    return {
      id: item.id,
      who: item.recipient_name,
      text,
      detail:
        item.changelog_title ?? item.announcement_title ?? item.feedback_message,
      chips: item.read_at ? [] : ["Unread"],
      createdAt: item.created_at,
    }
  })

  return (
    <ListCard icon={BellIcon} title="Notifications" to="/admin/notifications">
      {events.length ? (
        <Timeline events={events} />
      ) : (
        <EmptyList>No notices sent yet.</EmptyList>
      )}
    </ListCard>
  )
}

function AnnouncementsCard({
  announcements,
}: {
  announcements: FeedsSummary["announcements"]
}) {
  return (
    <ListCard
      icon={MegaphoneIcon}
      title="Announcements"
      to="/admin/announcements"
    >
      {announcements.latest.length ? (
        <ul className="flex flex-col divide-y">
          {announcements.latest.map((announcement) => (
            <li
              key={announcement.id}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {announcement.title}
              </span>
              <Badge
                variant={
                  announcement.status === "showing" ? "secondary" : "outline"
                }
                className={
                  announcement.status === "ended"
                    ? "text-muted-foreground"
                    : undefined
                }
              >
                {statusLabels[announcement.status]}
              </Badge>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {windowText(announcement)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyList>No announcements yet.</EmptyList>
      )}
    </ListCard>
  )
}

function FeedbackCard({ feedback }: { feedback: FeedsSummary["feedback"] }) {
  return (
    <ListCard
      icon={MessageSquarePlusIcon}
      title="Latest feedback"
      to="/admin/feedback"
    >
      {feedback.latest.length ? (
        <ul className="flex flex-col divide-y">
          {feedback.latest.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span
                className="min-w-0 flex-1 truncate text-sm font-medium"
                title={item.message}
              >
                {item.message}
              </span>
              <Badge
                variant={feedbackTypeBadgeVariants[item.type]}
                className={feedbackTypeClassNames[item.type]}
              >
                {feedbackTypeLabels[item.type]}
              </Badge>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatDate(item.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyList>No feedback yet.</EmptyList>
      )}
    </ListCard>
  )
}

function ChangelogCard({
  changelog,
}: {
  changelog: FeedsSummary["changelog"]
}) {
  return (
    <ListCard icon={PencilLineIcon} title="Latest updates" to="/changelog">
      {changelog.latest.length ? (
        <ul className="flex flex-col divide-y">
          {changelog.latest.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {entry.title}
              </span>
              <Badge variant={entry.publishedAt ? "secondary" : "outline"}>
                {entry.publishedAt ? "Published" : "Draft"}
              </Badge>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatDate(entry.publishedAt ?? entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyList>No updates written yet.</EmptyList>
      )}
    </ListCard>
  )
}

const statusLabels: Record<FeedsSummary["announcements"]["latest"][number]["status"], string> = {
  showing: "Showing",
  scheduled: "Scheduled",
  ended: "Ended",
}

/**
 * The window in words, the way the announcements page says it: dates are whole
 * days, kept in UTC so they never shift.
 */
const windowFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
})

function windowText(announcement: FeedsSummary["announcements"]["latest"][number]) {
  const from = windowFormatter.format(new Date(announcement.startsAt))
  return announcement.endsAt
    ? `${from} – ${windowFormatter.format(new Date(announcement.endsAt))}`
    : `from ${from}`
}
