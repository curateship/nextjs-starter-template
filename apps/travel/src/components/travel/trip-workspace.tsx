import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { ActivityPanel } from "@/components/travel/activity-panel"
import { useTripWeather } from "@/components/travel/day-weather"
import { SchedulePanel } from "@/components/travel/schedule-panel"
import { markClickedOpen, TripProvider, type TripContextValue } from "@/components/travel/trip-context"
import { TripDetailsPanel } from "@/components/travel/trip-details-panel"
import { useTravelOffline } from "@/components/travel/use-travel-offline"
import { ThreePanels } from "@/components/shared/three-panels"
import type { TripPage } from "@/lib/api/travel/trips"
import { boardColumns } from "@/lib/travel/board"
import { TRIP_PANEL_LAYOUT_KEY, tripPlaceKey } from "@/lib/travel/panel-keys"
import type { TripSearch } from "@/lib/travel/trip-search"

export const TRIP_ROUTE_ID = "/_authenticated/trips/$tripId"

/**
 * The trip page, Project's project page drawn for a trip: the trip's details
 * on the left, its days as a board in the middle, and the open activity on the
 * right (Tyler, 2 Nov 2026: "left panel trip details, middle panel schedule
 * with board view as default ... clicking on the card opens up the activity
 * details on right panel").
 *
 * The open activity is `?open=<id>`, so a reload or a pasted link keeps it,
 * and the shell's `ThreePanels` opens the first activity of the first day on
 * arrival so the right panel is never empty.
 */
export function TripWorkspace({
  page,
  search,
  onSearch,
}: {
  page: TripPage
  search: TripSearch
  onSearch: (patch: Partial<TripSearch>, options?: { history?: boolean }) => void
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const tripId = page.trip.id
  const readOnly = useTravelOffline()
  // Loaded once here, for the board's warnings and the open card's ⋮ menu (Tyler, 4 Nov 2026).
  const weather = useTripWeather(page.trip)

  const refresh = React.useCallback(
    () => router.invalidate({ filter: (match) => match.routeId === TRIP_ROUTE_ID }),
    [router]
  )

  // A new card gets a history entry of its own, so Back steps through what was opened.
  const openActivity = React.useCallback(
    (activityId: string) => {
      markClickedOpen(activityId)
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => ({ ...previous, open: activityId }),
      })
    },
    [navigate]
  )

  // The Photos tab asks the left panel to show the note a picture is in.
  const [noteRequest, setNoteRequest] = React.useState<TripContextValue["noteRequest"]>(null)
  const openTripNote = React.useCallback((noteId: string | null) => setNoteRequest({ noteId, at: Date.now() }), [])

  const typesById = React.useMemo(() => new Map(page.types.map((type) => [type.id, type])), [page.types])

  // The first activity of the first day opens on arrival; Ideas come last.
  const placeIds = React.useMemo(() => {
    const columns = boardColumns(page.trip.days, page.activities)
    const ideas = columns.get("ideas") ?? []
    columns.delete("ideas")
    return [...[...columns.values()].flat(), ...ideas].map((activity) => activity.id)
  }, [page.activities, page.trip.days])

  const openId = search.open && page.activities.some((activity) => activity.id === search.open) ? search.open : undefined

  const context = React.useMemo<TripContextValue>(
    () => ({ page, typesById, refresh, openActivity, openActivityId: openId, readOnly, weather, openTripNote, noteRequest }),
    [noteRequest, openActivity, openId, openTripNote, page, readOnly, refresh, typesById, weather]
  )

  return (
    <TripProvider value={context}>
      <ThreePanels
        layoutKey={TRIP_PANEL_LAYOUT_KEY}
        place={{ key: tripPlaceKey(tripId), search, ids: placeIds }}
        showRightFor={openId}
        left={{ label: "Trip", showLabel: "Show the trip details", content: <TripDetailsPanel /> }}
        middle={{ label: "Schedule", content: <SchedulePanel search={search} onSearch={onSearch} /> }}
        right={{
          label: "Activity",
          showLabel: "Show the activity",
          content: <ActivityPanel key={openId ?? "none"} activityId={openId} />,
        }}
      />
    </TripProvider>
  )
}
