import {
  ActivityIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  GaugeIcon,
  GitMergeIcon,
  MegaphoneIcon,
  MailWarningIcon,
  MessageSquareIcon,
  SparklesIcon,
  ThumbsUpIcon,
  UserCheckIcon,
  UserRoundCogIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { AppNoticeDetail } from "@/lib/app-options"
import { type NotificationItem } from "@/lib/api/notification"
import {
  aiLimitNotificationText,
  automationApprovalNotificationText,
  carriesItsOwnWords,
  isAiLimitNotification,
} from "@/lib/notification-types"
import { focusRingInset } from "@/lib/layout/focus-ring"
import {
  formatDateTime,
  formatShortTimeAgo,
} from "@/lib/format/format-time"
import { cn } from "@/lib/utils"

/**
 * One notice, written the way the reader's own notices are written — their
 * name for it, their words, and where clicking it goes.
 *
 * Two places show a member their own notices: the bell in the header and the
 * full Notifications page. The row lives here so a notice reads the same in
 * both, and so neither can quietly send a click somewhere the other does not.
 *
 * **The row has four parts, and an app may fill any of them.** A tile on the
 * left saying what kind of thing happened, a heading, a line of figures under
 * it, and the time on the right. The shell writes all four for its own
 * notices; an app that wrote the notice knows better and says so through
 * `detail`, which comes from `AppOptions.notifications.detailsFor`. Nothing
 * here is required, and a notice nobody said anything about looks exactly as
 * every notice looked before `detail` existed.
 */

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?"
}

/**
 * Whether an approval notice is asking for a decision or reporting that nobody
 * made one. A row written before the state was recorded reads as the ask, which
 * is the one of the two that is never wrong to look at.
 */
function approvalState(item: NotificationItem) {
  return item.automation_approval_state ?? "pending"
}

/** Every notice the app sends about itself rather than about a person's doing. */
function isFromTheApp(item: NotificationItem) {
  return (
    item.type === "changelog" ||
    item.type === "announcement" ||
    item.type === "automation_approval" ||
    item.type === "automation_failed" ||
    carriesItsOwnWords(item.type) ||
    isAiLimitNotification(item.type)
  )
}

/**
 * A rounded tile, not a face.
 *
 * Something the app sent — a published update, an announcement, a filled order
 * — gets a square-ish tile with the mark of what it is. Something a person did
 * keeps the round avatar and their initial, because a circle means a human
 * everywhere else in the app and a notice is no place to break that.
 *
 * The tile's colour is the theme's quiet `secondary` unless the app names its
 * own. Only the app that wrote the notice knows whether it is good news, so
 * green for a filled order and amber for a crossed line are the app's call and
 * arrive in `toneClassName`.
 */
export function NotificationTile({
  item,
  detail,
  className,
}: {
  item: NotificationItem
  detail?: AppNoticeDetail
  /** The tile's size and shape, for a row that is not the bell's. */
  className?: string
}) {
  if (!isFromTheApp(item)) {
    return (
      <Avatar size="lg">
        <AvatarFallback>{getInitial(item.actor_name ?? "")}</AvatarFallback>
      </Avatar>
    )
  }

  const AppIcon = detail?.icon
  const failed =
    item.type === "automation_failed" || item.type === "system_email_failed"

  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg",
        detail?.toneClassName ??
          (failed
            ? "bg-destructive text-destructive-foreground"
            : "bg-secondary text-secondary-foreground"),
        className
      )}
    >
      {AppIcon ? (
        <AppIcon className="size-4" />
      ) : (
        <ShellNotificationIcon item={item} className="size-4" />
      )}
    </span>
  )
}

/** The shell's own mark for each kind of notice it writes itself. */
function ShellNotificationIcon({
  item,
  className,
}: {
  item: NotificationItem
  className?: string
}) {
  if (item.type === "changelog") return <SparklesIcon className={className} />
  if (item.type === "announcement") return <MegaphoneIcon className={className} />
  if (item.type === "automation_approval")
    return <UserCheckIcon className={className} />
  if (item.type === "automation_failed")
    return <CircleAlertIcon className={className} />
  if (item.type === "account_update")
    return <UserRoundCogIcon className={className} />
  if (item.type === "system_email_failed")
    return <MailWarningIcon className={className} />
  if (item.type === "app_activity") return <ActivityIcon className={className} />
  if (item.type === "crm_follow_up")
    return <CalendarClockIcon className={className} />
  if (isAiLimitNotification(item.type)) return <GaugeIcon className={className} />
  if (item.type === "feedback_merged")
    return <GitMergeIcon className={className} />
  return item.type === "feedback_vote" ? (
    <ThumbsUpIcon className={className} />
  ) : (
    <MessageSquareIcon className={className} />
  )
}

/** The shell's own heading for a notice, as plain text a screen reader can use. */
function shellHeadingText(item: NotificationItem): string {
  if (carriesItsOwnWords(item.type)) {
    return item.message ?? "The app needs attention"
  }
  if (item.type === "changelog") return "New update shipped"
  if (isAiLimitNotification(item.type)) {
    return aiLimitNotificationText[item.type].message
  }
  if (item.type === "announcement") return item.announcement_title ?? ""
  if (item.type === "automation_approval" || item.type === "automation_failed") {
    return item.automation_name?.replace(/\s*—\s*/g, " ") ?? ""
  }
  const who = item.actor_name ?? "Somebody"
  if (item.type === "feedback_vote") return `${who} gave your feedback a thumbs up`
  if (item.type === "feedback_merged") {
    return `${who} merged your feedback into another item`
  }
  return `${who} commented on your feedback`
}

/** Everything a notice has to say underneath its heading, whole. */
function notificationText(item: NotificationItem) {
  const approvalText = automationApprovalNotificationText[approvalState(item)]
  const approvalSummary = item.automation_approval_summary?.trim()
  const text =
    carriesItsOwnWords(item.type)
      ? (item.detail ?? "")
      : item.type === "changelog"
        ? (item.changelog_title ?? "")
        : item.type === "announcement"
          ? (item.announcement_body ?? "")
          : item.type === "automation_approval"
            ? approvalSummary
              ? `${approvalText.message}. ${approvalSummary}`
              : approvalText.detail
            : item.type === "automation_failed"
              ? `${item.automation_failure_node_name ?? "Unknown step"}: ${item.automation_failure_error ?? "The step stopped without explaining why."}`
              : isAiLimitNotification(item.type)
                ? aiLimitNotificationText[item.type].detail
                : (item.feedback_message ?? "")

  return text
}

/**
 * The same words cut to fit the two lines a row gives them.
 *
 * **The row hands the whole thing to `title` as well.** The cut happens here,
 * in JavaScript, not in the `line-clamp` underneath it, so a reader who wants
 * the rest has nowhere else to get it: a trade notice that ends "which bought
 * these coins at..." has stopped saying the thing it was written to say.
 * Tyler, 3 October 2026: "Hovering over the notificattion should show me all
 * the text".
 */
function notificationPreview(item: NotificationItem) {
  const text = notificationText(item)
  return text.length > 90 ? `${text.slice(0, 90)}...` : text
}

export function NotificationRow({
  item,
  detail,
  onClick,
}: {
  item: NotificationItem
  /** What the app that wrote this notice says about it, when it wrote it. */
  detail?: AppNoticeDetail
  onClick: () => void
}) {
  const heading = detail?.title ?? shellHeadingText(item)
  const meta = detail?.meta ?? []
  // An empty string is the app saying "the figures above already say it".
  // Leaving the field out is the app saying nothing, so the shell's own
  // sentence stands.
  const body = detail?.body ?? notificationPreview(item)
  const unread = !item.read_at

  // One tooltip for the whole row, carrying every word of it and the exact
  // moment. It has to live on the row rather than on the lines inside it: the
  // click target below is laid over those lines, so a tooltip on any of them
  // would never be the one the pointer is over. Tyler, 3 October 2026:
  // "Hovering over the notificattion should show me all the text".
  //
  // **The sentence is always in here, even when the row does not draw it.** An
  // app that fills the figures sets `body` to an empty string, because "filled"
  // and "made $8.12" are already above — but the sentence they came from often
  // says more than they do, and a grid sale's "measured against rung 2, which
  // bought these coins at $0.9" has nowhere else to be read. So the empty
  // string hides the line and never the words.
  const wholeRowText = [
    heading,
    meta.join(" · "),
    detail?.body || notificationText(item),
    formatDateTime(item.created_at),
  ]
    .filter(Boolean)
    .join("\n")

  return (
    // The whole row is one click target, drawn as a button laid over it rather
    // than wrapped around it, so the lines inside it stay plain text.
    <div
      title={wholeRowText}
      className={cn(
        "relative grid grid-cols-[2.5rem_1fr_auto] gap-3 rounded-lg p-3 transition-colors",
        unread ? "bg-muted/50" : "bg-transparent",
        "hover:bg-muted"
      )}
    >
      <NotificationTile item={item} detail={detail} />

      <div className="min-w-0 space-y-1">
        <p className="text-sm leading-snug font-semibold text-foreground">
          {heading}
        </p>

        {meta.length > 0 ? (
          // Fixed-width figures, so the price sits in the same place on every
          // row and a column of fills can be read straight down.
          <p className="truncate font-mono text-xs text-muted-foreground tabular-nums">
            {meta.join(" · ")}
          </p>
        ) : null}

        {body ? (
          // Cut to fit here, whole in the row's own tooltip above.
          <p className="line-clamp-2 text-xs text-muted-foreground">{body}</p>
        ) : null}

      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {/* The exact moment is in the row's tooltip; the stamp itself answers
            the only question a list of notices gets asked, which is how long
            ago this happened. */}
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {formatShortTimeAgo(item.created_at)}
        </span>
        {unread ? (
          // Red, which is the theme's own `destructive` and the same colour as
          // the count on the bell. Tyler, 4 October 2026.
          <span
            aria-hidden
            className="block size-2 shrink-0 rounded-full bg-destructive"
          />
        ) : null}
      </div>

      {/* Last in the order a screen reader reads, so the words come first and
          the control that opens them comes after, named by its heading. */}
      <button
        type="button"
        aria-label={`Open: ${heading}`}
        className={cn("absolute inset-0 rounded-lg", focusRingInset)}
        onClick={onClick}
      />
    </div>
  )
}
