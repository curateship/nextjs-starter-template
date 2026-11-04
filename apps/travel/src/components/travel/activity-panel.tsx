import * as React from "react"
import { SquareMousePointerIcon } from "lucide-react"

import { ActivityMenu } from "@/components/travel/activity-menu"
import { ActivityNotes } from "@/components/travel/activity-notes"
import { BlendedBanner } from "@/components/travel/panel-bits"
import { PhotoCreditLine } from "@/components/travel/unsplash-picker"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { DashboardCardHeader, DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Activity } from "@/lib/api/travel/trips"
import { cn } from "@/lib/utils"

/**
 * The open activity, in the right panel. Only its notes show, in the shell's
 * editor with its toolbar over selected words, as a task's notes do in
 * Project (Tyler, 2 Nov 2026: "The only thing I want to see is the tiptap
 * editor like in project task"). Everything else about it, and Delete, is in
 * the ⋮ menu in the header as folding sections.
 *
 * It has no ×: the first activity opens on arrival and another opens when
 * its card is clicked (UI standard, "The right panel has no × and is never
 * emptied by hand").
 */
export function ActivityPanel({ activityId }: { activityId: string | undefined }) {
  const { page } = useTrip()
  const activity = activityId ? page.activities.find((item) => item.id === activityId) : undefined
  if (!activity) {
    return (
      <>
        <DashboardCardHeader>
          <h2 className="text-sm font-medium">Activity</h2>
        </DashboardCardHeader>
        <div className="grid flex-1 content-center justify-items-center gap-2 p-6 text-center">
          <SquareMousePointerIcon className="size-5 text-muted-foreground" aria-hidden />
          <p className="max-w-56 text-sm text-muted-foreground">
            {page.activities.length === 0
              ? "Add an activity with New activity, then click it to see its details here."
              : "Click an activity to see its details here."}
          </p>
        </div>
      </>
    )
  }
  return <OpenActivity activity={activity} />
}

function OpenActivity({ activity }: { activity: Activity }) {
  const { typesById, readOnly } = useTrip()
  // A picture whose address no longer loads is left out rather than drawn broken.
  const [broken, setBroken] = React.useState<string | null>(null)
  const banner = activity.photoUrl && activity.photoUrl !== broken ? activity.photoUrl : null
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* The picture lies behind the top of the panel, as the trip's cover does on the left (task "Misc"). */}
      {banner ? <BlendedBanner url={banner} onBroken={() => setBroken(banner)} /> : null}
      <DashboardCardTitleHeader
        className={cn("relative", banner && "border-b-transparent")}
        icon={<ActivityTypeIcon type={typeOf(activity, typesById)} />}
        title={activity.title}
        action={readOnly ? undefined : <ActivityMenu activity={activity} />}
      />
      <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-2 p-3">
          <ActivityNotes key={activity.id} activity={activity} />
          {/* A credited picture says whose it is wherever it shows, as its licence asks. */}
          {banner && activity.photoCredit ? <PhotoCreditLine credit={activity.photoCredit} className="px-1" /> : null}
        </div>
      </ScrollArea>
    </div>
  )
}
