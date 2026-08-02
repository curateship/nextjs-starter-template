import { describe, expect, it } from "vitest"

import { describePlanFeatures } from "@/lib/plan-features"

describe("plan feature bullets", () => {
  it("says the keys the live plans actually use", () => {
    expect(
      describePlanFeatures({
        sso: true,
        seats: 100,
        support: "dedicated",
        workspaces: 250,
      })
    ).toEqual([
      "Single sign-on",
      "100 seats",
      "Dedicated support",
      "250 workspaces",
    ])
  })

  it("counts one of something in the singular", () => {
    expect(describePlanFeatures({ seats: 1 })).toEqual(["1 seat"])
  })

  it("groups the digits of a big number", () => {
    expect(describePlanFeatures({ workspaces: 25000 })).toEqual([
      "25,000 workspaces",
    ])
  })

  it("says an unlisted kind of support in the same shape", () => {
    expect(describePlanFeatures({ support: "white_glove" })).toEqual([
      "White glove support",
    ])
  })

  it("still says something readable for a key it has no wording for", () => {
    expect(
      describePlanFeatures({
        customDomains: true,
        api_calls: 1000,
        region: "eu",
      })
    ).toEqual(["Custom domains", "1,000 api calls", "Region: eu"])
  })

  it("falls back when a known key carries a shape its wording misses", () => {
    expect(describePlanFeatures({ seats: "unlimited", sso: "saml" })).toEqual([
      "Seats: unlimited",
      "Sso: saml",
    ])
  })

  it("leaves out features that are switched off or blank", () => {
    expect(
      describePlanFeatures({ sso: false, seats: null, region: "" })
    ).toEqual([])
  })
})
