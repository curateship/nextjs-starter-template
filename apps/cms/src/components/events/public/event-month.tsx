import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { PublicEventCard } from "@/lib/api/events/public"
import {
  addMonths,
  daysCovered,
  formatMonthLabel,
  monthMatrix,
  toMonthString,
  WEEKDAY_LABELS,
  type YearMonth,
} from "@/lib/events/calendar-grid"
import { EVENTS_PER_DAY_CELL } from "@/lib/events/events-page"
import { formatEventClock, formatEventShortDay } from "@/lib/events/event-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The Events page's month. On a wide screen each day shows up to three events
 * and "+2 more"; on a phone each day shows only its number and a dot when it
 * has events. Either way a day with more to see opens that day's list. An
 * event over several days shows on every one of them.
 *
 * "Today" is the site's today, sent by the server, so the ring lands on the
 * same day for every visitor wherever they are.
 */
export function EventMonth({
  month,
  events,
  today,
}: {
  month: YearMonth
  events: PublicEventCard[]
  today: string
}) {
  const cells = React.useMemo(() => monthMatrix(month), [month])
  // An event over several days goes on each of its days in the grid. The
  // events arrive soonest first, so one still running from an earlier day
  // sits above the ones that start on the day.
  const byDay = React.useMemo(() => {
    const days = new Map<string, PublicEventCard[]>()
    const from = cells[0]!.date
    const to = cells[cells.length - 1]!.date
    for (const event of events) {
      for (const day of daysCovered(event.startDate, event.endDate, from, to)) {
        days.set(day, [...(days.get(day) ?? []), event])
      }
    }
    return days
  }, [cells, events])
  const inMonth = cells.some(
    (cell) => cell.inCurrentMonth && byDay.has(cell.date)
  )

  return (
    <div className="grid gap-2 md:gap-3">
      <MonthNavigation month={month} />

      <Card className="hidden gap-0 py-0 sm:flex">
        <WeekdayRow short={false} />
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const dayEvents = byDay.get(cell.date) ?? []
            const shown = dayEvents.slice(0, EVENTS_PER_DAY_CELL)
            const more = dayEvents.length - shown.length
            return (
              <div
                key={cell.date}
                className={cn(
                  "grid min-h-28 min-w-0 content-start gap-1 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0",
                  !cell.inCurrentMonth && "bg-muted/40"
                )}
              >
                <DayNumber
                  day={cell.day}
                  date={cell.date}
                  today={cell.date === today}
                  inMonth={cell.inCurrentMonth}
                />
                {shown.map((event) => (
                  <Link
                    key={event.id}
                    to="/events/$slug"
                    params={{ slug: event.slug }}
                    title={event.title}
                    className={cn(
                      "block truncate rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-primary/20",
                      focusRing
                    )}
                  >
                    {/* The start time goes on the first day only. */}
                    {event.startDate === cell.date ? (
                      <span className="mr-1 text-muted-foreground">
                        {formatEventClock(event.startTime)}
                      </span>
                    ) : null}
                    {event.title}
                  </Link>
                ))}
                {more > 0 ? (
                  <Link
                    to="/events"
                    search={{ day: cell.date }}
                    className={cn(
                      "block truncate rounded-sm px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground",
                      focusRing
                    )}
                  >
                    +{more} more
                  </Link>
                ) : null}
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="gap-0 py-0 sm:hidden">
        <WeekdayRow short />
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const count = byDay.get(cell.date)?.length ?? 0
            const content = (
              <>
                <DayNumber
                  day={cell.day}
                  date={cell.date}
                  today={cell.date === today}
                  inMonth={cell.inCurrentMonth}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full",
                    count ? "bg-primary" : "bg-transparent"
                  )}
                />
              </>
            )
            const cellClass =
              "flex h-12 flex-col items-center justify-center gap-0.5"
            return count ? (
              <Link
                key={cell.date}
                to="/events"
                search={{ day: cell.date }}
                aria-label={`${formatEventShortDay(cell.date)}: ${count} ${count === 1 ? "event" : "events"}`}
                className={cn(cellClass, "rounded-md", focusRing)}
              >
                {content}
              </Link>
            ) : (
              <div key={cell.date} className={cellClass}>
                {content}
              </div>
            )
          })}
        </div>
      </Card>

      {inMonth ? null : (
        <p className="text-sm text-muted-foreground">
          Nothing is on in {formatMonthLabel(month)}.
        </p>
      )}
    </div>
  )
}

function MonthNavigation({ month }: { month: YearMonth }) {
  return (
    <div className="flex items-center gap-2">
      <MonthStep month={addMonths(month, -1)} label="Previous month">
        <ChevronLeftIcon className="size-4" />
      </MonthStep>
      <h2 className="min-w-36 text-center text-base font-semibold">
        {formatMonthLabel(month)}
      </h2>
      <MonthStep month={addMonths(month, 1)} label="Next month">
        <ChevronRightIcon className="size-4" />
      </MonthStep>
      <Button asChild variant="outline">
        {/* No month in the address means the site's current month. */}
        <Link to="/events" search={{ view: "month" }}>
          Today
        </Link>
      </Button>
    </div>
  )
}

function MonthStep({
  month,
  label,
  children,
}: {
  month: YearMonth
  label: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="outline" size="icon">
          <Link
            to="/events"
            search={{ view: "month", month: toMonthString(month) }}
            aria-label={label}
          >
            {children}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function WeekdayRow({ short }: { short: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-7 border-b bg-muted/50 text-xs font-medium text-muted-foreground"
    >
      {WEEKDAY_LABELS.map((label) => (
        <div key={label} className="px-2 py-2 text-center">
          {short ? label.charAt(0) : label}
        </div>
      ))}
    </div>
  )
}

function DayNumber({
  day,
  date,
  today,
  inMonth,
}: {
  day: number
  date: string
  today: boolean
  inMonth: boolean
}) {
  return (
    <time
      dateTime={date}
      aria-current={today ? "date" : undefined}
      className={cn(
        "inline-flex size-6 items-center justify-center justify-self-end rounded-full text-xs",
        today && "bg-primary font-semibold text-primary-foreground",
        !today && !inMonth && "text-muted-foreground"
      )}
    >
      {day}
    </time>
  )
}
