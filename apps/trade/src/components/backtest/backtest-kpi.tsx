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
    <div className="flex flex-col gap-0.5 border-b px-5 py-2 odd:border-r">
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

/**
 * "+1,118%" / "-22%" / "-0.2%" — a percent at the precision it is worth
 * reading at.
 *
 * **Two decimals were noise on every figure this screen shows.** A run up
 * eleven times over reported "+1117.82%", where the last three characters are
 * a rounding artefact of a made-up pot, and a drawdown of "-22.04%" is a
 * drawdown of 22%. Under ten it keeps one decimal, because there the small
 * part is the whole story: a trade that returned 0.2% must not read as 0%.
 */
export function signedPct(value: number): string {
  return `${value >= 0 ? "+" : "-"}${roundedPct(Math.abs(value))}`
}

const WHOLE_USD = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

/**
 * "$111,782" / "-$1,250" — whole dollars, always.
 *
 * **Always, because a column is read down.** The shared `formatUsdRounded`
 * keeps the pence under a hundred dollars, which is right for one figure on
 * its own and wrong for a table: a P&L column came out as -$52.68, -$92.01,
 * -$207, $2,199 — half the rows carrying decimals the others did not, which
 * reads as a broken column rather than a considered one.
 *
 * Under a dollar rounds to "$0", and that is the right answer here: against a
 * pot in the tens of thousands, forty-five cents is nothing, and the colour of
 * the figure already says which way it went.
 */
export function usd(value: number): string {
  const whole = Math.round(Math.abs(value))
  // No sign on a rounded-away figure. Forty-five pence lost is "$0", never
  // "-$0", which reads as a broken minus rather than as nothing.
  const sign = whole > 0 && value < 0 ? "-" : ""
  return `${sign}$${WHOLE_USD.format(whole)}`
}

/** The same, with its sign always shown — "+$111,782". */
export function signedUsd(value: number): string {
  const whole = Math.round(Math.abs(value))
  if (whole === 0) return usd(0)
  return `${value > 0 ? "+" : ""}${usd(value)}`
}

/** The same rounding without a sign in front — "22%", "0.2%". */
export function roundedPct(value: number): string {
  const size = Math.abs(value)
  if (size < 10) return `${trimZero(size.toFixed(1))}%`
  return `${Math.round(size).toLocaleString("en-US")}%`
}

/** "0.0" reads as a figure measured to a tenth; "0" is the honest version. */
function trimZero(text: string): string {
  return text.endsWith(".0") ? text.slice(0, -2) : text
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
