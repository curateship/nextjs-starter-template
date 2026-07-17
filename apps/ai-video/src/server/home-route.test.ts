import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { configuredRouteTarget } from "../lib/home-route.ts"

describe("configured home route", () => {
  it("keeps normalized internal routes", () => {
    assert.equal(
      configuredRouteTarget(" /projects?sort=recent#list "),
      "/projects?sort=recent#list"
    )
  })

  for (const target of [
    "",
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/",
    "/admin",
    "/admin/",
    "/admin?view=home",
  ]) {
    it(`rejects unsafe or looping target ${JSON.stringify(target)}`, () => {
      assert.equal(configuredRouteTarget(target), null)
    })
  }
})
