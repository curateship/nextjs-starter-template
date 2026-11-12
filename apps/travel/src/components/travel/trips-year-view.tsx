import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, PlaneTakeoffIcon } from "lucide-react"

import { CoverImage } from "@/components/travel/cover-image"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { TripListRow } from "@/lib/api/travel/trips"
import { formatTripDates } from "@/lib/travel/dates"
import { startingYear, yearBars } from "@/lib/travel/trip-year"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** One row of bars: a bar is 28px tall with 8px between rows. */
const ROW_PX = 36

/**
 * The Trips dashboard's Year widget, the Trips table's Year tab until
 * 12 Nov 2026 (Travel features 4, part 9; Tyler, 6 Nov 2026: "Cover, name,
 * dates"): the months across the top and each dated trip as a
 * bar across its days, with its small cover, name and dates. Clicking a bar
 * opens the trip, and the arrows step a year at a time. It opens on the year
 * of the next trip. Trips with no dates can't be placed, so a line says how
 * many there are. On a narrow screen the months scroll sideways.
 */
export function TripsYearView({ trips, onOpen }: { trips: readonly TripListRow[]; onOpen: (trip: TripListRow) => void }) {
  const [year, setYear] = React.useState(() => startingYear(trips))
  const { bars, rows } = yearBars(trips, year)
  const undated = trips.filter((trip) => !trip.startDate).length

  return (
    <div className="grid gap-3 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-1">
          <YearButton label="Previous year" onClick={() => setYear(year - 1)}>
            <ChevronLeftIcon className="size-4" />
          </YearButton>
          <span className="min-w-12 text-center text-sm font-medium tabular-nums">{year}</span>
          <YearButton label="Next year" onClick={() => setYear(year + 1)}>
            <ChevronRightIcon className="size-4" />
          </YearButton>
        </div>
        <p className="text-sm text-muted-foreground">
          {bars.length === 0 ? `No dated trips in ${year}.` : bars.length === 1 ? `1 trip in ${year}.` : `${bars.length} trips in ${year}.`}
          {undated ? ` ${undated === 1 ? "1 trip has" : `${undated} trips have`} no dates, so ${undated === 1 ? "it isn't" : "they aren't"} shown.` : ""}
        </p>
      </div>
      <ScrollArea className="w-full">
        <div className="min-w-[720px] pb-2">
          <div className="grid grid-cols-12 border-b text-xs text-muted-foreground">
            {MONTHS.map((month) => (
              <span key={month} className="border-l px-1.5 py-1 first:border-l-0">
                {month}
              </span>
            ))}
          </div>
          <div className="relative" style={{ height: Math.max(rows, 1) * ROW_PX + 8 }}>
            {/* The month lines run down behind the bars. */}
            <div aria-hidden className="absolute inset-0 grid grid-cols-12">
              {MONTHS.map((month) => (
                <span key={month} className="border-l first:border-l-0" />
              ))}
            </div>
            <ul aria-label={`Trips in ${year}`}>
              {bars.map(({ trip, left, width, row }) => (
                <li
                  key={trip.id}
                  className="group/bar absolute flex h-7 min-w-0 items-center"
                  style={{ left: `${left * 100}%`, top: row * ROW_PX + 8, right: 0 }}
                >
                  {/* The bar is the trip's own days, measured against the rest of the year; its words carry on past a short one. */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded-md bg-primary/15 group-hover/bar:bg-primary/25"
                    style={{ width: `max(${(width / (1 - left)) * 100}%, 6px)` }}
                  />
                  <button
                    type="button"
                    data-trip-id={trip.id}
                    onClick={() => onOpen(trip)}
                    className="relative flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md pr-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <CoverImage
                      url={trip.coverUrl}
                      className="ml-1 size-5 shrink-0 rounded object-cover"
                      fallback={
                        <span className="ml-1 flex size-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                          <PlaneTakeoffIcon className="size-3" aria-hidden />
                        </span>
                      }
                    />
                    <span className="truncate text-xs font-medium">{trip.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatTripDates(trip.startDate, trip.days)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}

function YearButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
