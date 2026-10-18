import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  BILLING_HISTORY_START,
  SUBSCRIPTION_EVENT_LIMIT,
  describeMemberSubscriptionEvent,
  type MemberSubscriptionEvent,
} from "@/lib/billing/subscription-events"
import { formatDateTime, formatUtcDate } from "@/lib/format/format-time"

/** A compact, member-safe record of plan changes, newest first. */
export function AccountBillingHistoryCard({
  events,
}: {
  events: MemberSubscriptionEvent[]
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle as="h3">Billing history</CardTitle>
        <CardDescription>
          Your plan changes since {formatUtcDate(BILLING_HISTORY_START)}.
          Changes before then were not recorded.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No billing changes have been recorded since then.
          </p>
        ) : (
          <ol className="grid gap-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span className="min-w-0 text-sm">
                  {describeMemberSubscriptionEvent(event)}
                </span>
                <time
                  dateTime={event.createdAt}
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {formatDateTime(event.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
        {events.length === SUBSCRIPTION_EVENT_LIMIT ? (
          <p className="text-xs text-muted-foreground">
            Showing the most recent {SUBSCRIPTION_EVENT_LIMIT} changes. There
            may be older ones.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
