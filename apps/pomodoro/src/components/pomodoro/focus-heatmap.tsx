import * as React from "react"

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatLongDay } from "@/lib/format/calendar-day"
import { formatFocusDuration, shiftLocalDate } from "@/lib/pomodoro/focus-history"
import { cn } from "@/lib/utils"

/**
 * The year of squares, one component for both places it is drawn.
 *
 * `/history` had it first and a public profile publishes the same grid, so
 * the grid lives here and both read it. Two copies would eventually disagree
 * about a shade or a day boundary, and the public one disagreeing with the
 * private one is exactly the bug nobody would notice.
 *
 * The day boundary is the account's own timezone, decided before the days
 * ever reach this component.
 */

export type HeatmapDay = {
  localDate: string
  focusSeconds: number
  /**
   * Added to a square's hover text when it is there. History has the number
   * and a public profile does not publish it, which is the one difference
   * between the two grids.
   */
  focusSessions?: number
}

/**
 * Fills the calendar gaps, so a day with no focus is an empty square rather
 * than a missing one. Ranges are bounded before they get here.
 */
export function fillHeatmapDays(
  startDate: string,
  endDate: string,
  days: readonly HeatmapDay[]
): HeatmapDay[] {
  const byDate = new Map(days.map((day) => [day.localDate, day.focusSeconds]))
  const filled: HeatmapDay[] = []
  for (let date = startDate; date <= endDate; date = shiftLocalDate(date, 1))
    filled.push({ localDate: date, focusSeconds: byDate.get(date) ?? 0 })
  return filled
}

function heatLevel(focusSeconds: number, maxSeconds: number) {
  if (focusSeconds <= 0 || maxSeconds <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((focusSeconds / maxSeconds) * 4)))
}

const HEAT_CLASSES = [
  "bg-[rgba(var(--p-fg-rgb),0.08)]",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-[var(--p-accent)]",
]

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"]

function squareTitle(day: HeatmapDay) {
  const head = `${formatLongDay(day.localDate)} · ${formatFocusDuration(day.focusSeconds)}`
  if (day.focusSessions === undefined) return head
  return `${head} · ${day.focusSessions} ${day.focusSessions === 1 ? "session" : "sessions"}`
}

/**
 * The week column each month starts in, with its short name. The first
 * column is named too, unless its month starts in the next one, so two names
 * never sit on top of each other.
 */
function monthStarts(days: readonly HeatmapDay[], leadingBlanks: number) {
  const starts: { date: string; column: number; label: string }[] = []
  days.forEach((day, index) => {
    if (index > 0 && !day.localDate.endsWith("-01")) return
    const column = Math.floor((leadingBlanks + index) / 7)
    if (starts.at(-1)?.column === column) starts.pop()
    starts.push({
      date: day.localDate,
      column,
      label: new Date(`${day.localDate}T12:00:00`).toLocaleDateString(
        undefined,
        { month: "short" }
      ),
    })
  })
  // A name needs about three columns of room before the next one.
  return starts.filter(
    (start, index) =>
      index === starts.length - 1 || starts[index + 1].column - start.column >= 3
  )
}

/** The year's total, read out instead of 365 squares. */
function heatmapSummary(days: readonly HeatmapDay[]) {
  const total = days.reduce((sum, day) => sum + day.focusSeconds, 0)
  const active = days.filter((day) => day.focusSeconds > 0).length
  return `Focus by day from ${formatLongDay(days[0].localDate)} to ${formatLongDay(days[days.length - 1].localDate)}: ${formatFocusDuration(total)} over ${active} ${active === 1 ? "day" : "days"}. Use the arrow keys to read a day.`
}

/**
 * The grid itself. `days` must already be gap-free and in date order;
 * `fillHeatmapDays` is what does that.
 *
 * It opens scrolled to the newest weeks, which is what people look at; a phone
 * used to open on last year with today off the right edge.
 *
 * One tooltip, not 365. It sits on whichever square is pointed at, tapped, or
 * reached with the arrow keys. A tooltip per square could never open on a
 * phone (a tooltip closes itself on a tap), and 365 tab stops is a wall for a
 * keyboard. The grid is one tab stop instead: arrows move a day up and down a
 * column and a week left and right, Home and End jump to the ends.
 */
export function FocusHeatmap({
  days,
  today,
}: {
  days: readonly HeatmapDay[]
  /** Ringed, when it is one of the days drawn. */
  today?: string
}) {
  const scroller = React.useRef<HTMLDivElement>(null)
  // The day the tooltip is on, and whether it is showing.
  const [active, setActive] = React.useState<string | null>(null)
  const [shown, setShown] = React.useState(false)
  // Set while a mouse or finger is pressing, so the grid taking focus from
  // that press does not jump the tooltip to today over the square pressed.
  const pressing = React.useRef(false)
  const lastDate = days.at(-1)?.localDate

  // On first draw, and whenever the range changes, start at the newest end.
  React.useLayoutEffect(() => {
    const viewport = scroller.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )
    if (viewport) viewport.scrollLeft = viewport.scrollWidth
  }, [lastDate, days.length])

  // A tap away from the grid puts a tapped tooltip away. A mouse leaving does
  // the same through onPointerLeave below.
  React.useEffect(() => {
    if (!shown) return
    const onPointerDown = (event: PointerEvent) => {
      if (!scroller.current?.contains(event.target as Node)) setShown(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [shown])

  if (!days.length) return null
  const maxSeconds = Math.max(...days.map((day) => day.focusSeconds), 0)
  // Monday-first columns, so the first column starts on the right weekday.
  const leadingBlanks =
    (new Date(`${days[0].localDate}T12:00:00`).getDay() + 6) % 7
  const activeDay = active
    ? days.find((day) => day.localDate === active)
    : undefined
  const weeks = Math.ceil((leadingBlanks + days.length) / 7)
  // 16px squares, so a year (53 weeks) fills the content column on a wide
  // screen and scrolls on a phone. The month row uses the same columns.
  const columns = { gridTemplateColumns: `repeat(${weeks}, 1rem)` }
  const months = monthStarts(days, leadingBlanks)

  const show = (date: string) => {
    setActive(date)
    setShown(true)
  }

  const moveBy = (step: number | "start" | "end") => {
    const at = days.findIndex((day) => day.localDate === active)
    const from = at === -1 ? days.length - 1 : at
    const next =
      step === "start"
        ? 0
        : step === "end"
          ? days.length - 1
          : Math.min(days.length - 1, Math.max(0, from + step))
    const date = days[next].localDate
    show(date)
    scroller.current
      ?.querySelector<HTMLElement>(`[data-date="${date}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }

  return (
    // `w-0 min-w-full` keeps a year of squares (about 850px) from widening
    // whatever holds it. A definite width of 0 takes this row out of the
    // minimum-width calculation its container does, and `min-w-full` draws
    // it at the width it actually has. Measured at 390px: without it the
    // page scrolled to 916px, with it the page is 390px and the squares
    // scroll inside their own box.
    <div className="flex w-0 min-w-full gap-2">
      {/* The top padding is the month row and the grid's own inset, so each
          name sits level with its 16px row of squares. */}
      <div
        className="grid shrink-0 auto-rows-[1rem] gap-1 self-start pt-[22px] font-mono text-[10px] text-muted-foreground"
        aria-hidden="true"
      >
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={index} className="flex items-center">
            {label}
          </span>
        ))}
      </div>
      {/* A year of squares is about 850px wide and a phone is 390px, so the
          grid has to scroll sideways on its own rather than widening the
          page. `min-w-0` is what lets the flex row shrink it: without it the
          grid sets the row's width and the whole page scrolls instead.
          ScrollArea rather than `overflow-x-auto`, so the bar is the thin
          themed one and not the fat grey browser bar. */}
      <ScrollArea ref={scroller} className="min-w-0 flex-1">
        <div
          aria-hidden="true"
          className="grid h-4 w-max gap-1 px-0.5 font-mono text-[10px] leading-4 text-muted-foreground"
          style={columns}
        >
          {months.map((month) => (
            <span
              key={month.date}
              // No width of its own, so a name runs over the next columns
              // instead of widening its own.
              className="w-0 whitespace-nowrap"
              style={{ gridColumnStart: month.column + 1 }}
            >
              {month.label}
            </span>
          ))}
        </div>
        <div
          role="group"
          tabIndex={0}
          aria-label={heatmapSummary(days)}
          className="mt-1 grid w-max grid-flow-col grid-rows-7 gap-1 rounded-sm p-0.5 pb-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={columns}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setShown(false)
          }}
          onPointerDown={() => {
            pressing.current = true
          }}
          // Cleared on the click, not on pointer up: after a tap the browser
          // focuses the grid only once the finger has lifted, just before
          // the click.
          onClick={() => {
            pressing.current = false
          }}
          onFocus={() => {
            if (pressing.current) return
            show(active ?? today ?? days[days.length - 1].localDate)
          }}
          onBlur={() => {
            pressing.current = false
            setShown(false)
          }}
          onKeyDown={(event) => {
            const steps: Record<string, number | "start" | "end"> = {
              ArrowUp: -1,
              ArrowDown: 1,
              ArrowLeft: -7,
              ArrowRight: 7,
              Home: "start",
              End: "end",
            }
            const step = steps[event.key]
            if (step === undefined) {
              if (event.key === "Escape") setShown(false)
              return
            }
            event.preventDefault()
            moveBy(step)
          }}
        >
          {Array.from({ length: leadingBlanks }, (_, index) => (
            <i key={`blank-${index}`} className="size-4 rounded-[3px]" />
          ))}
          {days.map((day) => {
            const square = (
              <i
                key={day.localDate}
                data-date={day.localDate}
                className={cn(
                  "size-4 rounded-[3px]",
                  HEAT_CLASSES[heatLevel(day.focusSeconds, maxSeconds)],
                  day.localDate === today && "ring-1 ring-[var(--p-accent-2)]",
                  day.localDate === active &&
                    shown &&
                    "outline-2 outline-offset-1 outline-foreground outline-solid"
                )}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") show(day.localDate)
                }}
                // A tap on a phone, or a click: shows that day and keeps it.
                onClick={() => show(day.localDate)}
              />
            )
            if (day.localDate !== active) return square
            return (
              <Tooltip key={day.localDate} open={shown}>
                <TooltipTrigger asChild>{square}</TooltipTrigger>
                <TooltipContent>{squareTitle(day)}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      {/* The tooltip is seen; this is what a screen reader hears as the
          arrow keys move. */}
      <span className="sr-only" aria-live="polite">
        {shown && activeDay ? squareTitle(activeDay) : ""}
      </span>
    </div>
  )
}

/** The Less-to-More key under the grid. */
export function FocusHeatmapKey() {
  return (
    <div
      className="flex items-center gap-1 text-[10px] text-muted-foreground"
      aria-hidden="true"
    >
      <span>Less</span>
      {HEAT_CLASSES.map((heat) => (
        <i key={heat} className={cn("size-3 rounded-[3px]", heat)} />
      ))}
      <span>More</span>
    </div>
  )
}
