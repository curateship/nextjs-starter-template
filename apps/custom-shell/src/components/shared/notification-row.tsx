import {
  CircleAlertIcon,
  GaugeIcon,
  GitMergeIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  SparklesIcon,
  ThumbsUpIcon,
  UserCheckIcon,
  UserRoundCogIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { type NotificationItem } from "@/lib/api/notification"
import {
  aiLimitNotificationText,
  automationApprovalNotificationText,
  isAiLimitNotification,
} from "@/lib/notification-types"
import { focusRing } from "@/lib/layout/focus-ring"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { cn } from "@/lib/utils"

/**
 * One notice, written the way the reader's own notices are written — their
 * name for it, their words, and where clicking it goes.
 *
 * Two places show a member their own notices: the bell in the header and the
 * home page's notifications card. The row lives here so a notice reads the
 * same in both, and so neither can quietly send a click somewhere the other
 * does not.
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
    item.type === "account_update" ||
    isAiLimitNotification(item.type)
  )
}

/**
 * Two circles, not five colours.
 *
 * Something the app sent — a published update or an announcement — wears the
 * theme's secondary colour and the mark of what it is. Something a person did
 * keeps the plain avatar circle and their initial. Which kind of thing a person
 * did (a thumbs up or a reply) is never told by colour: the row beside it
 * carries its own icon and says so in words.
 */
function NotificationAvatar({ item }: { item: NotificationItem }) {
  if (isFromTheApp(item)) {
    return (
      <Avatar size="lg">
        <AvatarFallback
          className={cn(
            "bg-secondary text-secondary-foreground",
            item.type === "automation_failed" &&
              "text-destructive-foreground bg-destructive"
          )}
        >
          {item.type === "changelog" ? (
            <SparklesIcon className="h-4 w-4" />
          ) : item.type === "announcement" ? (
            <MegaphoneIcon className="h-4 w-4" />
          ) : item.type === "automation_approval" ? (
            <UserCheckIcon className="h-4 w-4" />
          ) : item.type === "automation_failed" ? (
            <CircleAlertIcon className="h-4 w-4" />
          ) : item.type === "account_update" ? (
            <UserRoundCogIcon className="h-4 w-4" />
          ) : (
            <GaugeIcon className="h-4 w-4" />
          )}
        </AvatarFallback>
      </Avatar>
    )
  }

  return (
    <Avatar size="lg">
      <AvatarFallback>{getInitial(item.actor_name ?? "")}</AvatarFallback>
    </Avatar>
  )
}

function NotificationMessage({ item }: { item: NotificationItem }) {
  if (item.type === "account_update") {
    return <strong>{item.message ?? "Your account was updated"}</strong>
  }
  if (item.type === "changelog") {
    return <>New update shipped</>
  }

  // About the reader's own account, so like an announcement it carries its
  // own words rather than pointing at a thing to open.
  if (isAiLimitNotification(item.type)) {
    return <strong>{aiLimitNotificationText[item.type].message}</strong>
  }

  // An announcement has nowhere to be opened, so its own words go here rather
  // than a stock line that would send the reader looking for a link.
  if (item.type === "announcement") {
    return <strong>{item.announcement_title}</strong>
  }

  // The flow's name is the useful half — "Weekly changelog email" says more
  // about what is waiting than the word "approval" ever could.
  if (item.type === "automation_approval") {
    return <strong>{item.automation_name?.replace(/\s*—\s*/g, " ")}</strong>
  }
  if (item.type === "automation_failed") {
    return <strong>{item.automation_name?.replace(/\s*—\s*/g, " ")}</strong>
  }

  if (item.type === "feedback_vote") {
    return (
      <>
        <strong>{item.actor_name}</strong> gave your feedback a thumbs up
      </>
    )
  }

  // The reader's item was folded into another one; the line below quotes the
  // surviving item, and clicking opens it.
  if (item.type === "feedback_merged") {
    return (
      <>
        <strong>{item.actor_name}</strong> merged your feedback into another
        item
      </>
    )
  }

  return (
    <>
      <strong>{item.actor_name}</strong> commented on your feedback
    </>
  )
}

function NotificationIcon({ item }: { item: NotificationItem }) {
  if (item.type === "account_update") {
    return <UserRoundCogIcon className="h-3.5 w-3.5" />
  }
  if (item.type === "changelog") {
    return <SparklesIcon className="h-3.5 w-3.5" />
  }
  if (item.type === "announcement") {
    return <MegaphoneIcon className="h-3.5 w-3.5" />
  }
  if (isAiLimitNotification(item.type)) {
    return <GaugeIcon className="h-3.5 w-3.5" />
  }
  if (item.type === "automation_approval") {
    return <UserCheckIcon className="h-3.5 w-3.5" />
  }
  if (item.type === "automation_failed") {
    return <CircleAlertIcon className="h-3.5 w-3.5" />
  }
  if (item.type === "feedback_merged") {
    return <GitMergeIcon className="h-3.5 w-3.5" />
  }

  return item.type === "feedback_vote" ? (
    <ThumbsUpIcon className="h-3.5 w-3.5" />
  ) : (
    <MessageSquareIcon className="h-3.5 w-3.5" />
  )
}

/**
 * The line under the message: the update's title, the announcement's own words,
 * or the feedback it is about.
 */
function notificationPreview(item: NotificationItem) {
  const approvalText = automationApprovalNotificationText[approvalState(item)]
  const approvalSummary = item.automation_approval_summary?.trim()
  const text =
    item.type === "account_update"
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

  return text.length > 90 ? `${text.slice(0, 90)}...` : text
}

export function NotificationRow({
  item,
  onClick,
}: {
  item: NotificationItem
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid w-full grid-cols-[0.25rem_3rem_1fr] gap-2 rounded-md p-2 text-left hover:bg-muted/60",
        focusRing
      )}
      onClick={onClick}
    >
      <div className="pt-5">
        {!item.read_at ? (
          <span className="block size-2 rounded-full bg-destructive" />
        ) : null}
      </div>
      <NotificationAvatar item={item} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm leading-snug text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          <NotificationIcon item={item} />
          <span>
            <NotificationMessage item={item} />
          </span>
        </p>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {notificationPreview(item)}
        </p>
        {/* The exact moment is one hover away; the line itself answers the only
            question a list of notices gets asked, which is how long ago this
            happened. */}
        <p
          className="mt-1 text-xs text-muted-foreground"
          title={formatDateTime(item.created_at)}
        >
          {formatRelativeTime(item.created_at, formatDateTime)}
        </p>
      </div>
    </button>
  )
}
