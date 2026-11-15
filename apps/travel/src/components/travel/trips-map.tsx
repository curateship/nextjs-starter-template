import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { XIcon } from "lucide-react"

import { WidgetHeadingActions } from "@/components/shared/widgets/widget-card"
import { NOT_RATED, StarRow } from "@/components/travel/stars"
import { GoogleMap } from "@/components/travel/google-map"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { loadPins, loadVisited, type TripPin, type VisitedPin } from "@/lib/api/travel/trip-admin"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { TRIPS_MAP_PINS_KEY } from "@/lib/travel/panel-keys"

const MAP_PINS = ["destinations", "visited"] as const

/**
 * Overview's Map widget, the map above the Trips table until 12 Nov 2026.
 * Destinations (task part 40) pins each trip's destination, and a click
 * opens the trip. Places I've been (Travel features 3, part 12; Tyler, 5 Nov
 * 2026: "Small card on the map") pins every card marked Done, and a click
 * shows a small card with the place, its trip and its stars, and a way to
 * open the trip. The switch sits in the widget's heading and is remembered
 * in this browser. Google Maps loads only while the widget is on Overview.
 */
export function TripsMap() {
  const navigate = useNavigate()
  const [which, setWhich] = useRememberedChoice(TRIPS_MAP_PINS_KEY, "destinations", MAP_PINS)
  const [pins, setPins] = React.useState<TripPin[] | null>(null)
  const [visited, setVisited] = React.useState<VisitedPin[] | null>(null)
  const [picked, setPicked] = React.useState<string | null>(null)
  // A failed read says so with Try again on both tabs, never "nothing here" (Travel polish part 2).
  const [pinsFailed, setPinsFailed] = React.useState<string | null>(null)
  const [visitedFailed, setVisitedFailed] = React.useState<string | null>(null)
  const [pinsAsk, setPinsAsk] = React.useState(0)
  const [visitedAsk, setVisitedAsk] = React.useState(0)
  React.useEffect(() => {
    let alive = true
    loadPins()
      .then((loaded) => {
        if (!alive) return
        setPinsFailed(null)
        setPins(loaded)
      })
      .catch((error: unknown) => {
        if (alive) setPinsFailed(getTravelErrorMessage(error))
      })
    return () => {
      alive = false
    }
  }, [pinsAsk])
  React.useEffect(() => {
    if (which !== "visited") return
    let alive = true
    loadVisited()
      .then((loaded) => {
        if (!alive) return
        setVisitedFailed(null)
        setVisited(loaded)
      })
      .catch((error: unknown) => {
        if (alive) setVisitedFailed(getTravelErrorMessage(error))
      })
    return () => {
      alive = false
    }
  }, [which, visitedAsk])
  const failed = which === "visited" ? visitedFailed : pinsFailed
  const shownPin = which === "visited" ? visited?.find((pin) => pin.activityId === picked) : undefined
  return (
    <section
      aria-label={which === "visited" ? "Places visited" : "Trip destinations"}
      className="relative flex min-h-48 flex-1 flex-col"
    >
      <WidgetHeadingActions>
        <Tabs
          value={which}
          onValueChange={(next) => {
            setPicked(null)
            setWhich(next as (typeof MAP_PINS)[number])
          }}
        >
          <TabsList aria-label="Pins on the map">
            <TabsTrigger value="destinations">Destinations</TabsTrigger>
            <TabsTrigger value="visited">Been</TabsTrigger>
          </TabsList>
        </Tabs>
      </WidgetHeadingActions>
      {failed ? (
        <ErrorRow
          message={failed}
          onRetry={() => {
            if (which === "visited") {
              setVisitedFailed(null)
              setVisitedAsk((was) => was + 1)
            } else {
              setPinsFailed(null)
              setPinsAsk((was) => was + 1)
            }
          }}
          className="min-h-48 flex-1 content-center"
        />
      ) : which === "visited" ? (
        <GoogleMap
          className="min-h-48 flex-1"
          pins={(visited ?? []).map((pin) => ({ id: pin.activityId, lat: pin.lat, lng: pin.lng, title: `${pin.title}, ${pin.tripName}` }))}
          emptyText={visited === null ? "Loading the places you've been…" : "Mark a card with a place Done to see it here."}
          onPick={setPicked}
        />
      ) : (
        <GoogleMap
          className="min-h-48 flex-1"
          pins={(pins ?? []).map((pin) => ({ id: pin.tripId, lat: pin.lat, lng: pin.lng, title: `${pin.name}, ${pin.destination}` }))}
          emptyText={pins === null ? "Loading your destinations…" : "Give a trip a destination to see it on the map."}
          onPick={(tripId) => void navigate({ to: "/trips/$tripId", params: { tripId } })}
        />
      )}
      {shownPin ? (
        <Card size="sm" className="absolute bottom-2 left-2 w-64 max-w-[calc(100%-1rem)]">
          <CardContent className="grid gap-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{shownPin.title}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Close" onClick={() => setPicked(null)}>
                <XIcon className="size-3.5" />
              </Button>
            </div>
            <span className="truncate text-sm text-muted-foreground">{shownPin.tripName}</span>
            {shownPin.rating ? (
              <StarRow rating={shownPin.rating} />
            ) : (
              <span className="text-xs text-muted-foreground">{NOT_RATED}</span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1 justify-self-start"
              onClick={() =>
                void navigate({ to: "/trips/$tripId", params: { tripId: shownPin.tripId }, search: { open: shownPin.activityId } })
              }
            >
              Open trip
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </section>
  )
}
