import * as React from "react"
import { StarIcon } from "lucide-react"

import { dayLabel } from "@/components/travel/new-activity"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { saveActivity } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { boardColumns } from "@/lib/travel/board"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { cn } from "@/lib/utils"

/**
 * Rate the trip, from the trip's ⋮ menu only (Travel features 3, part 11;
 * Tyler, 5 Nov 2026: "Only from the menu"). It walks through every card
 * marked Done that has no rating yet, one at a time, in the board's order:
 * stars, Would go again, then Next, Skip or Back. Each pick saves at once.
 * The cards are the ones unrated when it opened, so a card just rated stays
 * in the walk to come back to.
 */
export function RateTripDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { page, typesById, refresh } = useTrip()
  const { trip } = page
  const [ids, setIds] = React.useState<string[]>([])
  const [at, setAt] = React.useState(0)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      const columns = [...boardColumns(trip.days, page.activities).entries()]
      setIds(
        [...columns.slice(1), columns[0]]
          .flatMap(([, cards]) => cards)
          .filter((card) => card.done && card.rating === null)
          .map((card) => card.id)
      )
      setAt(0)
    }
  }

  const card = page.activities.find((activity) => activity.id === ids[at])
  const finished = at >= ids.length

  function save(patch: { rating?: number | null; goAgain?: boolean }) {
    if (!card) return
    void run(async () => {
      await saveActivity({ activityId: card.id, ...patch })
      await refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rate the trip</DialogTitle>
          <DialogDescription>
            {ids.length === 0
              ? "Every card marked Done already has a rating."
              : finished
                ? `That's all ${ids.length} done.`
                : `Card ${at + 1} of ${ids.length} marked Done with no rating.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {card && !finished ? (
            <div className="grid gap-4">
              <div className="flex min-w-0 items-center gap-3">
                {card.photoUrl ? (
                  <img src={card.photoUrl} alt="" className="size-16 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted">
                    <ActivityTypeIcon type={typeOf(card, typesById)} />
                  </span>
                )}
                <span className="grid min-w-0">
                  <span className="truncate font-medium">{card.title}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {card.day === null || card.day > trip.days ? "Ideas" : dayLabel(card.day, trip.startDate)}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-0.5" role="group" aria-label={`Rating for ${card.title}`}>
                {[1, 2, 3, 4, 5].map((stars) => (
                  <Button
                    key={stars}
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${stars} of 5`}
                    aria-pressed={card.rating === stars}
                    disabled={busy}
                    onClick={() => save({ rating: card.rating === stars ? null : stars })}
                  >
                    <StarIcon
                      className={cn(
                        "size-6",
                        card.rating !== null && stars <= card.rating ? "fill-amber-400 text-amber-500" : "text-muted-foreground"
                      )}
                    />
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`rate-trip-again-${card.id}`}
                  checked={card.goAgain}
                  disabled={busy}
                  onCheckedChange={(checked) => save({ goAgain: checked === true })}
                />
                <Label htmlFor={`rate-trip-again-${card.id}`}>Would go again</Label>
              </div>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {card && !finished ? (
            <>
              {at > 0 ? (
                <Button type="button" variant="outline" className="sm:mr-auto" onClick={() => setAt(at - 1)}>
                  Back
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setAt(at + 1)}>
                {card.rating ? "Next" : "Skip"}
              </Button>
            </>
          ) : null}
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
