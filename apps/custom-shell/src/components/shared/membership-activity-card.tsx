import { HistoryIcon } from "lucide-react"

import { CardTop, EmptyRow, FeedCard } from "@/components/shared/feed-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { MembershipActivityItem } from "@/lib/api/membership"
import { formatDate, formatTimeAgo } from "@/lib/format-time"
import { plural } from "@/lib/plural"
import {
  BILLING_HISTORY_START,
  describeSubscriptionEvent,
} from "@/lib/subscription-events"
import { cn } from "@/lib/utils"

/**
 * What has happened to people's memberships lately: somebody joined, started a
 * trial, switched plan, had a payment fail.
 *
 * It is deliberately not the Overview's activity card. That one reads the
 * notifications table — what the app has been telling people — and needs tabs
 * for opened and unopened, and a photo for whoever did it. This one reads the
 * billing history, where nothing is ever opened and nobody did it on purpose,
 * so it is a plain timeline: when, who, what. One glance should be enough to
 * tell the two cards apart.
 */
export function MembershipActivityCard({
  items,
  className,
}: {
  items: MembershipActivityItem[]
  className?: string
}) {
  return (
    <FeedCard className={className}>
      <CardTop
        icon={HistoryIcon}
        title="Member activity"
        meta={
          items.length
            ? `${items.length} ${plural(items.length, "event")}`
            : undefined
        }
      />
      {items.length ? (
        <>
          {/* The timeline is the longest thing on this page by far, so it takes
              whatever height the column has left and scrolls inside it — the
              header and the note underneath never move. `min-h-0` is what lets
              it shrink below the length of the list; without it a flex child
              refuses to go under its content and the page scrolls instead. */}
          <ScrollArea className="min-h-0 flex-1">
            <ol className="flex flex-col px-4 py-4 sm:px-5">
              {items.map((item, index) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  last={index === items.length - 1}
                />
              ))}
            </ol>
          </ScrollArea>
          {/* Said out loud, because a short list here can mean a quiet month or
              it can mean the app only started writing this down recently. */}
          <p className="border-t px-4 py-3 text-xs text-muted-foreground sm:px-5">
            Signups go back as far as the accounts do. Billing history only goes
            back to {formatDate(BILLING_HISTORY_START)}, when this app started
            keeping it.
          </p>
        </>
      ) : (
        <EmptyRow>Nothing has happened to anybody's membership yet.</EmptyRow>
      )}
    </FeedCard>
  )
}

/**
 * One row on the rail. The dot and the line are drawn rather than bordered so
 * the last row's line can stop at the dot instead of running off the bottom.
 */
function ActivityRow({
  item,
  last,
}: {
  item: MembershipActivityItem
  last: boolean
}) {
  return (
    <li className="flex gap-3">
      <div className="flex w-4 shrink-0 flex-col items-center">
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40"
          aria-hidden
        />
        {last ? null : <span className="w-px flex-1 bg-border" aria-hidden />}
      </div>
      <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-4")}>
        <p className="truncate text-sm" title={item.personName}>
          <span className="font-medium">{item.personName}</span>
        </p>
        <p className="text-xs text-muted-foreground">{sentenceOf(item)}</p>
        <p className="text-[10px] text-muted-foreground/80 sm:text-xs">
          {formatTimeAgo(item.createdAt)}
        </p>
      </div>
    </li>
  )
}

/**
 * The sentence for one row. Signups are worded here because they are not a
 * billing event and `describeSubscriptionEvent` has never heard of them.
 */
function sentenceOf(item: MembershipActivityItem) {
  if (item.kind === "joined") return "Joined."
  return describeSubscriptionEvent({
    kind: item.kind,
    planName: item.planName,
    detail: item.detail,
    source: item.source === "admin" ? "admin" : "stripe",
  })
}
