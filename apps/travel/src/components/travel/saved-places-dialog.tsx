import * as React from "react"
import { Loader2Icon, MapPinIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { CoverImage } from "@/components/travel/cover-image"
import { SavedPlaceEditor } from "@/components/travel/saved-place-editor"
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
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  addGoAgain,
  addSavedPlace,
  changeSavedPlaceList,
  loadGoAgain,
  loadSavedPlaces,
  type GoAgainPlace,
  type SavedPlace,
} from "@/lib/api/travel/saved-places"
import { getActivityTypes, type ActivityType } from "@/lib/api/travel/types"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"

/**
 * Saved places (task part 41) from inside a trip: the person's favourite
 * places, saved from an activity's "How was it" card, each with "Add to trip",
 * which drops a copy into the trip's Ideas; the copy is its own record from
 * then on. Away from a trip, saved places live in the Trips dashboard's
 * Places section (12 Nov 2026), so this window opens only from a trip.
 *
 * The Go again tab (More Travel features part 14; Tyler: "Tab in Saved
 * places", "Ticked only") lists every place ticked "Would go again" on any
 * trip, each adding a copy to Ideas.
 *
 * Clicking a saved place's name opens it here to change its name, type,
 * picture and notes (Travel features 4, part 11: "Opens in the window").
 */
export function SavedPlacesDialog({
  open,
  onClose,
  tripId,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  tripId: string
  onAdded?: (activityId: string) => void
}) {
  const [places, setPlaces] = React.useState<SavedPlace[] | null>(null)
  const [goAgain, setGoAgain] = React.useState<GoAgainPlace[] | null>(null)
  // A failed load says why, with Try again, rather than looking like an empty list (UI standard, loading states).
  const [goAgainFailed, setGoAgainFailed] = React.useState<string | null>(null)
  const [goAgainAsk, setGoAgainAsk] = React.useState(0)
  const [tab, setTab] = React.useState<"saved" | "again">("saved")
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [types, setTypes] = React.useState<ActivityType[] | null>(null)
  // Each list says why a load failed, with Try again, rather than waiting for good.
  const [placesFailed, setPlacesFailed] = React.useState<string | null>(null)
  const [placesAsk, setPlacesAsk] = React.useState(0)
  const [typesFailed, setTypesFailed] = React.useState<string | null>(null)
  const [typesAsk, setTypesAsk] = React.useState(0)
  const editing = editingId ? places?.find((place) => place.id === editingId) : undefined
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
      setEditingId(null)
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

  // The person's types, for a saved place's Type, read the first time one is opened.
  React.useEffect(() => {
    if (!editingId || types) return
    let alive = true
    getActivityTypes()
      .then((loaded) => {
        if (!alive) return
        setTypesFailed(null)
        setTypes(loaded)
      })
      .catch((error: unknown) => {
        if (alive) setTypesFailed(getTravelErrorMessage(error))
      })
    return () => {
      alive = false
    }
  }, [editingId, types, typesAsk])

  async function addAgain(place: GoAgainPlace) {
    setWorking(place.id)
    let id = ""
    const ok = await run(async () => {
      id = (await addGoAgain(tripId, place.id)).id
    })
    setWorking(null)
    if (ok) onAdded?.(id)
  }

  React.useEffect(() => {
    if (!open) return
    let alive = true
    loadSavedPlaces()
      .then((loaded) => {
        if (!alive) return
        setPlacesFailed(null)
        setPlaces(loaded)
      })
      .catch((error: unknown) => {
        if (alive) setPlacesFailed(getTravelErrorMessage(error))
      })
    return () => {
      alive = false
    }
  }, [open, placesAsk])

  async function add(place: SavedPlace) {
    setWorking(place.id)
    let id = ""
    const ok = await run(async () => {
      id = (await addSavedPlace(tripId, place.id)).id
    })
    setWorking(null)
    if (ok) onAdded?.(id)
  }

  async function binPlace(place: SavedPlace) {
    setWorking(place.id)
    // Into Places' bin on the Trips dashboard, where it can be put back.
    const ok = await run(() => changeSavedPlaceList([place.id], "bin"))
    setWorking(null)
    if (ok) setPlaces((was) => (was ?? []).filter((item) => item.id !== place.id))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Saved places</DialogTitle>
          <DialogDescription>
            Add one to this trip's Ideas column. The copy is its own from then on. Click a place's name to change it.
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
                  <ErrorRow
                    message={goAgainFailed}
                    onRetry={() => {
                      setGoAgainFailed(null)
                      setGoAgainAsk((was) => was + 1)
                    }}
                    className="py-4"
                  />
                ) : goAgain === null ? (
                  <LoadingRow label="Loading places to go again…" />
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
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void addAgain(place)}>
                          {working === place.id ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                          Add to trip
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : (
          <Card size="sm">
            <CardContent>
              {editing ? (
                types ? (
                  <SavedPlaceEditor
                    place={editing}
                    types={types}
                    onChange={(next) => setPlaces((was) => (was ?? []).map((item) => (item.id === next.id ? next : item)))}
                    onBack={() => setEditingId(null)}
                  />
                ) : typesFailed ? (
                  <ErrorRow message={typesFailed} onRetry={() => {
                    setTypesFailed(null)
                    setTypesAsk((was) => was + 1)
                  }} className="py-4" />
                ) : (
                  <LoadingRow label="Loading the place…" />
                )
              ) : placesFailed ? (
                <ErrorRow message={placesFailed} onRetry={() => {
                  setPlacesFailed(null)
                  setPlacesAsk((was) => was + 1)
                }} className="py-4" />
              ) : places === null ? (
                <LoadingRow label="Loading saved places…" />
              ) : places.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No saved places yet. Rate an activity you've done, then press Save to saved places.
                </p>
              ) : (
                <ul className="grid grid-cols-[minmax(0,1fr)] divide-y">
                  {places.map((place) => (
                    <li key={place.id} className="flex min-w-0 items-center gap-3 py-2">
                      <PlacePicture url={place.photoUrl} />
                      <button
                        type="button"
                        className="grid min-w-0 flex-1 rounded-md text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        onClick={() => setEditingId(place.id)}
                      >
                        <span className="truncate text-sm font-medium">{place.title}</span>
                        {place.place?.address ? (
                          <span className="truncate text-xs text-muted-foreground">{place.place.address}</span>
                        ) : null}
                      </button>
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void add(place)}>
                        {working === place.id ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                        Add to trip
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${place.title}`}
                        disabled={busy}
                        onClick={() => void binPlace(place)}
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
  return (
    <CoverImage
      url={url}
      className="size-10 shrink-0 rounded-md object-cover"
      fallback={
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <MapPinIcon className="size-4 text-muted-foreground" aria-hidden />
        </span>
      }
    />
  )
}
