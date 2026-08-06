import * as React from "react"
import { BellIcon, CheckCircle2Icon, TriangleAlertIcon } from "lucide-react"

import { ActivityFeed } from "@/components/shared/dashboard/activity-card"
import {
  NeedsYouList,
  type NeedsYouItem,
} from "@/components/shared/dashboard/needs-you-card"
import { CardHeaderRow, FeedCard } from "@/components/shared/feed-card"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { UnderlineTab, UnderlineTabsList } from "@/components/ui/underline-tabs"
import type { NotificationItem } from "@/lib/api/notification"

/**
 * What is waiting on you and what has been happening, in one card with a tab
 * each. They were two cards side by side saying much the same thing in two
 * places; one card with Needs you in front puts the things to do first and
 * gives the feed the whole of the column's height.
 *
 * The heading and its icon name whichever tab is showing; the tabs sit on the
 * right of the same row, on the card's hairline. The Activity tab's own
 * All/Unread switch is down on the footer, out of their way.
 */

type InboxTab = "needs-you" | "activity"

export function InboxCard({
  needsYou,
  activity,
  className,
}: {
  needsYou: NeedsYouItem[]
  activity: NotificationItem[]
  className?: string
}) {
  const [tab, setTab] = React.useState<InboxTab>("needs-you")
  const [filter, setFilter] = React.useState<"all" | "unread">("unread")
  const unread = React.useMemo(
    () => activity.filter((item) => !item.read_at).length,
    [activity]
  )

  const onNeedsYou = tab === "needs-you"

  return (
    <FeedCard className={className}>
      <Tabs
        className="flex min-h-0 flex-1 gap-0"
        value={tab}
        onValueChange={(value) => setTab(value as InboxTab)}
      >
        <CardHeaderRow
          icon={
            onNeedsYou
              ? needsYou.length
                ? TriangleAlertIcon
                : CheckCircle2Icon
              : BellIcon
          }
          iconClassName={
            onNeedsYou && needsYou.length
              ? "text-amber-500 dark:text-amber-400"
              : undefined
          }
          title={onNeedsYou ? "Needs you" : "Activity"}
        >
          {/* `-mb-px` so the line under the chosen tab lands on the card's own
              hairline rather than a pixel above it. */}
          <UnderlineTabsList className="-mb-px">
            <UnderlineTab
              value="needs-you"
              label="Needs you"
              count={needsYou.length}
            />
            <UnderlineTab value="activity" label="Activity" />
          </UnderlineTabsList>
        </CardHeaderRow>

        {/* `min-h-0 flex-col` so the list inside can scroll rather than
            stretching the card past the height its column gave it. */}
        <TabsContent value="needs-you" className="flex min-h-0 flex-col">
          <NeedsYouList items={needsYou} />
        </TabsContent>
        <TabsContent value="activity" className="flex min-h-0 flex-col">
          <ActivityFeed
            items={activity}
            filter={filter}
            onFilterChange={setFilter}
            unread={unread}
          />
        </TabsContent>
      </Tabs>
    </FeedCard>
  )
}
