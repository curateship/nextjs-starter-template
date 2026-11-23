import * as React from "react"

import { GoogleMap } from "@/components/travel/google-map"
import { dayLabel } from "@/components/travel/new-activity"
import { DAY_COLORS } from "@/lib/travel/day-colors"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Activity } from "@/lib/api/travel/trips"
import { boardColumns } from "@/lib/travel/board"
import { cn } from "@/lib/utils"

const ALL_DAYS = "all"

/** The cards with a map position, the ones the map can draw. */
const placedOf = (cards: Activity[]) => cards.filter((card) => typeof card.place?.lat === "number" && typeof card.place.lng === "number")

/**
 * The Map tab (task part 42): the activities that have an address, as pins
 * numbered in each day's order, one colour per day, joined in that order by a
 * straight line in the day's colour (Travel features part 4). A day picker narrows it
 * to one day. Clicking a pin opens that activity in the right panel.
 * Activities with no address are listed under the map so none is lost.
 */
export function TripMapView({ activities }: { activities: Activity[] }) {
  const { page, typesById, openActivity, openActivityId } = useTrip()
  const { trip } = page
  const [picked, setPicked] = React.useState<string>(ALL_DAYS)
  const columns = boardColumns(trip.days, activities)
  columns.delete("ideas")
  const days = [...columns.entries()]
    .map(([, cards], index) => ({ day: index + 1, cards }))
    .filter(({ day }) => picked === ALL_DAYS || String(day) === picked)
  const pins = days.flatMap(({ day, cards }) =>
    placedOf(cards).map((card, index) => ({
      id: card.id,
      lat: card.place!.lat!,
      lng: card.place!.lng!,
      label: String(index + 1),
      title: `${dayLabel(day, trip.startDate)}: ${card.title}`,
      color: DAY_COLORS[(day - 1) % DAY_COLORS.length],
    }))
  )
  // A straight line through each day's pins in order, in the day's colour (Tyler, 3 Nov 2026: "Straight lines").
  const lines = days.map(({ day, cards }) => ({
    id: `day-${day}`,
    color: DAY_COLORS[(day - 1) % DAY_COLORS.length],
    points: placedOf(cards).map((card) => ({ lat: card.place!.lat!, lng: card.place!.lng! })),
  }))
  const unplaced = days.flatMap(({ cards }) => cards.filter((card) => card.place?.lat === null || card.place?.lat === undefined))

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      <div className="grid gap-3 p-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="trip-map-day">Day</Label>
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger id="trip-map-day" className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DAYS}>Every day</SelectItem>
              {Array.from({ length: trip.days }, (_, index) => (
                <SelectItem key={index} value={String(index + 1)}>
                  {dayLabel(index + 1, trip.startDate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <GoogleMap
          className="h-[28rem]"
          pins={pins}
          lines={lines}
          onPick={openActivity}
          emptyText="No activity here has an address from Google yet. Pick one in an activity's Place card."
        />
        {unplaced.length ? (
          <div className="grid gap-1">
            <p className="text-xs font-medium text-muted-foreground">Not on the map, with no address picked from Google</p>
            <ul className="grid gap-0.5">
              {unplaced.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => openActivity(card.id)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      card.id === openActivityId && "bg-accent"
                    )}
                  >
                    <ActivityTypeIcon type={typeOf(card, typesById)} />
                    <span className="truncate">{card.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </ScrollArea>
  )
}
