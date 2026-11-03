import * as React from "react"
import { Loader2Icon, MapPinIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import { addSavedPlace, forgetSavedPlace, loadSavedPlaces, type SavedPlace } from "@/lib/api/travel/saved-places"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Saved places (task part 41): the person's favourite places, saved from an
 * activity's "How was it" card. From the Trips table it lists them and lets
 * one go. From a trip's Ideas column (`tripId` set) each has "Add to trip",
 * which drops a copy into Ideas; the copy is its own record from then on.
 */
export function SavedPlacesDialog({
  open,
  onClose,
  tripId,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  tripId?: string
  onAdded?: (activityId: string) => void
}) {
  const [places, setPlaces] = React.useState<SavedPlace[] | null>(null)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const [working, setWorking] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    let alive = true
    loadSavedPlaces()
      .then((loaded) => {
        if (alive) setPlaces(loaded)
      })
      .catch((error: unknown) => showErrorToast(getTravelErrorMessage(error)))
    return () => {
      alive = false
    }
  }, [open])

  async function add(place: SavedPlace) {
    if (!tripId) return
    setWorking(place.id)
    let id = ""
    const ok = await run(async () => {
      id = (await addSavedPlace(tripId, place.id)).id
    }, `${place.title} added to Ideas.`)
    setWorking(null)
    if (ok) onAdded?.(id)
  }

  async function forget(place: SavedPlace) {
    setWorking(place.id)
    const ok = await run(() => forgetSavedPlace(place.id), `${place.title} removed from saved places.`)
    setWorking(null)
    if (ok) setPlaces((was) => (was ?? []).filter((item) => item.id !== place.id))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Saved places</DialogTitle>
          <DialogDescription>
            {tripId
              ? "Add one to this trip's Ideas column. The copy is its own from then on."
              : "Save a place from an activity's How was it card, then add it to any trip."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent>
              {places === null ? (
                <LoadingRow label="Loading saved places" />
              ) : places.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No saved places yet. Rate an activity you've done, then press Save to saved places.
                </p>
              ) : (
                <ul className="grid grid-cols-[minmax(0,1fr)] divide-y">
                  {places.map((place) => (
                    <li key={place.id} className="flex min-w-0 items-center gap-3 py-2">
                      {place.photoUrl ? (
                        <img src={place.photoUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                          <MapPinIcon className="size-4 text-muted-foreground" aria-hidden />
                        </span>
                      )}
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-sm font-medium">{place.title}</span>
                        {place.place?.address ? (
                          <span className="truncate text-xs text-muted-foreground">{place.place.address}</span>
                        ) : null}
                      </span>
                      {tripId ? (
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void add(place)}>
                          {working === place.id ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                          Add to trip
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${place.title} from saved places`}
                        disabled={busy}
                        onClick={() => void forget(place)}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
