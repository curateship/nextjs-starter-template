import { describe, expect, it } from "vitest"

import { readPricingChoice } from "@/lib/billing/pricing-choice"

describe("pricing choice search", () => {
  it("keeps a valid plan and billing period", () => {
    expect(readPricingChoice({ plan: "team-pro", interval: "yearly" })).toEqual(
      { plan: "team-pro", interval: "yearly" }
    )
  })

  it("drops malformed values instead of trusting the address bar", () => {
    expect(
      readPricingChoice({ plan: "../../admin", interval: "sometimes" })
    ).toEqual({ plan: undefined, interval: undefined })
  })
})
