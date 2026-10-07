import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
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
  "bg-[rgba(255,90,60,0.25)]",
  "bg-[rgba(255,90,60,0.45)]",
  "bg-[rgba(255,90,60,0.7)]",
  "bg-[var(--p-accent)]",
]

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"]

function squareTitle(day: HeatmapDay) {
  const head = `${formatLongDay(day.localDate)} · ${formatFocusDuration(day.focusSeconds)}`
  if (day.focusSessions === undefined) return head
  return `${head} · ${day.focusSessions} ${day.focusSessions === 1 ? "session" : "sessions"}`
}

/**
 * The grid itself. `days` must already be gap-free and in date order;
 * `fillHeatmapDays` is what does that.
 */
export function FocusHeatmap({
  days,
  today,
}: {
  days: readonly HeatmapDay[]
  /** Ringed, when it is one of the days drawn. */
  today?: string
}) {
  if (!days.length) return null
  const maxSeconds = Math.max(...days.map((day) => day.focusSeconds), 0)
  // Monday-first columns, so the first column starts on the right weekday.
  const leadingBlanks =
    (new Date(`${days[0].localDate}T12:00:00`).getDay() + 6) % 7

  return (
    // `w-0 min-w-full` keeps a year of squares (about 850px) from widening
    // whatever holds it. A definite width of 0 takes this row out of the
    // minimum-width calculation its container does, and `min-w-full` draws
    // it at the width it actually has. Measured at 390px: without it the
    // page scrolled to 916px, with it the page is 390px and the squares
    // scroll inside their own box.
    <div className="flex w-0 min-w-full gap-2" aria-hidden="true">
      <div className="grid shrink-0 grid-rows-7 gap-1 font-mono text-[9px] text-muted-foreground">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={index} className="h-3 leading-3">
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
      <ScrollArea className="min-w-0 flex-1">
        <div className="grid w-max grid-flow-col grid-rows-7 gap-1 pb-2">
          {Array.from({ length: leadingBlanks }, (_, index) => (
            <i key={`blank-${index}`} className="size-3 rounded-[3px]" />
          ))}
          {days.map((day) => (
            <i
              key={day.localDate}
              className={cn(
                "size-3 rounded-[3px]",
                HEAT_CLASSES[heatLevel(day.focusSeconds, maxSeconds)],
                day.localDate === today && "ring-1 ring-[var(--p-accent-2)]"
              )}
              title={squareTitle(day)}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
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
