import { describe, expect, it } from "vitest"

import {
  compactUsd,
  formatPrice,
  num,
  pct,
  profitFactor,
  shortAddress,
  signedCompactUsd,
  signedPct,
  signedUsd,
  toneClass,
  truncateWords,
  usd,
  usdWhole,
} from "@/lib/format"

describe("compactUsd", () => {
  it("keeps three meaningful digits with uppercase suffixes", () => {
    expect(compactUsd(1_437)).toBe("$1.44K")
    expect(compactUsd(12_345_678)).toBe("$12.3M")
    expect(compactUsd(558_400)).toBe("$558K")
    expect(compactUsd(2_100_000_000)).toBe("$2.1B")
  })

  it("crosses magnitude boundaries by rounding into the next unit", () => {
    expect(compactUsd(999)).toBe("$999")
    expect(compactUsd(1_000)).toBe("$1K")
    expect(compactUsd(999_999)).toBe("$1M")
    expect(compactUsd(999_999_999)).toBe("$1B")
    expect(compactUsd(9_996)).toBe("$10K")
  })

  it("renders negatives instead of a dash", () => {
    expect(compactUsd(-558_400)).toBe("-$558K")
    expect(compactUsd(-1_437)).toBe("-$1.44K")
    expect(compactUsd(-742)).toBe("-$742")
  })

  it("writes zero as $0 and reserves the dash for missing data", () => {
    expect(compactUsd(0)).toBe("$0")
    expect(compactUsd(-0.4)).toBe("$0")
    expect(compactUsd(Number.NaN)).toBe("—")
    expect(compactUsd("not a number")).toBe("—")
  })

  it("accepts the string amounts APIs return", () => {
    expect(compactUsd("558400")).toBe("$558K")
    expect(compactUsd("-1250000")).toBe("-$1.25M")
  })
})

describe("signedCompactUsd", () => {
  it("forces a plus on gains and leaves zero unsigned", () => {
    expect(signedCompactUsd(12_300)).toBe("+$12.3K")
    expect(signedCompactUsd(-820)).toBe("-$820")
    expect(signedCompactUsd(0)).toBe("$0")
  })
})

describe("usd family", () => {
  it("formats dollars with an ASCII minus before the sign", () => {
    expect(usd(1_234.56)).toBe("$1,234.56")
    expect(usd(-1_234.56)).toBe("-$1,234.56")
    expect(usdWhole(-820.4)).toBe("-$820")
  })

  it("decides the sign after rounding, so near-zero never reads -$0.00", () => {
    expect(usd(-0.001)).toBe("$0.00")
    expect(signedUsd(0.001)).toBe("$0.00")
    expect(usdWhole(-0.4)).toBe("$0")
  })

  it("signs gains explicitly in the signed variant", () => {
    expect(signedUsd(1_240.55)).toBe("+$1,240.55")
    expect(signedUsd(-820)).toBe("-$820.00")
    expect(signedUsd(1_240, 0)).toBe("+$1,240")
  })
})

describe("formatPrice", () => {
  it("uses the ladder: ≥1000 → 1dp, ≥1 → 4dp, <1 → 6dp", () => {
    expect(formatPrice(64_489.08)).toBe("64,489.1")
    expect(formatPrice(1.23456)).toBe("1.2346")
    expect(formatPrice(0.00001234)).toBe("0.000012")
  })

  it("trims trailing zeros and accepts strings", () => {
    expect(formatPrice("43.2100")).toBe("43.21")
    expect(formatPrice(1000)).toBe("1,000")
    expect(formatPrice("oops")).toBe("—")
  })
})

describe("percents", () => {
  it("pct writes magnitudes without a forced sign", () => {
    expect(pct(62.5, 1)).toBe("62.5%")
    expect(pct(-0.0042, 4)).toBe("-0.0042%")
    expect(pct(Number.NaN)).toBe("—")
  })

  it("signedPct signs changes and leaves zero unsigned", () => {
    expect(signedPct(2.1)).toBe("+2.10%")
    expect(signedPct(-0.85)).toBe("-0.85%")
    expect(signedPct(0)).toBe("0.00%")
    expect(signedPct(-0.001)).toBe("0.00%")
    expect(signedPct(3.14159, 1)).toBe("+3.1%")
  })
})

describe("small helpers", () => {
  it("num, toneClass, profitFactor, shortAddress, truncateWords", () => {
    expect(num(1234.567)).toBe("1,234.57")
    expect(num(1234.567, 0)).toBe("1,235")
    expect(num(Number.NaN)).toBe("—")
    expect(toneClass(5)).toBe("text-emerald-600")
    expect(toneClass(-5)).toBe("text-red-500")
    expect(toneClass(0)).toBe("text-muted-foreground")
    expect(profitFactor(null)).toBe("∞")
    expect(profitFactor(1.5)).toBe("1.50")
    expect(shortAddress("0x1234567890abcdef1234")).toBe("0x1234…1234")
    expect(truncateWords("one two three", 2)).toBe("one two…")
    expect(truncateWords("one two", 3)).toBe("one two")
  })
})
