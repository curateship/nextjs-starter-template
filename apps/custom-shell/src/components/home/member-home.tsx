import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  BellIcon,
  CreditCardIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  ThumbsUpIcon,
} from "lucide-react"

import { useShellRuntime } from "@/components/shell/shell-layout"
import { CardTop, EmptyRow, FeedCard } from "@/components/shared/feed-card"
import { NotificationRow } from "@/components/shared/notification-row"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api/notification"
import type {
  MemberHome as MemberHomeData,
  MemberHomeFeedback,
  MemberHomePlan,
} from "@/lib/api/member-home"
import {
  feedbackStatusClassNames,
  feedbackStatusLabels,
} from "@/lib/feedback-status"
import { feedbackTypeLabels } from "@/lib/feedback-type"
import { focusRingInset } from "@/lib/focus-ring"
import { formatDate } from "@/lib/format-time"
import { notificationAction } from "@/lib/notification-action"
import { planSummary } from "@/lib/plan-summary"
import { plural } from "@/lib/plural"
import { pageGutter } from "@/lib/shell-gutter"
import { cn } from "@/lib/utils"

/**
 * The member's front door: where their plan stands, what has happened since
 * they were last here, and what they have asked us for.
 *
 * Nothing on it is new machinery — the plan is the same entitlement the account
 * window's Billing tab reads, the notices are the same ones the bell shows, and
 * the feedback rows open the same board everybody else uses. It exists because
 * signing in used to land a member on a page with nothing on it.
 */
export function MemberHome({ home }: { home: MemberHomeData }) {
  const runtime = useShellRuntime()
  const router = useRouter()

  // Filing or replying to feedback happens in a window that floats over this
  // page, so the page's own numbers would sit there stale. The shell counts
  // those changes; each one after this page opened asks the route for fresh
  // data. The count it opened with is the mark, not zero — the count belongs to
  // the shell and survives navigation, so anybody who used the feedback window
  // on another page would otherwise arrive here and refetch for nothing.
  const feedbackChanges = runtime.feedbackRefreshToken
  const changesOnArrival = React.useRef(feedbackChanges)
  React.useEffect(() => {
    if (feedbackChanges !== changesOnArrival.current) void router.invalidate()
  }, [feedbackChanges, router])

  const gutter = { gap: pageGutter }

  return (
    // Roughly 55/45 as proportions rather than a pinned width, the same split
    // the admin Overview uses, so the two front doors feel like one app.
    <div
      className="grid shrink-0 items-start xl:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]"
      style={gutter}
    >
      <div className="flex min-w-0 flex-col" style={gutter}>
        <PlanCard plan={home.plan} />
        <FeedbackCard
          items={home.feedback}
          total={home.feedbackTotal}
          onOpenBoard={runtime.onOpenFeedback}
          onOpenThread={runtime.onOpenFeedbackThread}
        />
      </div>

      <div className="flex min-w-0 flex-col" style={gutter}>
        <NotificationsCard
          items={home.notifications}
          unread={home.unreadNotifications}
          onOpenFeedbackThread={runtime.onOpenFeedbackThread}
        />
      </div>
    </div>
  )
}

/**
 * Where their plan stands, in the same words the Billing tab uses, with the one
 * button that can change it. With payments switched off there is nothing to
 * buy, so the card says that instead of offering a button that cannot work.
 */
function PlanCard({ plan }: { plan: MemberHomePlan }) {
  const navigate = useNavigate()

  return (
    <FeedCard>
      <CardTop icon={CreditCardIcon} title="Your plan" />
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={plan.isPaid ? "default" : "secondary"}>
            {plan.planName}
          </Badge>
          {plan.cancelAtPeriodEnd ? (
            <Badge variant="outline">Cancels at period end</Badge>
          ) : null}
          {plan.status === "past_due" ? (
            <Badge variant="destructive">Payment failed</Badge>
          ) : null}
          {plan.source === "manual" ? (
            <Badge variant="outline">Granted by an admin</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{planSummary(plan)}</p>
        {plan.billingEnabled ? (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              void navigate({
                to: ".",
                search: (prev) => ({ ...prev, account: "billing" }),
              })
            }
          >
            {plan.isPaid ? "Manage your plan" : "See the plans"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Payments are turned off right now, so there is nothing to change.
          </p>
        )}
      </div>
    </FeedCard>
  )
}

/**
 * What they have asked us for, newest first, with the votes and replies each
 * one has picked up. Every row opens the same feedback window the board opens,
 * pinned to that item, so a reply is one click from here.
 */
function FeedbackCard({
  items,
  total,
  onOpenBoard,
  onOpenThread,
}: {
  items: MemberHomeFeedback[]
  total: number
  onOpenBoard: () => void
  onOpenThread: (feedbackId: string) => void
}) {
  return (
    <FeedCard>
      <CardTop
        icon={MessageSquarePlusIcon}
        title="Your feedback"
        meta={total ? `${total} ${plural(total, "item")}` : undefined}
        action={
          <Button type="button" variant="outline" onClick={onOpenBoard}>
            Send feedback
          </Button>
        }
      />

      {items.length ? (
        <div className="divide-y">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex w-full flex-col items-start gap-2 px-4 py-3 text-left hover:bg-muted/50 sm:px-5",
                focusRingInset
              )}
              onClick={() => onOpenThread(item.id)}
            >
              <p className="line-clamp-2 text-sm" title={item.message}>
                {item.message}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="font-normal">
                  {feedbackTypeLabels[item.type]}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-normal",
                    feedbackStatusClassNames[item.status]
                  )}
                >
                  {feedbackStatusLabels[item.status]}
                </Badge>
                {/* The icon says what the number counts to anybody who can see
                    it; the word beside it says the same thing to anybody who
                    cannot. */}
                <span className="flex items-center gap-1">
                  <ThumbsUpIcon className="size-3.5" aria-hidden />
                  <span className="tabular-nums">{item.vote_count}</span>
                  <span className="sr-only">
                    {plural(item.vote_count, "vote")}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquareIcon className="size-3.5" aria-hidden />
                  <span className="tabular-nums">{item.comment_count}</span>
                  <span className="sr-only">
                    {item.comment_count === 1 ? "reply" : "replies"}
                  </span>
                </span>
                <span className="tabular-nums">
                  {formatDate(item.created_at)}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyRow>
          You have not sent any feedback yet. Tell us what would make this
          better and it shows up here.
        </EmptyRow>
      )}

      {/* Only when there is more than the rows above, so the strip never
          promises a longer list than the one it opens. */}
      {total > items.length ? (
        <button
          type="button"
          onClick={onOpenBoard}
          className={cn(
            "flex items-center justify-center border-t px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/40 sm:px-5",
            focusRingInset
          )}
        >
          See all your feedback
        </button>
      ) : null}
    </FeedCard>
  )
}

/**
 * The latest notices, read the same way the bell reads them. There is no
 * member notifications page to send anybody to, so the card carries no footer
 * link — the bell holds the rest, and says so when there is more.
 */
function NotificationsCard({
  items,
  unread,
  onOpenFeedbackThread,
}: {
  items: NotificationItem[]
  unread: number
  onOpenFeedbackThread: (feedbackId: string) => void
}) {
  const navigate = useNavigate()
  // Which of these the reader has opened from here. The click is what marks a
  // notice read, and saving that is bookkeeping they never asked for, so it
  // happens behind the click and is never allowed to hold it up. A failed save
  // simply leaves the notice unread the next time the page loads.
  const [readHere, setReadHere] = React.useState<Record<string, string>>({})

  function openNotification(item: NotificationItem) {
    const action = notificationAction(item)

    if (action.kind === "changelog") {
      void navigate({ to: "/changelog/whats-new" })
    } else if (action.kind === "billing") {
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, account: "billing" }),
      })
    } else if (action.kind === "feedback") {
      onOpenFeedbackThread(action.feedbackId)
    }

    if (!item.read_at && !readHere[item.id]) {
      setReadHere((current) => ({
        ...current,
        [item.id]: new Date().toISOString(),
      }))
      void markNotificationRead(item.id)
    }
  }

  return (
    <FeedCard>
      <CardTop
        icon={BellIcon}
        title="Notifications"
        meta={unread ? `${unread} unread` : undefined}
      />

      {items.length ? (
        <div className="flex flex-col gap-1 p-3">
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              item={
                item.read_at || !readHere[item.id]
                  ? item
                  : { ...item, read_at: readHere[item.id]! }
              }
              onClick={() => openNotification(item)}
            />
          ))}
        </div>
      ) : (
        <EmptyRow>
          Nothing yet. Votes and replies on your feedback land here, along with
          announcements and new updates.
        </EmptyRow>
      )}
    </FeedCard>
  )
}
