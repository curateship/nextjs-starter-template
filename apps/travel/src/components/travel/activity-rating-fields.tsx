import { BookmarkPlusIcon, Loader2Icon, StarIcon } from "lucide-react"

import { useSaveActivity } from "@/components/travel/use-save-activity"
import { useTrip } from "@/components/travel/trip-context"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { saveAsPlace } from "@/lib/api/travel/saved-places"
import type { Activity } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dayHasPassed } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { cn } from "@/lib/utils"

/** Whether an activity can be rated yet: it's marked Done, or its day is over (task part 26). */
export function canRate(activity: Activity, trip: { startDate: string | null; timeZone: string | null }) {
  return activity.done || (activity.day !== null && dayHasPassed(trip, activity.day))
}

/**
 * Stars and "Would go again" for an activity that's done (task part 26), and
 * a one-press "Save to saved places" (task part 41) so a good one can come
 * on the next trip. Pressing the star already set clears the rating.
 */
export function ActivityRatingFields({ activity }: { activity: Activity }) {
  const [save] = useSaveActivity(activity.id)
  const { page } = useTrip()
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const idBase = `activity-${activity.id}`
  if (!canRate(activity, page.trip)) return null

  return (
      <div className="grid gap-3">
        <div className="flex items-center gap-0.5" role="group" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((stars) => (
            <Button
              key={stars}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`${stars} of 5`}
              aria-pressed={activity.rating === stars}
              onClick={() => void save({ rating: activity.rating === stars ? null : stars })}
            >
              <StarIcon
                className={cn(
                  "size-5",
                  activity.rating !== null && stars <= activity.rating
                    ? "fill-amber-400 text-amber-500"
                    : "text-muted-foreground"
                )}
              />
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${idBase}-again`}
            checked={activity.goAgain}
            onCheckedChange={(checked) => void save({ goAgain: checked === true })}
          />
          <Label htmlFor={`${idBase}-again`}>Would go again</Label>
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void run(() => saveAsPlace(activity.id))}
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <BookmarkPlusIcon className="size-4" />}
            Save to saved places
          </Button>
        </div>
      </div>
  )
}
