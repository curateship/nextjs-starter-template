import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * One headline figure: a label, the number, and the quiet line under it saying
 * what the number is of.
 *
 * Ported from the old app's `Kpi`, and deliberately the same three-line shape —
 * a figure with no caption is a number nobody can check, and the caption is
 * where "of 2 tested" and "$49,583 in pot" live.
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
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span
          className={cn(
            "font-mono text-base font-semibold tabular-nums",
            toneClass(tone)
          )}
        >
          {value}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">
          {sub}
        </span>
      </CardContent>
    </Card>
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
