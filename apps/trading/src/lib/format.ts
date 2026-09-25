/**
 * The one number-formatting rulebook for the whole app. Every dashboard —
 * trading terminal, scanner, backtests, bots, journal, P&L — writes money,
 * prices, and percentages through these helpers so the same value reads the
 * same everywhere.
 *
 * The canonical rules (decided once, here):
 *
 * - **Suffixes are uppercase**: $558K, $12.3M, $2.1B — never "k".
 * - **Compact money keeps three meaningful digits**: $1.44K, $12.3M, $558K,
 *   $2.1B. Trailing zeros are trimmed ($2.10B → $2.1B), and rounding that
 *   lands on 1,000 of a unit carries into the next ($999,999 → $1M).
 * - **Negative money renders** with an ASCII minus before the dollar sign:
 *   -$558K, -$1,234.56. A dash ("—") means *missing data only* — a real
 *   negative or zero is always written out.
 * - **The sign follows the rounded value**: an amount that rounds to zero
 *   shows as $0.00, never -$0.00 or +$0.00. Zero is always unsigned.
 * - **Signed variants force a leading "+"** on gains (+$12.34, +2.10%);
 *   unsigned variants show a minus only when negative. Percent *changes*
 *   (24h move, P&L return) use the signed form; percent *magnitudes*
 *   (win rate, margin used) use the unsigned form.
 * - **Prices carry no dollar sign** and use one precision ladder:
 *   ≥ 1,000 → up to 1 decimal; ≥ 1 → up to 4; below 1 → up to 6 — with
 *   trailing zeros trimmed ("64,489.1", "1.2345", "0.000012").
 */

function isMissing(value: number): boolean {
  return !Number.isFinite(value)
}

/** A plain locale number at a fixed decimal count, e.g. `1,234.56`. */
export function num(value: number, digits = 2): string {
  if (isMissing(value)) return "—"
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Dollars with cents by default: `$1,234.56` / `-$1,234.56`. */
export function usd(value: number, digits = 2): string {
  if (isMissing(value)) return "—"
  const factor = 10 ** digits
  const rounded = Math.round(value * factor) / factor
  return `${rounded < 0 ? "-" : ""}$${num(Math.abs(rounded), digits)}`
}

/** Whole dollars, no cents — for headline tiles too narrow to fit them. */
export function usdWhole(value: number): string {
  return usd(value, 0)
}

/** Dollars with a forced "+" on gains: `+$12.34` / `-$820`. Zero is `$0.00`. */
export function signedUsd(value: number, digits = 2): string {
  if (isMissing(value)) return "—"
  const factor = 10 ** digits
  const rounded = Math.round(value * factor) / factor
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : ""
  return `${sign}$${num(Math.abs(rounded), digits)}`
}

/**
 * Compact dollars for volumes, notionals, and tight tiles: three meaningful
 * digits with an uppercase suffix — `$1.44K`, `$12.3M`, `$558K`, `$2.1B`.
 * Accepts the string amounts APIs return. Negative values render (`-$558K`);
 * only unreadable input earns the dash.
 */
export function compactUsd(value: number | string): string {
  const parsed = Number(value)
  if (isMissing(parsed)) return "—"
  const body = compactAbs(Math.abs(parsed))
  return `${parsed < 0 && body !== "0" ? "-" : ""}$${body}`
}

/** Compact dollars with a forced "+" on gains: `+$12.3K` / `-$820`. */
export function signedCompactUsd(value: number | string): string {
  const parsed = Number(value)
  if (isMissing(parsed)) return "—"
  const body = compactAbs(Math.abs(parsed))
  const sign = body === "0" ? "" : parsed > 0 ? "+" : parsed < 0 ? "-" : ""
  return `${sign}$${body}`
}

const COMPACT_UNITS = [
  { floor: 1e9, suffix: "B" },
  { floor: 1e6, suffix: "M" },
  { floor: 1e3, suffix: "K" },
] as const

/** `abs` ≥ 0 → "1.44K" / "558K" / "2.1B" / "742" / "0". */
function compactAbs(abs: number): string {
  for (const [index, unit] of COMPACT_UNITS.entries()) {
    if (abs < unit.floor) continue
    const scaled = abs / unit.floor
    const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0
    const rounded = Number(scaled.toFixed(digits))
    // Rounding can land on 1,000 of this unit ($999,999 → "1000K") — that
    // amount belongs to the unit above ($1M).
    if (rounded >= 1000 && index > 0) {
      return `1${COMPACT_UNITS[index - 1].suffix}`
    }
    // toLocaleString trims the trailing zeros toFixed would keep ($2.10B →
    // $2.1B).
    return `${rounded.toLocaleString("en-US", { maximumFractionDigits: digits })}${unit.suffix}`
  }
  return Math.round(abs).toLocaleString("en-US")
}

/**
 * A price as a bare number (no dollar sign) on one precision ladder:
 * ≥ 1,000 → up to 1 decimal, ≥ 1 → up to 4, below 1 → up to 6.
 * Accepts the string prices the exchange APIs return.
 */
export function formatPrice(value: string | number): string {
  const parsed = Number(value)
  if (isMissing(parsed)) return "—"
  const abs = Math.abs(parsed)
  const maximumFractionDigits = abs >= 1000 ? 1 : abs >= 1 ? 4 : 6
  return parsed.toLocaleString("en-US", { maximumFractionDigits })
}

/**
 * A percent magnitude (win rate, margin used, distance): `62.5%`, `-0.0042%`.
 * No forced plus — use {@link signedPct} for changes and returns.
 */
export function pct(value: number, digits = 2): string {
  if (isMissing(value)) return "—"
  const factor = 10 ** digits
  const rounded = Math.round(value * factor) / factor
  return `${rounded.toFixed(digits)}%`
}

/** A percent change with its direction: `+2.10%` / `-0.85%`. Zero is unsigned. */
export function signedPct(value: number, digits = 2): string {
  if (isMissing(value)) return "—"
  const factor = 10 ** digits
  const rounded = Math.round(value * factor) / factor
  const sign = rounded > 0 ? "+" : ""
  return `${sign}${rounded.toFixed(digits)}%`
}

/** Tailwind text tone by sign: gains green, losses red, flat muted. */
export function toneClass(value: number): string {
  if (value > 0) return "text-emerald-600"
  if (value < 0) return "text-red-500"
  return "text-muted-foreground"
}

/** ∞ when a side never lost (null profit factor). */
export function profitFactor(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "∞" : value.toFixed(2)
}

/**
 * Trade-duration label for the result box. Under a day reads in hours (and
 * under an hour in minutes): "0.34d" is unreadable for an 8-hour trade.
 */
export function formatFocusDays(days: number): string {
  const hours = days * 24
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`
  if (days < 1) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`
  return `${days.toFixed(days < 10 ? 1 : 0)}d`
}

/** `0xabc123…def4` — wallet addresses in tables and chips. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** Trims a title to at most `maxWords` words, adding an ellipsis when cut. */
export function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/)
  if (words.length <= maxWords) return text
  return `${words.slice(0, maxWords).join(" ")}…`
}

/** A run's window length in whole days. */
export function windowDaysOf(run: {
  startTime: string
  endTime: string
}): number {
  return Math.max(
    1,
    Math.round(
      (Date.parse(run.endTime) - Date.parse(run.startTime)) / 86_400_000
    )
  )
}
