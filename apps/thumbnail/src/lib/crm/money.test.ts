import { describe, expect, it } from "vitest"

import { CRM_MAX_VALUE_CENTS } from "@/lib/crm/crm"
import { centsToDollars, dollarsToCents } from "@/lib/crm/money"

describe("dollarsToCents", () => {
  it("reads whole dollars", () => {
    expect(dollarsToCents("4800")).toBe(480_000)
  })

  it("reads cents", () => {
    expect(dollarsToCents("1250.50")).toBe(125_050)
  })

  it("ignores the dollar sign and the commas somebody types", () => {
    expect(dollarsToCents("$4,800")).toBe(480_000)
  })

  it("rounds a third of a cent rather than keeping a fraction of one", () => {
    expect(dollarsToCents("0.005")).toBe(1)
    expect(dollarsToCents("0.004")).toBe(0)
  })

  it("treats an empty box as nothing owed, not as unreadable", () => {
    expect(dollarsToCents("")).toBe(0)
    expect(dollarsToCents("$")).toBe(0)
  })

  it("answers null for something that is not a number", () => {
    // Two decimal points is what a half-typed "1.2.3" looks like.
    expect(dollarsToCents("1.2.3")).toBeNull()
  })

  it("caps at ten million dollars rather than storing a typo", () => {
    expect(dollarsToCents("99999999999")).toBe(CRM_MAX_VALUE_CENTS)
  })
})

describe("centsToDollars", () => {
  it("shows nothing for nothing, so the box reads empty rather than 0", () => {
    expect(centsToDollars(0)).toBe("")
  })

  it("shows whole dollars without a decimal tail", () => {
    expect(centsToDollars(480_000)).toBe("4800")
  })

  it("shows the cents when there are any", () => {
    expect(centsToDollars(125_050)).toBe("1250.5")
  })
})
