import * as React from "react"

import { toneClass } from "@/components/backtest/backtest-kpi"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * The rows of figures inside a side panel's card: a group's small capitals
 * heading, a result in bold on the right, a setting in plain type. Drawn the
 * same on a backtest's Result card and the Trade dashboard's details panel.
 */

/**
 * One named group: a small grey capitals heading over its lines. `small`
 * is for the Setup and Costs groups, whose lines are settings rather than
 * results, so they read a size down and not in bold.
 */
export function FigureGroup({
  title,
  small = false,
  children,
}: {
  title: string
  small?: boolean
  children: React.ReactNode
}) {
  return (
    // Tied to the card's width, so a long label shortens itself instead of
    // pushing the figure past the panel's edge.
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
      <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/80 uppercase">
        {title}
      </h3>
      <dl className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)]", small ? "gap-1 text-[13px]" : "gap-1.5 text-sm")}>
        {children}
      </dl>
    </section>
  )
}

/** A result: its name on the left, the figure in bold on the right, coloured when it made or lost money. */
export function FigureStat({
  label,
  value,
  note,
  tone,
  valueClassName,
}: {
  label: string
  value: string
  /** Added to the figure, such as the hide-profit blur. */
  valueClassName?: string
  /** What the figure is made of, on its tooltip. */
  note?: string | null
  tone?: number
}) {
  const figureText = (
    <dd
      className={cn(
        "shrink-0 font-semibold tabular-nums",
        value === "—" ? "text-muted-foreground" : toneClass(tone),
        valueClassName
      )}
    >
      {value}
    </dd>
  )
  return (
    <div className="flex items-baseline gap-3">
      <dt className="min-w-0 flex-1 truncate text-foreground/75">{label}</dt>
      {note ? (
        <Tooltip>
          <TooltipTrigger asChild>{figureText}</TooltipTrigger>
          <TooltipContent className="max-w-64">{note}</TooltipContent>
        </Tooltip>
      ) : (
        figureText
      )}
    </div>
  )
}

/** A setting: its name on the left, the value on the right, in plain type. A `note` goes on the value's tooltip. */
export function FigureLine({ label, value, note }: { label: string; value: string; note?: string }) {
  const valueText = (
    <dd
      className={cn(
        "max-w-[66%] shrink-0 text-right break-words tabular-nums",
        note && "underline decoration-dotted underline-offset-4"
      )}
    >
      {value}
    </dd>
  )
  return (
    // A long value, such as six exchanges after "Prices from", takes at most
    // two thirds of the line and wraps at the right; the name wraps in what
    // is left. Neither runs over the other.
    <div className="flex items-baseline gap-3">
      <dt className="min-w-0 flex-1 text-foreground/75">{label}</dt>
      {note ? (
        <Tooltip>
          <TooltipTrigger asChild>{valueText}</TooltipTrigger>
          <TooltipContent className="max-w-64">{note}</TooltipContent>
        </Tooltip>
      ) : (
        valueText
      )}
    </div>
  )
}
