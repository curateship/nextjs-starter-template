import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react"
import { Area, AreaChart, YAxis } from "recharts"

import { Card } from "@/components/ui/card"
import { focusRingInset } from "@/lib/layout/focus-ring"
import type { Change } from "@/lib/format/percent-change"
import { cn } from "@/lib/utils"

/**
 * The headline row a dashboard opens with: one card, the figures side by side,
 * a hairline between each.
 *
 * Each figure reads top to bottom: its name, the number, how far it moved
 * since last time, a dashed line, then a few small facts about it. A figure
 * with a history also draws it as a small line in its top right corner.
 */

export type StatFigure = {
  /** Distinct per figure — two cards can share a label. */
  key: string
  /** Where this figure is explained in full. Not every figure has a page. */
  to?: string
  label: string
  value: string
  change?: Change | null
  /** What the change is measured against — "vs last month", "vs last week". */
  changeCaption?: string
  /**
   * Said in place of the change when there is none to show — "None last
   * month", "No history kept". A figure with neither leaves the line empty.
   */
  changeNote?: string
  /**
   * The figure over time, oldest first, drawn as the small line. The line
   * takes the change's colour: green up, red down, grey level.
   */
  trend?: number[]
  /** The small facts under the dashed line. Several sit side by side. */
  footer?: React.ReactNode | React.ReactNode[]
}

/**
 * How the figures lay out, and the one width at which they are all on a single
 * row. The hairlines between figures are drawn only at that width, and a
 * single column gets them across instead.
 *
 * At every size in between there are no hairlines, only the padding. A
 * hairline drawn after every figure but the last is right only while the
 * column count equals the figure count, and at any other width the last
 * figure on a row would keep one pointing at nothing.
 */
const layouts: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 max-sm:divide-y sm:grid-cols-2 sm:divide-x",
  3: "grid-cols-1 max-sm:divide-y sm:grid-cols-3 sm:divide-x",
  4: "grid-cols-1 max-sm:divide-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x",
  5: "grid-cols-1 max-sm:divide-y sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:divide-x",
}

const wideLayout = "grid-cols-1 max-sm:divide-y sm:grid-cols-2 lg:grid-cols-3"

export function StatStrip({
  figures,
  className,
}: {
  figures: StatFigure[]
  /**
   * What the strip gets where it sits. On the Overview it is a widget an admin
   * can drag into a column, and a column hands its card the class that fills
   * the panel.
   */
  className?: string
}) {
  // The change line is kept on every figure once any figure has one, so the
  // dashed lines and the facts under them sit level across the row.
  const hasChangeLine = figures.some(
    (figure) => figure.change || figure.changeNote
  )

  return (
    // `shrink-0` is load-bearing. A page renders straight into
    // `DashboardContent`, which is a flex column, so a tall page below this
    // strip squashes it — and `Card` hides what overflows, so the figures are
    // silently cut off and only the labels are left.
    //
    // `max-h-none` comes after `className` so it wins. The Overview caps
    // everything in its top slot to keep a chart card from taking the whole
    // window, and that cap would cut the second row off this strip on a
    // screen too narrow for all five figures side by side.
    <Card className={cn("shrink-0 gap-0 py-0", className, "max-h-none")}>
      <div className={cn("grid", layouts[figures.length] ?? wideLayout)}>
        {figures.map((figure) => (
          <StatFigureCell
            key={figure.key}
            figure={figure}
            hasChangeLine={hasChangeLine}
          />
        ))}
      </div>
    </Card>
  )
}

function StatFigureCell({
  figure,
  hasChangeLine,
}: {
  figure: StatFigure
  hasChangeLine: boolean
}) {
  const direction = changeDirection(figure.change)
  const footer = Array.isArray(figure.footer) ? figure.footer : [figure.footer]
  const hasFooter = footer.some((item) => item != null && item !== "")

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="truncate text-sm text-muted-foreground"
            title={figure.label}
          >
            {figure.label}
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
            {figure.value}
          </p>
        </div>
        {figure.trend && figure.trend.length > 1 ? (
          // Only once the figure is wide enough to hold it beside the label.
          // Squeezed in any narrower, it would cut the label short instead.
          <Sparkline
            values={figure.trend}
            className={cn(
              "hidden h-10 w-24 shrink-0 @[15rem]/figure:block",
              trendColour[direction]
            )}
          />
        ) : null}
      </div>

      {hasChangeLine ? (
        <div className="mt-4 flex h-5 min-w-0 items-center gap-2 text-sm whitespace-nowrap">
          {figure.change ? (
            <>
              <span
                className={cn("font-medium tabular-nums", changeColour[direction])}
              >
                {formatChange(figure.change, direction)}
              </span>
              {figure.changeCaption ? (
                <>
                  <span className="text-muted-foreground" aria-hidden>
                    ·
                  </span>
                  <span className="truncate text-muted-foreground">
                    {figure.changeCaption}
                  </span>
                </>
              ) : null}
            </>
          ) : (
            <span className="truncate text-muted-foreground">
              {figure.changeNote}
            </span>
          )}
        </div>
      ) : null}

      {hasFooter ? (
        <div className="mt-4 flex min-w-0 flex-wrap gap-x-4 gap-y-1 border-t border-dashed pt-4 text-sm text-foreground/80">
          {footer.map((item, index) =>
            item == null || item === "" ? null : (
              <span key={index} className="whitespace-nowrap">
                {item}
              </span>
            )
          )}
        </div>
      ) : null}
    </>
  )

  // The cell is a container so the line can ask how wide the cell is, not
  // how wide the window is. The same figure is roomy on one dashboard and
  // cramped on another depending on how many sit beside it.
  const cell = "@container/figure min-w-0 px-6 py-5"

  // A figure with nowhere to go is not a link — a keyboard stop that does
  // nothing is worse than no keyboard stop.
  if (!figure.to) {
    return <div className={cell}>{body}</div>
  }

  return (
    <Link
      to={figure.to}
      className={cn(
        cell,
        "transition-colors hover:bg-accent/40",
        // Inside, because the cell fills the card edge to edge and the card
        // would cut an outside ring off.
        focusRingInset
      )}
    >
      {body}
    </Link>
  )
}

type Direction = "up" | "down" | "level"

/**
 * A change of nothing is level, not up — it is drawn grey, with no sign. So is
 * one too small to show at one decimal place, or it would read "+0.0%" in
 * green.
 */
function changeDirection(change: Change | null | undefined): Direction {
  if (!change || Math.round(change.percent * 10) === 0) return "level"
  return change.up ? "up" : "down"
}

const changeColour: Record<Direction, string> = {
  up: "text-emerald-700 dark:text-emerald-400",
  down: "text-destructive",
  level: "text-muted-foreground",
}

const trendColour: Record<Direction, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-destructive",
  level: "text-muted-foreground/70",
}

/**
 * "+33.3%", "−100.0%", "0.0%". The sign says which way it went, so the figure
 * still reads without its colour.
 */
function formatChange(change: Change, direction: Direction) {
  const sign = { up: "+", down: "−", level: "" }[direction]
  return `${sign}${change.percent.toFixed(1)}%`
}

/**
 * The small line in a figure's corner. No axes, no tooltip: it shows the
 * shape, and the number beside it is the figure.
 *
 * It draws in `currentColor`, so the class on it picks the colour and dark
 * mode comes for free.
 */
function Sparkline({
  values,
  className,
}: {
  values: number[]
  className?: string
}) {
  const gradientId = React.useId()
  const data = values.map((value, index) => ({ index, value }))

  // A little room above and below the line, so it never runs along the very
  // edge. A line that never moves has no range to take room from, so it gets
  // one of its own and sits in the middle.
  const low = Math.min(...values)
  const high = Math.max(...values)
  const room = (high - low) * 0.1 || 1

  return (
    <div className={className} aria-hidden>
      <AreaChart
        width={96}
        height={40}
        data={data}
        margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.15} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[low - room, high + room]} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="currentColor"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </div>
  )
}

/**
 * The pill form of a change, for a card that carries one beside its own
 * heading rather than in a headline row.
 */
export function ChangeBadge({
  change,
  caption = "vs last month",
}: {
  change: Change
  caption?: string
}) {
  const Icon = change.up ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    // Never colour alone: the arrow points the way the number went, so the pill
    // still reads in greyscale.
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span
        className={cn(
          "flex items-center gap-0.5 rounded-full px-2 py-0.5 font-medium tabular-nums",
          change.up
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "bg-destructive/10 text-destructive"
        )}
      >
        <Icon className="size-3 shrink-0" aria-hidden />
        {change.up ? "+" : "-"}
        {Math.round(change.percent)}%
      </span>
      {caption ? (
        <span className="font-normal text-muted-foreground">{caption}</span>
      ) : null}
    </span>
  )
}
