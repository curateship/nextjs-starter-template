import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { focusRing } from "@/lib/layout/focus-ring"
import type { Change } from "@/lib/format/percent-change"
import { cn } from "@/lib/utils"

/**
 * The headline row a dashboard opens with: one card, the figures side by side,
 * hairlines between them.
 */

export type StatFigure = {
  /** Distinct per figure — two cards can share a label. */
  key: string
  /** Where this figure is explained in full. Not every figure has a page. */
  to?: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  /** What it was before, on the quiet line above the number. */
  before?: string | null
  value: string
  change?: Change | null
  /** What the change is measured against — "vs last month", "vs last week". */
  changeCaption?: string
  footer?: React.ReactNode
}

/**
 * How the figures lay out, and the one width at which they are all on a single
 * row. The hairlines are drawn only at that width.
 *
 * The old version drew them from `index < length - 1` with a fixed breakpoint,
 * which is right only while the column count happens to equal the figure count.
 * At any other width the last figure on a row kept a hairline pointing at
 * nothing. Drawing them only on a single row cannot have that bug, because at
 * every other size there are no hairlines at all — the gap separates them.
 */
const layouts: Record<number, { grid: string; divider: string }> = {
  1: { grid: "grid-cols-1", divider: "hidden" },
  2: { grid: "grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-0", divider: "hidden sm:block" },
  3: { grid: "grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-0", divider: "hidden sm:block" },
  4: {
    grid: "grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4 lg:gap-0",
    divider: "hidden lg:block",
  },
  5: {
    grid: "grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3 xl:grid-cols-5 xl:gap-0",
    divider: "hidden xl:block",
  },
}

const wideLayout = {
  grid: "grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3",
  divider: "hidden",
}

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
  const layout = layouts[figures.length] ?? wideLayout

  return (
    // `shrink-0` is load-bearing. A page renders straight into
    // `DashboardContent`, which is a flex column, so a tall page below this
    // strip squashes it — and `Card` hides what overflows, so the figures are
    // silently cut off and only the labels are left.
    <Card className={cn("shrink-0", className)}>
      <CardContent className={cn("grid", layout.grid)}>
        {figures.map((figure, index) => (
          <div key={figure.key} className="flex items-start">
            <StatFigureBody figure={figure} />
            {index < figures.length - 1 ? (
              <div
                className={cn(
                  "mx-4 h-full w-px shrink-0 bg-border xl:mx-6",
                  layout.divider
                )}
                aria-hidden
              />
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function StatFigureBody({ figure }: { figure: StatFigure }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-muted-foreground">
        <figure.icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate text-xs font-medium sm:text-sm">
          {figure.label}
        </span>
      </div>
      <p className="h-4 truncate text-xs text-muted-foreground/70 tabular-nums">
        {figure.before}
      </p>
      {/* Mono and tabular so the figures line up across the row and do not
          jump about as they change. */}
      <p className="font-mono text-2xl leading-tight font-semibold tracking-tight tabular-nums lg:text-[28px]">
        {figure.value}
      </p>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
        {figure.change ? (
          <ChangeBadge change={figure.change} caption={figure.changeCaption} />
        ) : null}
        <span className="text-muted-foreground">{figure.footer}</span>
      </div>
    </>
  )

  // A figure with nowhere to go is not a link — a keyboard stop that does
  // nothing is worse than no keyboard stop.
  if (!figure.to) {
    return <div className="min-w-0 flex-1 space-y-1">{body}</div>
  }

  return (
    <Link
      to={figure.to}
      className={cn(
        "group/figure -m-2 min-w-0 flex-1 space-y-1 rounded-lg p-2 transition-colors hover:bg-accent/40",
        focusRing
      )}
    >
      {body}
    </Link>
  )
}

export function ChangeBadge({
  change,
  caption = "vs last month",
}: {
  change: Change
  caption?: string
}) {
  const Icon = change.up ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    // Never colour alone: the arrow points the way the number went.
    <span
      className={cn(
        "flex items-center gap-0.5 font-medium whitespace-nowrap tabular-nums",
        change.up ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {change.up ? "+" : "-"}
      {Math.round(change.percent)}%
      {caption ? (
        <span className="ml-1 font-normal text-muted-foreground">{caption}</span>
      ) : null}
    </span>
  )
}
