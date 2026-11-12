import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CalendarPlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TripListRow } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dateOfDay, formatDayDate } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { tabOf } from "@/lib/travel/trips-lists"

const IDEAS = "ideas"

/**
 * Add to a trip, from a place on the Trips dashboard (Tyler, 12 Nov 2026):
 * a small box under the button with the trip and the day, upcoming trips
 * first, then Add. The place is copied to the end of that day, or into the
 * trip's Ideas, and the trip opens on the copy. A place already on the trip
 * is skipped, and the error says where the first one is.
 */
export function AddToTrip({
  trips,
  add,
}: {
  trips: readonly TripListRow[]
  /** Makes the copy and answers with its id. */
  add: (tripId: string, day: number | null) => Promise<{ id: string }>
}) {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  // Upcoming trips first, soonest first; then the rest. The Bin and archived trips are left out.
  const choices = React.useMemo(() => {
    const live = trips.filter((trip) => tabOf(trip) === "upcoming" || tabOf(trip) === "past")
    const rank = (trip: TripListRow) => (tabOf(trip) === "upcoming" ? 0 : 1)
    return [...live].sort(
      (a, b) => rank(a) - rank(b) || (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") || a.name.localeCompare(b.name)
    )
  }, [trips])
  const [tripId, setTripId] = React.useState("")
  const [day, setDay] = React.useState(IDEAS)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const trip = choices.find((each) => each.id === tripId) ?? choices[0] ?? null

  async function addIt() {
    if (!trip) return
    let made = ""
    const ok = await run(async () => {
      made = (await add(trip.id, day === IDEAS ? null : Number(day))).id
    })
    if (!ok) return
    setOpen(false)
    await navigate({ to: "/trips/$tripId", params: { tripId: trip.id }, search: { open: made } })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Each opening starts on the first trip's Ideas.
        if (next) {
          setTripId("")
          setDay(IDEAS)
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <CalendarPlusIcon className="size-4" />
          Add to a trip
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-64 gap-4 p-3">
        {choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trip to add it to yet. Make one with New trip in Trips.</p>
        ) : (
        <>
        <div className="grid gap-2">
          <FieldLabel htmlFor="add-to-trip-trip">Trip</FieldLabel>
          <Select
            value={trip?.id ?? ""}
            onValueChange={(next) => {
              setTripId(next)
              setDay(IDEAS)
            }}
          >
            <SelectTrigger id="add-to-trip-trip" className="w-full">
              <SelectValue placeholder="Pick a trip" />
            </SelectTrigger>
            <SelectContent>
              {choices.map((each) => (
                <SelectItem key={each.id} value={each.id}>
                  {each.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="add-to-trip-day">Day</FieldLabel>
          <Select value={day} onValueChange={setDay}>
            <SelectTrigger id="add-to-trip-day" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={IDEAS}>Ideas</SelectItem>
              {trip
                ? Array.from({ length: trip.days }, (_, index) => {
                    const date = dateOfDay(trip.startDate, index + 1)
                    return (
                      <SelectItem key={index} value={String(index + 1)}>
                        Day {index + 1}
                        {date ? ` · ${formatDayDate(date)}` : ""}
                      </SelectItem>
                    )
                  })
                : null}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" className="justify-self-end" disabled={busy} onClick={() => void addIt()}>
          Add
        </Button>
        </>
        )}
      </PopoverContent>
    </Popover>
  )
}
