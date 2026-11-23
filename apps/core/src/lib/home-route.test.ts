import { describe, expect, it } from "vitest"

import { configuredRouteTarget } from "@/lib/home-route"

describe("configured home route", () => {
  it("keeps normalized internal routes", () => {
    expect(configuredRouteTarget(" /admin/datasource?view=list#top ")).toBe(
      "/admin/datasource?view=list#top"
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
    "/admin?view=home",
  ])("rejects unsafe or looping target %s", (target) => {
    expect(configuredRouteTarget(target)).toBeNull()
  })
})
