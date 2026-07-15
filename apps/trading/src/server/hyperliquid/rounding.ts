import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils"

/**
 * Rounds a perp price to Hyperliquid's tick rules: at most 5 significant
 * figures and at most (6 - szDecimals) decimal places; integer prices are
 * always allowed. Delegates to the SDK's canonical formatter so our rounding
 * can never drift from what the exchange accepts.
 */
export function roundPrice(px: string | number, szDecimals: number): string {
  return formatPrice(px, szDecimals, "perp")
}

/** Moves a perp price one exchange-valid tick up or down. */
export function onePriceStep(
  px: string | number,
  szDecimals: number,
  direction: -1 | 1
): string {
  const value = Number(px)
  if (!(value > 0)) throw new Error("Price must be positive")
  // Immediately below a power of ten, one more decimal place becomes valid
  // (100 -> 99.999). Nudge downward before choosing the five-significant-digit
  // grid so we return the closest valid neighbour instead of skipping ticks.
  const neighbourMagnitude =
    direction === -1 ? value * (1 - Number.EPSILON) : value
  const significantStep = 10 ** (Math.floor(Math.log10(neighbourMagnitude)) - 4)
  const decimalStep = 10 ** -(6 - szDecimals)
  return roundPrice(
    value + direction * Math.max(significantStep, decimalStep),
    szDecimals
  )
}

/** Rounds an order size down to the market's szDecimals. */
export function roundSize(sz: string | number, szDecimals: number): string {
  return formatSize(sz, szDecimals)
}

/** Multiplies two decimal strings without float drift (used for notional). */
export function mulDecimal(a: string, b: string): string {
  const [aInt, aScale] = toScaledBigInt(a)
  const [bInt, bScale] = toScaledBigInt(b)
  return fromScaledBigInt(aInt * bInt, aScale + bScale)
}

/** Adds two decimal strings without float drift. */
export function addDecimal(a: string, b: string): string {
  const [aInt, aScale] = toScaledBigInt(a)
  const [bInt, bScale] = toScaledBigInt(b)
  const scale = Math.max(aScale, bScale)
  const scaledA = aInt * 10n ** BigInt(scale - aScale)
  const scaledB = bInt * 10n ** BigInt(scale - bScale)
  return fromScaledBigInt(scaledA + scaledB, scale)
}

/** Compares two decimal strings: -1, 0, or 1. */
export function cmpDecimal(a: string, b: string): number {
  const diff = addDecimal(a, negateDecimal(b))
  if (diff.startsWith("-")) return -1
  if (Number(diff) === 0) return 0
  return 1
}

function negateDecimal(value: string): string {
  if (value.startsWith("-")) return value.slice(1)
  return `-${value}`
}

function toScaledBigInt(value: string | number): [bigint, number] {
  const text = String(value).trim()
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Invalid decimal string: ${text}`)
  }
  const negative = text.startsWith("-")
  const unsigned = negative ? text.slice(1) : text
  const [intPart, fracPart = ""] = unsigned.split(".")
  const digits = BigInt(intPart + fracPart)
  return [negative ? -digits : digits, fracPart.length]
}

function fromScaledBigInt(value: bigint, scale: number): string {
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0")
  const intPart = digits.slice(0, digits.length - scale) || "0"
  const fracPart = scale > 0 ? digits.slice(digits.length - scale) : ""
  const trimmedFrac = fracPart.replace(/0+$/, "")
  const result = trimmedFrac ? `${intPart}.${trimmedFrac}` : intPart
  return negative && Number(result) !== 0 ? `-${result}` : result
}
