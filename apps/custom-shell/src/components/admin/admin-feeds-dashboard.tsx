import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  BellIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  MegaphoneIcon,
  MessageSquarePlusIcon,
  PencilLineIcon,
  ThumbsUpIcon,
  TriangleAlertIcon,
} from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  FeedsAnnouncementRow,
  FeedsAnnouncementStatus,
  FeedsSummary,
} from "@/lib/api/feeds"
import { feedbackTypeLabels } from "@/lib/feedback-type"
import { focusRing, focusRingInset } from "@/lib/focus-ring"
import {
  formatClockTime,
  formatDate,
  formatTimeAgo,
  formatUtcDate,
} from "@/lib/format-time"
import { pageGutter } from "@/lib/shell-gutter"
import { cn } from "@/lib/utils"

/**
 * The front door for everything the app tells people: announcements, tray
 * notices, the changelog, and the feedback coming back. Every figure is read
 * from the same tables the page it links to reads, so a tile and its page can
 * never disagree.
 *
 * The page opens with what is waiting on somebody, then the week's figures,
 * then the activity as it happened, with the four feeds beside it.
 */

export function AdminFeedsDashboard({ summary }: { summary: FeedsSummary }) {
  const gutter = { gap: pageGutter }

  return (
    // On a wide screen the page fills the window exactly and never scrolls
    // itself: the activity feed and the right-hand stack scroll inside their
    // own boxes instead. Narrow screens stack and scroll the page as usual.
    <div
      className="grid w-full items-start lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:grid-rows-1 lg:items-stretch"
      style={gutter}
    >
      <div className="flex min-w-0 flex-col lg:min-h-0" style={gutter}>
        <NeedsYouCard summary={summary} />
        <ActivityCard summary={summary} />
      </div>
      <ScrollArea className="min-w-0 lg:min-h-0">
        <div className="flex min-w-0 flex-col" style={gutter}>
          <ThisWeekCard summary={summary} />
          <AnnouncementsCard announcements={summary.announcements} />
          <ChangelogCard changelog={summary.changelog} />
          <FeedbackCard feedback={summary.feedback} />
        </div>
      </ScrollArea>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The pieces every card shares: a hairline header row with an icon, a title,
// a quiet count beside it, and whatever belongs on the right. It is built from
// the shared card header parts, so these six titles are the same heading font
// and size as every other admin card rather than a second look.

function FeedCard({ className, ...props }: React.ComponentProps<"div">) {
  return <Card className={cn("min-w-0 gap-0 py-0", className)} {...props} />
}

function CardTop({
  icon: Icon,
  title,
  meta,
  iconClassName,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  meta?: string
  iconClassName?: string
  action?: React.ReactNode
}) {
  return (
    <CardHeader className="min-h-14 items-center border-b pt-4 sm:px-5">
      <CardTitle className="flex min-w-0 items-center gap-2.5">
        <Icon
          className={cn("size-4 shrink-0 text-muted-foreground", iconClassName)}
          aria-hidden
        />
        <span className="truncate">{title}</span>
        {meta ? (
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </CardTitle>
      {action ? <CardAction className="self-center">{action}</CardAction> : null}
    </CardHeader>
  )
}

function ViewAllLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "shrink-0 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline",
        focusRing
      )}
    >
      View all
    </Link>
  )
}

/**
 * A title that opens the thing it names. Every list here links the same way —
 * to the record's own page, with `?open=` so the page opens it on arrival.
 */
const titleLink = cn("min-w-0 truncate rounded-sm hover:underline", focusRing)

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
      {children}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Needs you: the handful of things somebody has to do something about, most
// pressing first. A row only appears while it is true.

type NeedsYouItem = {
  id: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  detail: string
  action: string
  to: string
  /** Set when the row is about one record the page can open on arrival. */
  search?: { open: string }
}

function NeedsYouCard({ summary }: { summary: FeedsSummary }) {
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

  return (
    <FeedCard>
      <CardTop
        icon={items.length ? TriangleAlertIcon : CheckCircle2Icon}
        iconClassName={items.length ? "text-amber-500 dark:text-amber-400" : ""}
        title="Needs you"
        meta={items.length ? `${items.length} ${plural(items.length, "thing")}` : undefined}
      />
      {items.length ? (
        <div className="divide-y">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 sm:px-5"
            >
              {/* The top row is the one to do first, so it carries the colour
                  and the solid button; the rest stay quiet. */}
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground",
                  index === 0 &&
                    "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300"
                )}
                aria-hidden
              >
                <item.icon className="size-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col items-start">
                <Link
                  to={item.to}
                  search={item.search}
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
              <Button asChild variant={index === 0 ? "default" : "outline"}>
                <Link to={item.to} search={item.search}>
                  {item.action}
                </Link>
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyRow>Nothing needs you right now.</EmptyRow>
      )}
    </FeedCard>
  )
}

// ---------------------------------------------------------------------------
// This week: the four figures, in a square, each one a way into its own page.

/**
 * Where each of the four tiles draws its hairlines, per column count: one
 * column, then two, then four. The old `index % 2` baked the two-column
 * assumption into the borders, so a stray edge appeared at any other width.
 */
const weekTileDividers = [
  "border-b @md:border-r @2xl:border-b-0",
  "border-b @2xl:border-r @2xl:border-b-0",
  "border-b @md:border-r @md:border-b-0",
  "",
]

function ThisWeekCard({ summary }: { summary: FeedsSummary }) {
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
      footer: `${plural(changelog.drafts, "draft")} waiting, ${changelog.published.toLocaleString()} published`,
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
    <FeedCard>
      <CardTop
        icon={CalendarDaysIcon}
        title="This week"
        action={
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {rangeText(summary.week.from, summary.week.to)}
          </span>
        }
      />
      {/* The tiles follow the width of the card, not the window: this card
          sits in a narrow right-hand column on a wide screen, so a window
          breakpoint would put four cramped tiles in a 440px box. The wrapper
          carries the container, because `@container` sizes what is *inside* an
          element — on the grid itself, the grid's own column count would be
          measured against its parent instead. */}
      <div className="@container">
        <div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-4">
          {figures.map((figure, index) => (
            <Link
              key={figure.label}
              to={figure.to}
              className={cn(
                "flex min-w-0 flex-col gap-1 p-4 transition-colors hover:bg-accent/40 sm:p-5",
                // Each square runs to the card's edge, so the ring goes inside.
                focusRingInset,
                weekTileDividers[index]
              )}
            >
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <figure.icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{figure.label}</span>
              </span>
              {/* Mono and tabular so the figures line up and do not jump about
                  as they change. */}
              <p className="font-mono text-2xl leading-tight font-semibold tracking-tight tabular-nums sm:text-[28px]">
                {figure.value}
              </p>
              <p className="text-xs text-muted-foreground">{figure.footer}</p>
            </Link>
          ))}
        </div>
      </div>
    </FeedCard>
  )
}

// ---------------------------------------------------------------------------
// Activity: every notice the app has sent, newest first, in days.

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

function toActivityEvent(item: FeedsSummary["notifications"]["latest"][number]) {
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
const dayBuckets = ["Today", "Yesterday", "Earlier this week", "Earlier"] as const

function bucketIndex(date: Date, today: Date) {
  const days = Math.floor(
    (startOfDay(today).getTime() - startOfDay(date).getTime()) / DAY_MS
  )
  if (days <= 0) return 0
  if (days === 1) return 1
  return days < 7 ? 2 : 3
}

function ActivityCard({ summary }: { summary: FeedsSummary }) {
  const [filter, setFilter] = React.useState<"all" | "unread">("all")

  const events = React.useMemo(
    () => summary.notifications.latest.map(toActivityEvent),
    [summary.notifications.latest]
  )
  const unread = events.filter((event) => !event.read)
  const shown = filter === "unread" ? unread : events

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
    // The card takes whatever height is left in the column and the feed scrolls
    // inside it, so the header and the footer link never move.
    <FeedCard className="lg:min-h-0 lg:flex-1">
      <CardTop
        icon={BellIcon}
        title="Activity"
        action={
          <Tabs
            value={filter}
            onValueChange={(value) => setFilter(value as "all" | "unread")}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              {/* The count is what this tab will show, not the whole table's
                  unread figure — a number that did not match the rows under it
                  would be the tray's dishonest bell all over again. */}
              <TabsTrigger value="unread">
                Unread
                {unread.length > 0 ? (
                  <span className="tabular-nums">{unread.length}</span>
                ) : null}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

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
                    {groupDates(group.events)}
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
                        event.read ? "bg-transparent" : "bg-red-500"
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

      <Link
        to="/admin/notifications"
        className={cn(
          "flex items-center justify-center border-t px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/40 sm:px-5",
          // Runs to the card's edge, same as the squares above.
          focusRingInset
        )}
      >
        View all notifications
      </Link>
    </FeedCard>
  )
}

// ---------------------------------------------------------------------------
// The three feed lists down the right.

function AnnouncementsCard({
  announcements,
}: {
  announcements: FeedsSummary["announcements"]
}) {
  return (
    <FeedCard>
      <CardTop
        icon={MegaphoneIcon}
        title="Announcements"
        meta={`${announcements.showingNow.toLocaleString()} showing`}
        action={<ViewAllLink to="/admin/announcements" />}
      />
      {announcements.latest.length ? (
        <ul className="divide-y">
          {announcements.latest.map((announcement) => (
            <li
              key={announcement.id}
              className="flex items-center gap-3 px-4 py-3 sm:px-5"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  announcement.status === "showing"
                    ? "bg-emerald-500 dark:bg-emerald-400"
                    : announcement.status === "scheduled"
                      ? "border border-muted-foreground/60"
                      : "bg-muted-foreground/30"
                )}
                aria-hidden
              />
              <Link
                to="/admin/announcements"
                search={{ open: announcement.id }}
                className={cn(
                  titleLink,
                  "flex-1 text-sm",
                  announcement.status === "ended"
                    ? "text-muted-foreground"
                    : "font-medium"
                )}
                title={announcement.title}
              >
                {announcement.title}
              </Link>
              <span
                className={cn(
                  "shrink-0 text-xs tabular-nums",
                  announcement.status === "ended"
                    ? "text-muted-foreground/70"
                    : "text-muted-foreground"
                )}
              >
                {windowText(announcement)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyRow>No announcements yet.</EmptyRow>
      )}
    </FeedCard>
  )
}

function ChangelogCard({
  changelog,
}: {
  changelog: FeedsSummary["changelog"]
}) {
  return (
    <FeedCard>
      <CardTop
        icon={PencilLineIcon}
        title="Changelog"
        meta={`${changelog.published.toLocaleString()} published`}
        action={<ViewAllLink to="/changelog" />}
      />
      {changelog.latest.length ? (
        <ul className="divide-y">
          {changelog.latest.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 px-4 py-3 sm:px-5"
            >
              <Link
                to="/changelog"
                search={{ open: entry.id }}
                className={cn(titleLink, "flex-1 text-sm font-medium")}
                title={entry.title}
              >
                {entry.title}
              </Link>
              {entry.publishedAt ? (
                <Badge variant="secondary">Published</Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-200"
                >
                  Draft
                </Badge>
              )}
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatDate(entry.publishedAt ?? entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyRow>No updates written yet.</EmptyRow>
      )}
    </FeedCard>
  )
}

function FeedbackCard({ feedback }: { feedback: FeedsSummary["feedback"] }) {
  return (
    <FeedCard>
      <CardTop
        icon={MessageSquarePlusIcon}
        title="Feedback"
        meta="most voted for"
        action={<ViewAllLink to="/admin/feedback" />}
      />
      {feedback.topVoted.length ? (
        <ul className="divide-y">
          {feedback.topVoted.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to="/admin/feedback"
                  search={{ open: item.id }}
                  className={cn(
                    "line-clamp-2 rounded-sm text-sm font-medium hover:underline",
                    focusRing
                  )}
                  title={item.message}
                >
                  {item.message}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  <span
                    className={cn(
                      item.type === "bug_report" && "text-destructive"
                    )}
                  >
                    {feedbackTypeLabels[item.type]}
                  </span>
                  {" · "}
                  {item.authorName}
                  {" · "}
                  {formatDate(item.createdAt)}
                </p>
              </div>
              <span
                className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground tabular-nums"
                title={`${item.votes} ${plural(item.votes, "vote")}`}
              >
                <ThumbsUpIcon className="size-3.5" aria-hidden />
                {item.votes.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyRow>No feedback yet.</EmptyRow>
      )}
    </FeedCard>
  )
}

// ---------------------------------------------------------------------------
// Words and dates.

const DAY_MS = 24 * 60 * 60 * 1000

const RELATIVE_DAYS = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" })

function plural(count: number, word: string) {
  return count === 1 ? word : `${word}s`
}

function startOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function countUnread(events: ActivityEvent[]) {
  return events.filter((event) => !event.read).length
}

/** The one day a group covers, or the days it runs between. */
function groupDates(events: ActivityEvent[]) {
  const newest = formatDate(events[0]!.createdAt)
  const oldest = formatDate(events.at(-1)!.createdAt)
  return newest === oldest ? newest : `${oldest} – ${newest}`
}

/** "Jul 25, 2025 – Aug 1, 2025" — the stretch of days a figure counts over. */
function rangeText(from: string, to: string) {
  return `${formatDate(from)} – ${formatDate(to)}`
}

/** How long the longest-waiting unopened notice has been sitting there. */
function waitedText(oldestUnreadAt: string | null) {
  if (!oldestUnreadAt) return "None waiting"
  const days = Math.floor(
    (startOfDay(new Date()).getTime() -
      startOfDay(new Date(oldestUnreadAt)).getTime()) /
      DAY_MS
  )
  if (days <= 0) return "Oldest arrived today"
  return `Oldest has waited ${days} ${plural(days, "day")}`
}

/** "in 6 days", "tomorrow", "today". */
function untilText(startsAt: string) {
  const days = Math.round(
    (startOfDay(new Date(startsAt)).getTime() -
      startOfDay(new Date()).getTime()) /
      DAY_MS
  )
  return RELATIVE_DAYS.format(days, "day")
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

/** What is left of an announcement's window, in the fewest words. */
function windowText(announcement: {
  status: FeedsAnnouncementStatus
  startsAt: string
  endsAt: string | null
}) {
  if (announcement.status === "scheduled") {
    return `starts ${formatUtcDate(announcement.startsAt)}`
  }
  // Only a window with an end date can have ended, so this always has one.
  if (announcement.status === "ended" && announcement.endsAt) {
    return `ended ${formatUtcDate(announcement.endsAt)}`
  }
  return announcement.endsAt
    ? `ends ${formatUtcDate(announcement.endsAt)}`
    : "no end date"
}
