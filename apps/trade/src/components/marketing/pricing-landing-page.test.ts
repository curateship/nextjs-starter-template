import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string
    heading: string
    intro: string
    kind: "text" | "plans"
    layout: "wide" | "narrow"
  }>,
  loadCurrentUser: vi.fn(),
  loadPublicPricing: vi.fn(),
  loadBillingOverview: vi.fn(),
  loadBranding: vi.fn(),
}))

vi.mock("@/lib/api/shell", () => ({
  loadBranding: api.loadBranding,
}))

vi.mock("@/lib/api/auth/auth", () => ({
  loadCurrentUser: api.loadCurrentUser,
}))

vi.mock("@/lib/api/billing/billing", () => ({
  loadPublicPricing: api.loadPublicPricing,
  loadBillingOverview: api.loadBillingOverview,
}))

import {
  loadPricingLandingData as loadPricingLandingDataWithRoot,
  pricingLandingPage,
} from "@/components/marketing/pricing-landing-page"

async function loadPricingLandingData() {
  return (await pricingLandingPage.loader?.()) as {
    frontPageRows: typeof api.rows
    billingEnabled: boolean
  }
}

describe("front page row loading", () => {
  beforeEach(() => {
    api.rows = []
    api.loadCurrentUser.mockReset().mockResolvedValue(null)
    api.loadPublicPricing.mockReset().mockResolvedValue({
      plans: [],
      billingEnabled: true,
    })
    api.loadBillingOverview.mockReset()
    api.loadBranding.mockReset().mockImplementation(async () => ({
      frontPageRows: api.rows,
    }))
  })

  it("keeps the existing pricing landing data when no rows are saved", async () => {
    const data = await loadPricingLandingData()

    expect(data.frontPageRows).toEqual([])
    expect(data.billingEnabled).toBe(true)
    expect(api.loadCurrentUser).toHaveBeenCalledOnce()
    expect(api.loadPublicPricing).toHaveBeenCalledOnce()
  })

  it("does not load billing for a front page made only from text", async () => {
    api.rows = [
      {
        id: "welcome",
        heading: "Welcome",
        intro: "Read all about us.",
        kind: "text",
        layout: "narrow",
      },
    ]

    const data = await loadPricingLandingData()

    expect(data.frontPageRows).toEqual(api.rows)
    expect(api.loadCurrentUser).not.toHaveBeenCalled()
    expect(api.loadPublicPricing).not.toHaveBeenCalled()
  })

  it("loads the real plans when a composed row asks for them", async () => {
    api.rows = [
      {
        id: "plans",
        heading: "Choose a plan",
        intro: "Start free.",
        kind: "plans",
        layout: "wide",
      },
    ]

    const data = await loadPricingLandingData()

    expect(data.frontPageRows).toEqual(api.rows)
    expect(api.loadCurrentUser).toHaveBeenCalledOnce()
    expect(api.loadPublicPricing).toHaveBeenCalledOnce()
  })

  it("reuses front page rows already loaded by the root route", async () => {
    const rows = [
      {
        id: "welcome",
        heading: "Welcome",
        intro: "Start here.",
        kind: "text" as const,
        layout: "narrow" as const,
      },
    ]

    const data = await loadPricingLandingDataWithRoot(rows)

    expect(data.frontPageRows).toEqual(rows)
    expect(api.loadBranding).not.toHaveBeenCalled()
  })
})
