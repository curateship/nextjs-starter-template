import { describe, expect, it } from "vitest"

import {
  readPricingChoice,
  readRegistrationChoice,
} from "@/lib/billing/pricing-choice"

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

describe("registration choice search", () => {
  it("keeps a valid invite code with the pricing choice", () => {
    expect(
      readRegistrationChoice({
        plan: "pro",
        interval: "monthly",
        ref: "A".repeat(32),
      })
    ).toEqual({
      plan: "pro",
      interval: "monthly",
      ref: "a".repeat(32),
    })
  })

  it("marks a malformed invite code so registration can refuse it", () => {
    expect(readRegistrationChoice({ ref: "not-a-code" })).toEqual({
      plan: undefined,
      interval: undefined,
      invalidReferral: true,
    })
  })
})
