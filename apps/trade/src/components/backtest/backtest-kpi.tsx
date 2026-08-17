import { cn } from "@/lib/utils"

/**
 * One headline figure: a label, the number, and the quiet line under it saying
 * what the number is of.
 *
 * Ported from the old app's `Kpi`, and deliberately the same three-line shape —
 * a figure with no caption is a number nobody can check, and the caption is
 * where "of 2 tested" and "$49,583 in pot" live.
 *
 * **A cell in a ruled grid, not a card.** Fourteen cards down a narrow panel is
 * fourteen boxes with fourteen shadows, and the eye spends its time on the
 * boxes rather than the numbers. Ruled off from its neighbours by a single
 * hairline instead, the figures line up in columns and the panel reads as one
 * table of results — which is what it is. The extra room a card spent on its
 * own border goes into the number, which is the thing being read.
 *
 * The rules are bare `border-b` / `border-r` with no colour named, so they
 * follow the Divider lines setting like every other line in the app.
 */
export function BacktestKpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  /** Signed: above zero is green, below is red, absent is plain. */
  tone?: number
}) {
  return (
    // `odd:border-r` rules the left column off from the right one: in a
    // two-column grid the odd children are the left column.
    <div className="flex flex-col gap-0.5 border-b px-3 py-2 odd:border-r">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm leading-tight font-semibold tracking-tight tabular-nums",
          toneClass(tone)
        )}
      >
        {value}
      </span>
      <span className="text-[10px] leading-tight text-muted-foreground">
        {sub}
      </span>
    </div>
  )
}

/** Green above zero, red below, plain at zero or when there is no number. */
export function toneClass(tone: number | undefined): string | undefined {
  if (tone === undefined || tone === 0) return undefined
  return tone > 0
    ? "text-teal-600 dark:text-teal-400"
    : "text-red-600 dark:text-red-400"
}

/** "63%" from a share between 0 and 1. */
export function sharePct(won: number, of: number): string {
  if (of <= 0) return "—"
  return `${Math.round((won / of) * 100)}%`
}

/** "+15.46%" / "-21.51%" — the old app's `signedPct`. */
export function signedPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
}

/**
 * How long something lasted, in the plainest unit that fits — "12h", "6d".
 * Zero means it did not survive a single bar's close, which is worth saying.
 */
export function heldFor(milliseconds: number): string {
  if (milliseconds <= 0) return "under one candle"
  const hours = milliseconds / 3_600_000
  if (hours < 48) return `held ${Math.round(hours)}h`
  return `held ${Math.round(hours / 24)}d`
}
