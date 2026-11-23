import { describe, expect, it } from "vitest"

import { configuredRouteTarget } from "@/lib/home-route"

describe("configured home route", () => {
  it("keeps normalized internal routes", () => {
    expect(configuredRouteTarget(" /admin/contacts?tab=all#top ")).toBe(
      "/admin/contacts?tab=all#top"
    )
  })

  it.each([
    "",
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/",
    "/admin",
    "/admin/",
  ])("rejects unsafe or looping target %s", (target) => {
    expect(configuredRouteTarget(target)).toBeNull()
  })
})
