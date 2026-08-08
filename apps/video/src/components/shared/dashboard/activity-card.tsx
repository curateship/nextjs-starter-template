import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { BellIcon, TriangleAlertIcon } from "lucide-react"

import { ActivityFeed } from "@/components/shared/dashboard/activity-feed"
import { CardHeaderRow, FeedCard } from "@/components/shared/feed-card"
import {
  ACTIVITY_FILTERS,
  ACTIVITY_RANGES,
  DEFAULT_ACTIVITY_FILTER,
  DEFAULT_ACTIVITY_RANGE,
  showsUrgent,
  type ActivityFilter,
  type ActivityRange,
} from "@/lib/dashboard/activity-filter"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs } from "@/components/ui/tabs"
import { UnderlineTab, UnderlineTabsList } from "@/components/ui/underline-tabs"
import {
  getDismissUrgentErrorMessage,
  saveDismissedUrgent,
} from "@/lib/api/admin-overview"
import type { NotificationItem } from "@/lib/api/notification"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import {
  keepUndismissedUrgent,
  keepUrgentInRange,
  urgentDismissKey,
  type UrgentItem,
} from "@/lib/dashboard/urgent-items"

/**
 * One feed for everything the app has to say, and two controls that decide
 * what is on it.
 *
 * It was two cards, then one card with a "Needs you" tab in front of an
 * "Activity" tab — which was still two lists saying much the same thing, and
 * the things waiting on somebody were hidden behind a tab click. Now they are
 * simply the top of the feed, under the word "Urgent", and the dropdown opens
 * on them.
 *
 * The dropdown says what kind of thing to show; the two tabs say how far back
 * to go. Both controls act on both halves of the feed — an urgent row carries
 * the day it started wherever the app records one, so it is cut by the tabs the
 * same way a notice is. The handful of rows nothing records a date for say so
 * on the row and always show; see `UrgentItem.since`.
 *
 * Which urgent rows survive is settled here rather than in the feed, so the
 * warning triangle in the heading and the rows under it can never disagree.
 */

export function ActivityCard({
  urgent,
  dismissedUrgent,
  activity,
  className,
}: {
  /** Every urgent row the page worked out, dismissed ones included. */
  urgent: UrgentItem[]
  /** The keys of the ones this admin has waved off, as last saved. */
  dismissedUrgent: string[]
  activity: NotificationItem[]
  className?: string
}) {
  const router = useRouter()
  const [filter, setFilter] = React.useState<ActivityFilter>(
    DEFAULT_ACTIVITY_FILTER
  )
  const [range, setRange] = React.useState<ActivityRange>(
    DEFAULT_ACTIVITY_RANGE
  )
  const [run] = useAsyncAction(getDismissUrgentErrorMessage)

  /**
   * What is showing right now. The saved list is the page's, so it is held
   * here as well: the row has to go the moment it is waved off, and waiting
   * for the whole dashboard to load again to find out would leave it sitting
   * there under the cursor.
   */
  const [dismissed, setDismissed] = React.useState(dismissedUrgent)

  /**
   * The dashboard loading a different saved list wins — a second tab, or the
   * round trip below finishing.
   *
   * Compared by its contents rather than by the array, because a re-render
   * that hands over the same keys in a new array must not throw away a
   * dismissal that has not been written yet. Adjusted while rendering rather
   * than in an effect: this is React's own way to reset state when a prop
   * changes, and an effect would draw the stale rows once before fixing them.
   */
  const savedKeys = dismissedUrgent.join("\n")
  const [lastSavedKeys, setLastSavedKeys] = React.useState(savedKeys)
  if (savedKeys !== lastSavedKeys) {
    setLastSavedKeys(savedKeys)
    setDismissed(dismissedUrgent)
  }

  // One `now` for the whole render, so the heading and the rows are judged
  // against the same moment.
  const shownUrgent = showsUrgent(filter)
    ? keepUrgentInRange(
        keepUndismissedUrgent(urgent, dismissed),
        range,
        new Date()
      )
    : []

  /**
   * Puts one row away, and offers to bring it straight back.
   *
   * The undo is the whole reason this is a plain toast and not a confirmation:
   * nothing is destroyed, so asking first would be a question about nothing —
   * but the X sits beside the button that opens the row, so a misclick has to
   * cost nothing either.
   */
  async function dismiss(item: UrgentItem) {
    const before = dismissed
    const after = [...before, urgentDismissKey(item)]
    setDismissed(after)

    const saved = await run(() => saveDismissedUrgent(after))
    if (!saved) {
      // The save failed and the toast says so, so the row goes back where it
      // was rather than looking put away until the next page load.
      setDismissed(before)
      return
    }

    void router.invalidate()
    toast.success("Put away.", {
      action: {
        label: "Bring it back",
        onClick: () => {
          setDismissed(before)
          void run(() => saveDismissedUrgent(before)).then((restored) => {
            if (restored) void router.invalidate()
            else setDismissed(after)
          })
        },
      },
    })
  }

  return (
    <FeedCard className={className}>
      {/* The icon reads the feed, not the dropdown: a triangle whenever
          something is waiting on somebody and it is on screen to be seen. */}
      <CardHeaderRow
        icon={shownUrgent.length ? TriangleAlertIcon : BellIcon}
        iconClassName={
          shownUrgent.length ? "text-amber-500 dark:text-amber-400" : undefined
        }
        title="Activity"
      >
        {/* `items-stretch` so the underline tabs get the row's full height and
            their line can meet the card's hairline. The dropdown is centred
            inside it on its own. */}
        <div className="flex items-stretch gap-3">
          <div className="flex items-center">
            <Select
              value={filter}
              onValueChange={(value) => setFilter(value as ActivityFilter)}
            >
              <SelectTrigger
                className="h-8 w-fit text-sm"
                aria-label="Filter by type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_FILTERS.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* On every setting, Urgent included: an urgent row carries the day
              it started wherever the app records one, so these cut it the same
              way they cut a notice. The rows nothing records a date for are
              the exception, and they say so on the row itself. */}
          <Tabs
            className="h-full"
            value={String(range)}
            onValueChange={(value) => setRange(Number(value) as ActivityRange)}
          >
            {/* `-mb-px` so the line under the chosen tab lands on the card's
                own hairline rather than a pixel above it. */}
            <UnderlineTabsList className="-mb-px">
              {ACTIVITY_RANGES.map((entry) => (
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

      <ActivityFeed
        urgent={shownUrgent}
        items={activity}
        filter={filter}
        range={range}
        onDismissUrgent={(item) => void dismiss(item)}
      />
    </FeedCard>
  )
}
