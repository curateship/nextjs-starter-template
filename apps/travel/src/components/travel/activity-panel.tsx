import * as React from "react"
import { Link } from "@tanstack/react-router"
import { CheckIcon, CircleCheckIcon, CircleIcon, HistoryIcon, SquareMousePointerIcon } from "lucide-react"

import { ActivityMenu } from "@/components/travel/activity-menu"
import { ActivityNotes } from "@/components/travel/activity-notes"
import { useBoardActions } from "@/components/travel/board-actions"
import { ActivityPhotosRow } from "@/components/travel/activity-photos-row"
import { BlendedBanner } from "@/components/travel/panel-bits"
import { PhotoCreditLine } from "@/components/travel/unsplash-picker"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { DashboardCardHeader, DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Activity } from "@/lib/api/travel/trips"
import { beenHereText } from "@/lib/travel/been-here"
import { PANEL_FOOTER_PADDING, PANEL_GUTTER } from "@/lib/travel/panel-gutter"
import { cn } from "@/lib/utils"

/**
 * The open activity, in the right panel. Only its notes show, in the shell's
 * editor with its toolbar over selected words, as a task's notes do in
 * Project (Tyler, 2 Nov 2026: "The only thing I want to see is the tiptap
 * editor like in project task"). Everything else about it, and Delete, is in
 * the ⋮ menu in the header as grouped rows, and Done is in the footer.
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
  // Bumped when the notes change from outside the editor, such as AI tips, so the editor reads them again.
  const [notesRound, setNotesRound] = React.useState(0)
  const banner = activity.photoUrl && activity.photoUrl !== broken ? activity.photoUrl : null
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* The picture lies behind the top of the panel, as the trip's cover does on the left (task "Misc"). */}
      {banner ? <BlendedBanner url={banner} onBroken={() => setBroken(banner)} /> : null}
      <DashboardCardTitleHeader
        className={cn("relative", banner && "border-b-transparent")}
        icon={<ActivityTypeIcon type={typeOf(activity, typesById)} />}
        title={activity.title}
        action={readOnly ? undefined : <ActivityMenu activity={activity} onNotesChanged={() => setNotesRound((was) => was + 1)} />}
      />
      <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
        <div data-side-panel-body="" className={cn("grid grid-cols-[minmax(0,1fr)]", PANEL_GUTTER)}>
          <ActivityPhotosRow activity={activity} />
          <BeenHereLine activityId={activity.id} />
          <ActivityNotes key={`${activity.id}:${notesRound}`} activity={activity} />
          {/* A credited picture says whose it is wherever it shows, as its licence asks. */}
          {banner && activity.photoCredit ? <PhotoCreditLine credit={activity.photoCredit} className="px-1" /> : null}
        </div>
      </ScrollArea>
      {readOnly ? null : <ActivityFooter activity={activity} />}
    </div>
  )
}

/**
 * The open activity's footer, pinned to the panel's bottom with a line above
 * it, as Project's task footer is (the Admin 3 panel design, 6 Nov 2026): the
 * activity's state on the left, and the one way to change it on the right.
 * Done is the only state an activity has, since bookings went on 2 Nov 2026.
 */
function ActivityFooter({ activity }: { activity: Activity }) {
  const actions = useBoardActions()
  return (
    <div className={cn("flex shrink-0 flex-wrap items-center gap-2 border-t", PANEL_FOOTER_PADDING)}>
      <span className={cn("flex items-center gap-1.5 text-sm", !activity.done && "text-muted-foreground")}>
        {activity.done ? <CircleCheckIcon className="size-4" aria-hidden /> : <CircleIcon className="size-4" aria-hidden />}
        {activity.done ? "Done" : "Not done yet"}
      </span>
      <Button
        type="button"
        variant={activity.done ? "outline" : "default"}
        className="ml-auto"
        disabled={actions.busy}
        onClick={() => void actions.setField(activity, { done: !activity.done })}
      >
        {activity.done ? null : <CheckIcon className="size-4" />}
        {activity.done ? "Mark not done" : "Mark done"}
      </Button>
    </div>
  )
}

/**
 * "Been here: Kyoto, March 2026, you gave it 2 of 5" (Travel features 3, part
 * 10), when this card's place was done on another trip. The trip's name opens
 * that visit.
 */
function BeenHereLine({ activityId }: { activityId: string }) {
  const { page } = useTrip()
  const visit = page.beenHere.find((each) => each.activityId === activityId)
  if (!visit) return null
  const [, rest] = beenHereText(visit).split(`Been here: ${visit.tripName}`)
  return (
    <p className="flex items-start gap-2 px-1 text-sm text-muted-foreground">
      <HistoryIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        Been here:{" "}
        <Link
          to="/trips/$tripId"
          params={{ tripId: visit.tripId }}
          search={{ open: visit.visitId }}
          className="underline underline-offset-2 hover:text-foreground"
        >
          {visit.tripName}
        </Link>
        {rest}
      </span>
    </p>
  )
}
