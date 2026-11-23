import { formatUsdRounded } from "@/lib/trade/format"

/** Past this, a figure is shown as a phrase rather than a row of digits. */
const TOO_BIG = 1e15

/**
 * Money on a free tool's answer: "$37,783" above a hundred dollars, "$62.50"
 * below it. Compounding runs away fast, so anything past a quadrillion
 * dollars, or too big to count, reads "Over $1 quadrillion".
 */
export function formatToolMoney(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) >= TOO_BIG) {
    return value < 0 ? "Under -$1 quadrillion" : "Over $1 quadrillion"
  }
  return formatUsdRounded(value)
}

const COMPACT_USD = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})

/** Short money for a chart's side: "$37.8K", "$1.2M". */
export function formatAxisMoney(value: number): string {
  return `$${COMPACT_USD.format(value)}`
}

/** A fraction as a percent with two decimals: 0.012697 reads "1.27%". */
export function formatToolPercent(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction >= 1e6) return "Over 100,000,000%"
  return `${(fraction * 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`
}

/** The typed number with commas and spaces ignored, or null if it is not one. */
export function readDecimal(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "")
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}
