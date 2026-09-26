import { describe, expect, it } from "vitest"

import type { Entitlements } from "@/server/billing/entitlements"
import {
  resolvePomodoroEntitlements,
} from "@/server/pomodoro/entitlements"

function shellEntitlements(
  overrides: Partial<Entitlements> = {}
): Entitlements {
  return {
    planId: null,
    planSlug: "free",
    planName: "Free",
    isPaid: false,
    status: "none",
    interval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    source: null,
    paused: false,
    pausedPlanName: null,
    features: {},
    ...overrides,
  }
}

describe("pomodoro entitlements", () => {
  it("refuses every perk on a free plan with no features", () => {
    const resolved = resolvePomodoroEntitlements(shellEntitlements())
    expect(resolved).toEqual({
      plan: "free",
      isPaid: false,
      canHostRooms: false,
      canUsePremiumMedia: false,
      canUploadMedia: false,
      canUseLongRangeReports: false,
      storageLimitBytes: 0,
      monthlyBackgrounds: 0,
      monthlySoundscapes: 0,
    })
  })

  it("unlocks everything on a paid plan with no explicit features", () => {
    const resolved = resolvePomodoroEntitlements(
      shellEntitlements({ planSlug: "pro", isPaid: true })
    )
    expect(resolved).toEqual({
      plan: "pro",
      isPaid: true,
      canHostRooms: true,
      canUsePremiumMedia: true,
      canUploadMedia: true,
      canUseLongRangeReports: true,
      storageLimitBytes: 2 * 1024 * 1024 * 1024,
      monthlyBackgrounds: 5,
      monthlySoundscapes: 20,
    })
  })

  it("lets an explicit plan value beat the paid/free default", () => {
    const gifted = resolvePomodoroEntitlements(
      shellEntitlements({ features: { hostRooms: true, monthlyBackgrounds: 2 } })
    )
    expect(gifted.canHostRooms).toBe(true)
    expect(gifted.monthlyBackgrounds).toBe(2)
    expect(gifted.canUploadMedia).toBe(false)

    const withheld = resolvePomodoroEntitlements(
      shellEntitlements({
        planSlug: "pro",
        isPaid: true,
        features: { uploadMedia: false, storageLimitBytes: 0 },
      })
    )
    expect(withheld.canUploadMedia).toBe(false)
    expect(withheld.storageLimitBytes).toBe(0)
    expect(withheld.canHostRooms).toBe(true)
  })

  it("a paused plan is not paid, so nothing is unlocked", () => {
    const resolved = resolvePomodoroEntitlements(
      shellEntitlements({ planSlug: "pro", isPaid: false, paused: true })
    )
    expect(resolved.canHostRooms).toBe(false)
    expect(resolved.storageLimitBytes).toBe(0)
  })

  it("an admin gets every perk without a plan", () => {
    const resolved = resolvePomodoroEntitlements(shellEntitlements(), {
      admin: true,
    })
    expect(resolved.plan).toBe("free")
    expect(resolved.isPaid).toBe(true)
    expect(resolved.canHostRooms).toBe(true)
    expect(resolved.canUploadMedia).toBe(true)
    expect(resolved.canUsePremiumMedia).toBe(true)
    expect(resolved.canUseLongRangeReports).toBe(true)
    expect(resolved.storageLimitBytes).toBeGreaterThan(0)
  })

  it("an admin on a paused plan still hosts rooms", () => {
    const resolved = resolvePomodoroEntitlements(
      shellEntitlements({ planSlug: "pro", isPaid: false, paused: true }),
      { admin: true }
    )
    expect(resolved.canHostRooms).toBe(true)
  })

  it("an admin still follows a plan that deliberately withholds a perk", () => {
    const resolved = resolvePomodoroEntitlements(
      shellEntitlements({ features: { hostRooms: false } }),
      { admin: true }
    )
    expect(resolved.canHostRooms).toBe(false)
    expect(resolved.canUploadMedia).toBe(true)
  })

  it("an admin keeps the numbers their own plan hands out", () => {
    const resolved = resolvePomodoroEntitlements(
      shellEntitlements({ features: { monthlyBackgrounds: 100 } }),
      { admin: true }
    )
    expect(resolved.monthlyBackgrounds).toBe(100)
  })
})
