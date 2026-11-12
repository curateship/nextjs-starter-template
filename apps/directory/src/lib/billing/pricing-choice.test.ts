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
  it("keeps the pricing choice and a carried email", () => {
    expect(
      readRegistrationChoice({
        plan: "pro",
        interval: "monthly",
        email: "ada@example.com",
      })
    ).toEqual({
      plan: "pro",
      interval: "monthly",
      email: "ada@example.com",
    })
  })

  it("drops an old invite link's code so the page opens as a plain signup", () => {
    expect(readRegistrationChoice({ ref: "a".repeat(32) })).toEqual({
      plan: undefined,
      interval: undefined,
    })
  })
})
