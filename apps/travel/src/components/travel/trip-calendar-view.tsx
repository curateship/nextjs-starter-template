import * as React from "react"
import { CalendarDaysIcon } from "lucide-react"

import { typeOf, useTrip } from "@/components/travel/trip-context"
import { TripSettingsDialog } from "@/components/travel/trip-settings-dialog"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Activity } from "@/lib/api/travel/trips"
import { boardColumns, formatTime } from "@/lib/travel/board"
import { addDays, daysBetween, lastDate, todayIn, weekday } from "@/lib/travel/dates"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * The Calendar tab (task part 18): the trip's dates as weeks, each day
 * holding its activities by time. It needs a start date; a trip with none
 * says so, with a button that opens Trip settings at the date.
 */
export function TripCalendarView({ activities }: { activities: Activity[] }) {
  const { page, typesById, openActivity, openActivityId } = useTrip()
  const { trip } = page
  const [settingsOpen, setSettingsOpen] = React.useState(false)

  if (!trip.startDate) {
    return (
      <div className="grid flex-1 content-center justify-items-center gap-3 p-6 text-center">
        <CalendarDaysIcon className="size-5 text-muted-foreground" aria-hidden />
        <p className="max-w-64 text-sm text-muted-foreground">Add a start date to see the calendar.</p>
        <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>
          Add a start date
        </Button>
        <TripSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    )
  }

  const start = trip.startDate
  const end = lastDate(start, trip.days)!
  const gridStart = addDays(start, -weekday(start))
  const gridEnd = addDays(end, 6 - weekday(end))
  const cells = daysBetween(gridStart, gridEnd) + 1
  const columns = boardColumns(trip.days, activities)
  const today = todayIn(trip.timeZone)

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      <div className="grid gap-px p-3">
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((name) => (
            <div key={name} className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              {name}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
          {Array.from({ length: cells }, (_, index) => {
            const date = addDays(gridStart, index)
            const day = daysBetween(start, date) + 1
            const inTrip = day >= 1 && day <= trip.days
            const cards = inTrip ? (columns.get(`day-${day}`) ?? []) : []
            const [, month, dayOfMonth] = date.split("-").map(Number)
            return (
              <div
                key={date}
                data-date={date}
                className={cn("grid min-h-28 content-start gap-1 bg-card p-1.5", !inTrip && "bg-muted/40")}
              >
                <div className="flex items-baseline gap-1.5 px-0.5 text-xs">
                  <span className={cn("font-medium", date === today && "rounded bg-foreground px-1 text-background")}>
                    {dayOfMonth === 1 || index === 0 ? `${dayOfMonth} ${MONTHS[month - 1]}` : dayOfMonth}
                  </span>
                  {inTrip ? <span className="text-muted-foreground">Day {day}</span> : null}
                </div>
                {cards.map((activity) => (
                  <button
                    key={activity.id}
                    type="button"
                    onClick={() => openActivity(activity.id)}
                    aria-current={activity.id === openActivityId || undefined}
                    className={cn(
                      "flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      activity.id === openActivityId && "bg-accent",
                      activity.done && "text-muted-foreground line-through"
                    )}
                  >
                    <ActivityTypeIcon type={typeOf(activity, typesById)} className="size-3" />
                    {activity.startTime ? (
                      <span className="shrink-0 text-muted-foreground tabular-nums">{formatTime(activity.startTime)}</span>
                    ) : null}
                    <span className="truncate">{activity.title}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}
