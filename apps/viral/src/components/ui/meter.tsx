import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A bar showing one share of a whole — how many people are on a plan, how much
 * of a total one thing accounts for.
 *
 * `role="meter"`, not `progressbar`: nothing here is a task running towards
 * finishing, which is what a progress bar means to a screen reader. A meter is
 * a reading on a scale, which is exactly what these are.
 *
 * `label` is required on purpose. A bare bar states its value by length and
 * colour and nothing else, which leaves anyone not looking at it with nothing;
 * making the name impossible to leave out is what stops that happening.
 */

const tones = {
  default: "bg-primary",
  muted: "bg-muted-foreground/40",
  positive: "bg-emerald-500 dark:bg-emerald-400",
  warning: "bg-amber-500 dark:bg-amber-400",
  critical: "bg-destructive",
} as const

export type MeterProps = {
  value: number
  /** What the value is out of. Defaults to 100, so a bare percent just works. */
  max?: number
  /** What this bar is a reading of — announced in place of the bar itself. */
  label: string
  /** How to say the value out loud. Falls back to the percentage. */
  valueText?: string
  tone?: keyof typeof tones
  size?: "sm" | "default"
  className?: string
}

export function Meter({
  value,
  max = 100,
  label,
  valueText,
  tone = "default",
  size = "default",
  className,
}: MeterProps) {
  // A plan nobody is on divides by a total of zero, and a bar of `NaN%` wide
  // renders as a full bar in some browsers and none in others.
  const ceiling = Number.isFinite(max) && max > 0 ? max : 0
  const reading = Number.isFinite(value) ? Math.min(Math.max(value, 0), ceiling) : 0
  const percent = ceiling ? (reading / ceiling) * 100 : 0

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={reading}
      aria-valuemin={0}
      aria-valuemax={ceiling}
      aria-valuetext={valueText ?? `${Math.round(percent)}%`}
      className={cn(
        "w-full overflow-hidden rounded-full bg-muted",
        size === "sm" ? "h-1" : "h-1.5",
        className
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] motion-reduce:transition-none",
          tones[tone]
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

/** The usual arrangement: what it is and what it reads, then the bar under it. */
export function MeterRow({
  label,
  value,
  meter,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  meter: MeterProps
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm">{label}</span>
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {value}
        </span>
      </div>
      <Meter {...meter} />
    </div>
  )
}
