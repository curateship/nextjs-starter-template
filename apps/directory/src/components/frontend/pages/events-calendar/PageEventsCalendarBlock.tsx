"use client"

import { useEffect, useMemo, useState } from "react"
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left.js"
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.js"
import CalendarDays from "lucide-react/dist/esm/icons/calendar-days.js"
import ListIcon from "lucide-react/dist/esm/icons/list.js"

import Link from "@/components/app-link"
import { Button } from "@/components/ui/button"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import {
  getEventsCalendarData,
  type EventsCalendarData,
  type EventsCalendarEntry,
} from "@/lib/actions/pages/page-events-calendar-actions"
import {
  WEEKDAY_LABELS,
  addMonths,
  formatDayLabel,
  formatMonthLabel,
  formatTimeLabel,
  monthMatrix,
  parseYearMonth,
  todayDateString,
  type YearMonth,
} from "@/lib/utils/calendar-grid"
import { resolveMediaUrl } from "@/lib/utils/media-url"
import { cn } from "@/lib/utils/tailwind"

type CalendarView = "month" | "list"

interface PageEventsCalendarBlockProps {
  content?: {
    title?: string
    subtitle?: string
    defaultView?: CalendarView
    visibility?: Record<string, boolean>
  }
  siteId: string
  preloadedData?: EventsCalendarData
  siteWidth?: "full" | "custom"
  customWidth?: number
}

// How many event chips a single month-grid cell shows before collapsing the
// rest into a "+N more" hint (which jumps to the list view for that day).
const MAX_EVENTS_PER_DAY_CELL = 3

function eventHref(entry: EventsCalendarEntry) {
  return `/events/${entry.slug}`
}

export function PageEventsCalendarBlock({
  content,
  siteId,
  preloadedData,
  siteWidth = "custom",
  customWidth,
}: PageEventsCalendarBlockProps) {
  const {
    title = "Upcoming Events",
    subtitle = "",
    defaultView = "month",
    visibility = {},
  } = content || {}

  const [data, setData] = useState<EventsCalendarData | null>(preloadedData || null)
  const [loading, setLoading] = useState(!preloadedData)
  const [view, setView] = useState<CalendarView>(defaultView === "list" ? "list" : "month")
  const [cursor, setCursor] = useState<YearMonth>(() => parseYearMonth(todayDateString())!)

  useEffect(() => {
    if (!siteId) {
      setData(null)
      setLoading(false)
      return
    }

    if (preloadedData) {
      setData(preloadedData)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    getEventsCalendarData({ data: { params: { siteId } } })
      .then((result) => {
        if (!cancelled) setData(result.success && result.data ? result.data : null)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [siteId, preloadedData])

  const events = useMemo(() => data?.events || [], [data])
  const today = todayDateString()

  // Group events by their wall-clock day for O(1) cell lookups.
  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventsCalendarEntry[]>()
    for (const entry of events) {
      const bucket = map.get(entry.date)
      if (bucket) bucket.push(entry)
      else map.set(entry.date, [entry])
    }
    return map
  }, [events])

  const upcoming = useMemo(() => events.filter((entry) => entry.date >= today), [events, today])
  const cells = useMemo(() => monthMatrix(cursor), [cursor])

  if (visibility.hideBlock === true) return null

  const showTitle = visibility.title !== false && Boolean(title)
  const showSubtitle = visibility.subtitle !== false && Boolean(subtitle)

  const goToday = () => {
    setCursor(parseYearMonth(today)!)
  }

  const jumpToDay = (date: string) => {
    const parsed = parseYearMonth(date)
    if (parsed) setCursor(parsed)
    setView("list")
  }

  return (
    <BlockContainer
      header={showTitle || showSubtitle
        ? {
            title: showTitle ? title : "",
            subtitle: showSubtitle ? subtitle : "",
            align: "left",
          }
        : undefined}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      <div className="space-y-4">
        {/* Toolbar: month navigation (month view only) + view toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {view === "month" ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setCursor((current) => addMonths(current, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-40 text-center text-base font-semibold" aria-live="polite">
                {formatMonthLabel(cursor)}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setCursor((current) => addMonths(current, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="ml-1" onClick={goToday}>
                Today
              </Button>
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={view === "month" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("month")}
              aria-pressed={view === "month"}
            >
              <CalendarDays className="mr-1.5 h-4 w-4" />
              Month
            </Button>
            <Button
              type="button"
              variant={view === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
            >
              <ListIcon className="mr-1.5 h-4 w-4" />
              List
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading events…</p>
        ) : view === "month" ? (
          <MonthGrid
            cells={cells}
            eventsByDate={eventsByDate}
            today={today}
            onShowMore={jumpToDay}
          />
        ) : (
          <EventList events={upcoming} />
        )}
      </div>
    </BlockContainer>
  )
}

function MonthGrid({
  cells,
  eventsByDate,
  today,
  onShowMore,
}: {
  cells: ReturnType<typeof monthMatrix>
  eventsByDate: Map<string, EventsCalendarEntry[]>
  today: string
  onShowMore: (date: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center">
            <span className="sm:hidden">{label.charAt(0)}</span>
            <span className="hidden sm:inline">{label}</span>
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const dayEvents = eventsByDate.get(cell.date) || []
          const isToday = cell.date === today
          const visibleEvents = dayEvents.slice(0, MAX_EVENTS_PER_DAY_CELL)
          const hiddenCount = dayEvents.length - visibleEvents.length

          return (
            <div
              key={cell.date}
              className={cn(
                "min-h-16 border-b border-r p-1.5 sm:min-h-28 [&:nth-child(7n)]:border-r-0",
                cell.inCurrentMonth ? "bg-background" : "bg-muted/30",
              )}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={cn(
                    "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs",
                    isToday && "bg-primary font-semibold text-primary-foreground",
                    !isToday && cell.inCurrentMonth && "text-foreground",
                    !isToday && !cell.inCurrentMonth && "text-muted-foreground",
                  )}
                >
                  {cell.day}
                </span>
              </div>

              <div className="space-y-1">
                {visibleEvents.map((entry) => (
                  <Link
                    key={entry.id}
                    href={eventHref(entry)}
                    className="block truncate rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/20"
                    title={entry.title}
                  >
                    {entry.time && (
                      <span className="mr-1 text-muted-foreground">{formatTimeLabel(entry.time)}</span>
                    )}
                    {entry.title}
                  </Link>
                ))}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onShowMore(cell.date)}
                    className="block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    +{hiddenCount} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventList({ events }: { events: EventsCalendarEntry[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">No upcoming events.</p>
      </div>
    )
  }

  return (
    <ul className="divide-y rounded-lg border">
      {events.map((entry) => {
        const image = resolveMediaUrl(entry.featuredImage)
        const timeLabel = formatTimeLabel(entry.time)

        return (
          <li key={entry.id}>
            <Link
              href={eventHref(entry)}
              className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex w-14 shrink-0 flex-col items-center rounded-md border bg-muted/40 py-1 text-center">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {formatDayLabel(entry.date).split(",")[0]}
                </span>
                <span className="text-lg font-semibold leading-tight">{Number(entry.date.split("-")[2])}</span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{entry.title}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDayLabel(entry.date)}
                  {timeLabel && ` · ${timeLabel}`}
                </p>
              </div>

              {image && (
                <img
                  src={image}
                  alt=""
                  className="hidden h-12 w-16 shrink-0 rounded-md border object-cover sm:block"
                />
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
