import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon, Loader2Icon, MapPinIcon, PlusIcon, Trash2Icon } from "lucide-react"

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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  addGoAgain,
  addSavedPlace,
  forgetSavedPlace,
  loadGoAgain,
  loadSavedPlaces,
  type GoAgainPlace,
  type SavedPlace,
} from "@/lib/api/travel/saved-places"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Saved places (task part 41): the person's favourite places, saved from an
 * activity's "How was it" card. From the Trips table it lists them and lets
 * one go. From a trip's Ideas column (`tripId` set) each has "Add to trip",
 * which drops a copy into Ideas; the copy is its own record from then on.
 *
 * The Go again tab (More Travel features part 14; Tyler: "Tab in Saved
 * places", "Ticked only") lists every place ticked "Would go again" on any
 * trip. From a trip it adds a copy to Ideas; from the Trips table it opens the
 * trip it was on.
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
  const [goAgain, setGoAgain] = React.useState<GoAgainPlace[] | null>(null)
  // A failed load says why, with Try again, rather than looking like an empty list (UI standard, loading states).
  const [goAgainFailed, setGoAgainFailed] = React.useState<string | null>(null)
  const [goAgainAsk, setGoAgainAsk] = React.useState(0)
  const [tab, setTab] = React.useState<"saved" | "again">("saved")
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const [working, setWorking] = React.useState<string | null>(null)

  // Each opening starts on Saved.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setTab("saved")
      setGoAgain(null)
      setGoAgainFailed(null)
    }
  }

  React.useEffect(() => {
    if (!open || tab !== "again") return
    let alive = true
    loadGoAgain()
      .then((loaded) => {
        if (alive) setGoAgain(loaded)
      })
      .catch((error: unknown) => {
        if (alive) setGoAgainFailed(getTravelErrorMessage(error))
      })
    return () => {
      alive = false
    }
  }, [open, tab, goAgainAsk])

  async function addAgain(place: GoAgainPlace) {
    if (!tripId) return
    setWorking(place.id)
    let id = ""
    const ok = await run(async () => {
      id = (await addGoAgain(tripId, place.id)).id
    }, `${place.title} added to Ideas.`)
    setWorking(null)
    if (ok) onAdded?.(id)
  }

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
          <Tabs value={tab} onValueChange={(next) => setTab(next as "saved" | "again")}>
            <TabsList aria-label="Which places">
              <TabsTrigger value="saved">Saved</TabsTrigger>
              <TabsTrigger value="again">Go again</TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === "again" ? (
            <Card size="sm">
              <CardContent>
                {goAgainFailed ? (
                  <div className="grid justify-items-start gap-2 py-2">
                    <p className="text-sm text-destructive">{goAgainFailed}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setGoAgainFailed(null)
                        setGoAgainAsk((was) => was + 1)
                      }}
                    >
                      Try again
                    </Button>
                  </div>
                ) : goAgain === null ? (
                  <LoadingRow label="Loading places to go again" />
                ) : goAgain.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    Nothing here yet. Once an activity is done, tick Would go again in its How was it section.
                  </p>
                ) : (
                  <ul className="grid grid-cols-[minmax(0,1fr)] divide-y">
                    {goAgain.map((place) => (
                      <li key={place.id} className="flex min-w-0 items-center gap-3 py-2">
                        <PlacePicture url={place.photoUrl} />
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate text-sm font-medium">{place.title}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {place.tripName} · {place.day === null ? "Ideas" : `Day ${place.day}`}
                          </span>
                        </span>
                        {tripId ? (
                          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void addAgain(place)}>
                            {working === place.id ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                            Add to trip
                          </Button>
                        ) : (
                          <Button asChild type="button" variant="outline" size="sm">
                            <Link to="/trips/$tripId" params={{ tripId: place.tripId }} search={{ open: place.id }} onClick={onClose}>
                              <ArrowUpRightIcon className="size-4" />
                              Open trip
                            </Link>
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : (
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
                      <PlacePicture url={place.photoUrl} />
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
          )}
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

/** A place's small picture, or a pin when it has none. */
function PlacePicture({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" className="size-10 shrink-0 rounded-md object-cover" />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
      <MapPinIcon className="size-4 text-muted-foreground" aria-hidden />
    </span>
  )
}
