import * as React from "react"
import { BellIcon } from "lucide-react"

import { ActivityFeed } from "@/components/shared/dashboard/activity-feed"
import { CardHeaderRow, FeedCard } from "@/components/shared/feed-card"
import {
  ACTIVITY_VIEWS,
  DEFAULT_ACTIVITY_VIEW,
  type ActivityView,
} from "@/lib/dashboard/activity-filter"
import { Tabs } from "@/components/ui/tabs"
import { UnderlineTab, UnderlineTabsList } from "@/components/ui/underline-tabs"
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
        <div className="flex items-stretch">
          <Tabs
            className="h-full"
            value={String(view)}
            onValueChange={(value) => {
              if (value === "unread") {
                setView(value)
                return
              }
              setView(Number(value) as ActivityView)
            }}
          >
            {/* `-mb-px` so the line under the chosen tab lands on the card's
                own hairline rather than a pixel above it. */}
            <UnderlineTabsList className="-mb-px">
              {ACTIVITY_VIEWS.map((entry) => (
                <UnderlineTab
                  key={entry.value}
                  value={String(entry.value)}
                  label={entry.label}
                />
              ))}
            </UnderlineTabsList>
          </Tabs>
        </div>
      </CardHeaderRow>

      <ActivityFeed items={activity} view={view} />
    </FeedCard>
  )
}
