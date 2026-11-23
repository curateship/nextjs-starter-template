import { describe, expect, it } from "vitest"

import { configuredRouteTarget } from "@/lib/home-route"

describe("configured home route", () => {
  it("keeps normalized internal routes", () => {
    expect(configuredRouteTarget(" /admin/rooms?view=all#top ")).toBe(
      "/admin/rooms?view=all#top"
    )
  })

  it("keeps the public timer route, which is a real page in this app", () => {
    expect(configuredRouteTarget("/")).toBe("/")
  })

  it.each([
    "",
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/admin",
    "/admin/",
    "/admin?view=home",
  ])("rejects unsafe or looping target %s", (target) => {
    expect(configuredRouteTarget(target)).toBeNull()
  })
})
