import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { LeadListItem } from "@/lib/dating/leads"
import { formatClockTime, formatMonthAndYear } from "@/lib/format/format-time"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { cn } from "@/lib/utils"

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const LONG_DAY = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })

/** "YYYY-MM-DD" of a moment in the reader's own time zone. */
function dayKey(at: Date) {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`
}

function addDays(day: string, count: number) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10)
}

function utcNoonOf(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date, 12))
}

/** From the Monday on or before the 1st to the Sunday on or after the last day. */
function monthGrid(month: string) {
  const first = `${month}-01`
  const lead = (utcNoonOf(first).getUTCDay() + 6) % 7
  const daysInMonth = Number(addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1).slice(8))
  return { start: addDays(first, -lead), cells: Math.ceil((lead + daysInMonth) / 7) * 7 }
}

/**
 * The Dates tab's month, across the middle panel's full width (Tyler, 21 Oct
 * 2026, picking "a full-width month like Google Calendar" over a stretched
 * date picker): one square per day, each date with a time written in its
 * day as "7:00 PM Sofia", opening on the month of the next one. Pressing a
 * date opens that lead. Dates still waiting for a time are the rows below.
 * Drawn like Project's month grid, weeks starting on Monday.
 */
export function DatesMonth({ leads, onOpen }: { leads: LeadListItem[]; onOpen: (id: string) => void }) {
  const [today] = React.useState(() => dayKey(new Date()))
  const byDay = React.useMemo(() => {
    const days = new Map<string, LeadListItem[]>()
    const timed = leads
      .filter((lead) => lead.dateAccepted && lead.dateAt)
      .sort((a, b) => new Date(a.dateAt as Date).getTime() - new Date(b.dateAt as Date).getTime())
    for (const lead of timed) {
      const day = dayKey(new Date(lead.dateAt as Date))
      days.set(day, [...(days.get(day) ?? []), lead])
    }
    return days
  }, [leads])
  const [month, setMonth] = React.useState(() => ([...byDay.keys()].find((day) => day >= today) ?? today).slice(0, 7))
  const [year, monthNumber] = month.split("-").map(Number)
  const inThisMonth = [...byDay.entries()].filter(([day]) => day.startsWith(month)).reduce((sum, [, list]) => sum + list.length, 0)
  const grid = monthGrid(month)

  return (
    <div>
      <div className="flex items-center gap-2 px-3 pt-3">
        <h3 className="min-w-0 truncate text-sm font-medium">
          {formatMonthAndYear(year, monthNumber)}
          <span className="font-normal text-muted-foreground"> · {inThisMonth === 1 ? "1 date" : `${inThisMonth} dates`}</span>
        </h3>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="ml-auto"
          aria-label="Previous month"
          onClick={() => setMonth(addDays(`${month}-01`, -1).slice(0, 7))}
        >
          <ChevronLeftIcon />
        </Button>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth(addDays(`${month}-01`, 32).slice(0, 7))}>
          <ChevronRightIcon />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setMonth(today.slice(0, 7))}>
          Today
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 p-3">
        {WEEK_DAYS.map((day) => (
          <div key={day} aria-hidden className="px-2 pb-1 text-left text-xs tracking-wide text-muted-foreground uppercase">
            {day}
          </div>
        ))}
        {Array.from({ length: grid.cells }, (_, index) => {
          const date = addDays(grid.start, index)
          const inMonth = date.startsWith(month)
          const dates = inMonth ? (byDay.get(date) ?? []) : []
          return (
            // A group, not a section: a section with a name is a landmark, and a month of them buries the page's real ones.
            <div
              key={date}
              role={inMonth ? "group" : undefined}
              aria-label={inMonth ? `${LONG_DAY.format(utcNoonOf(date))}: ${dates.length === 1 ? "1 date" : dates.length ? `${dates.length} dates` : "no dates"}` : undefined}
              aria-hidden={inMonth ? undefined : true}
              className={cn(
                "flex min-h-20 min-w-0 flex-col items-start gap-1.5 rounded-lg border bg-background p-1.5 text-left text-xs sm:p-2",
                !inMonth && "border-transparent bg-muted/60 text-muted-foreground/60"
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-sm",
                  date === today && "bg-primary font-semibold text-primary-foreground"
                )}
              >
                {Number(date.slice(8))}
              </span>
              {dates.length ? (
                <ul className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
                  {dates.map((lead) => (
                    <li key={lead.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpen(lead.id)}
                        className="flex w-full min-w-0 cursor-pointer gap-1 rounded bg-primary px-1 py-0.5 text-left text-xs leading-snug text-primary-foreground hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {/* A phone's square fits the name alone; wider ones take two lines before "…". */}
                        <span className="min-w-0 truncate sm:hidden">{lead.name}</span>
                        <span className="hidden min-w-0 break-words sm:line-clamp-2">
                          <span className="opacity-75">{formatClockTime(lead.dateAt)}</span> {lead.name}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The Dates tab's month over the list of dates, with a handle between them to
 * drag (Tyler, 21 Oct 2026: "make the bottom panel draggable"). The split is
 * remembered in this browser. The handle is the line between the two. Any
 * other tab is the list alone.
 */
export function DatesSplit({ month, children }: { month: React.ReactNode; children: React.ReactNode }) {
  const layout = useRememberedPanelLayout("date-dates-split")
  if (!month) return children
  return (
    <ResizablePanelGroup
      key={layout.layoutKey}
      orientation="vertical"
      className="min-h-0 flex-1"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      <ResizablePanel id="month" defaultSize="62%" minSize="15%">
        <ScrollArea className="h-full" viewportClassName="h-full">
          {month}
        </ScrollArea>
      </ResizablePanel>
      <ResizableHandle withHandle aria-label="Drag to resize the month and the list" />
      <ResizablePanel id="list" minSize="15%">
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
