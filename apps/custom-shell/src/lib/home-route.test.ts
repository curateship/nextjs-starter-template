import { describe, expect, it } from "vitest"

import { configuredRouteTarget, withAccountTab } from "@/lib/home-route"

describe("configured home route", () => {
  it("keeps normalized internal routes", () => {
    expect(configuredRouteTarget(" /admin/media?tab=all#top ")).toBe(
      "/admin/media?tab=all#top"
    )
  })

  it.each([
    "",
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/",
    "/home",
    "/home/",
    "/home?account=billing",
    "/admin",
    "/admin/",
    "/admin?view=home",
  ])("rejects unsafe or looping target %s", (target) => {
    expect(configuredRouteTarget(target)).toBeNull()
  })
})

describe("account tab carried into the home redirect", () => {
  it("adds the tab to a bare target", () => {
    expect(withAccountTab("/admin/settings", "billing")).toBe(
      "/admin/settings?account=billing"
    )
  })

  it("keeps the target's own search and hash", () => {
    expect(withAccountTab("/admin/media?tab=all#top", "billing")).toBe(
      "/admin/media?tab=all&account=billing#top"
    )
  })

  it("replaces a tab the target already carried", () => {
    expect(withAccountTab("/admin/settings?account=profile", "billing")).toBe(
      "/admin/settings?account=billing"
    )
  })

  it.each([undefined, null, ""])(
    "leaves the target alone when no tab was asked for (%s)",
    (accountTab) => {
      expect(withAccountTab("/admin/settings", accountTab)).toBe(
        "/admin/settings"
      )
    }
  )

  // This value ends up in a redirect, so it must not be able to leave the app
  // however odd the target or the tab is.
  it.each([
    "https://evil.example.com/steal",
    "//evil.example.com/steal",
    "/\\evil.example.com",
  ])("cannot be talked into leaving the site via %s", (target) => {
    expect(withAccountTab(target, "billing")).not.toMatch(/evil\.example\.com/)
    expect(withAccountTab(target, "billing").startsWith("/")).toBe(true)
  })

  it("escapes a tab value instead of letting it add its own parameters", () => {
    expect(withAccountTab("/admin/settings", "billing&admin=1")).toBe(
      "/admin/settings?account=billing%26admin%3D1"
    )
  })
})
