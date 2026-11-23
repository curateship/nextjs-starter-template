import * as React from "react"
import { BellIcon } from "lucide-react"

import { ActivityFeed } from "@/components/shared/dashboard/activity-feed"
import { dashboardCardTabClassName } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { CardHeaderRow, FeedCard } from "@/components/shared/feed-card"
import {
  ACTIVITY_VIEWS,
  DEFAULT_ACTIVITY_VIEW,
  type ActivityView,
} from "@/lib/dashboard/activity-filter"
import type { NotificationItem } from "@/lib/api/notification"

/**
 * One feed for every notification the app has sent. The tabs decide which
 * notices to show, drawn the way Settings → Styling → Dashboard tabs says.
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
        <DashboardTabs
          value={String(view)}
          onValueChange={(value) => {
            if (value === "today" || value === "unread") {
              setView(value)
              return
            }
            setView(Number(value) as ActivityView)
          }}
          tabs={ACTIVITY_VIEWS.map((entry) => ({
            value: String(entry.value),
            label: entry.label,
          }))}
          tabClassName={dashboardCardTabClassName}
        />
      </CardHeaderRow>

      <ActivityFeed items={activity} view={view} />
    </FeedCard>
  )
}
