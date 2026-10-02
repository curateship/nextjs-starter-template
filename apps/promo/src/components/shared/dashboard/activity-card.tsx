import * as React from "react"
import { BellIcon } from "lucide-react"

import { ActivityFeed } from "@/components/shared/dashboard/activity-feed"
import { dashboardCardTabClassName } from "@/components/shared/dashboard-card-header"
import { CardHeaderRow, FeedCard } from "@/components/shared/feed-card"
import {
  ACTIVITY_VIEWS,
  DEFAULT_ACTIVITY_VIEW,
  type ActivityView,
} from "@/lib/dashboard/activity-filter"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { NotificationItem } from "@/lib/api/notification"

/**
 * One feed for every notification the app has sent. The tabs decide which
 * notices to show.
 */

export function ActivityCard({
  activity,
  className,
}: {
  activity: NotificationItem[]
  className?: string
}) {
  const [view, setView] = React.useState<ActivityView>(DEFAULT_ACTIVITY_VIEW)

  return (
    <FeedCard className={className}>
      <CardHeaderRow icon={BellIcon} title="Activity">
        <Tabs
          value={String(view)}
          onValueChange={(value) => {
            if (value === "today" || value === "unread") {
              setView(value)
              return
            }
            setView(Number(value) as ActivityView)
          }}
        >
          <TabsList>
            {ACTIVITY_VIEWS.map((entry) => (
              <TabsTrigger
                key={entry.value}
                value={String(entry.value)}
                className={dashboardCardTabClassName}
              >
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeaderRow>

      <ActivityFeed items={activity} view={view} />
    </FeedCard>
  )
}
