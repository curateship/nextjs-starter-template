import assert from "node:assert/strict"
import test from "node:test"

import { configuredRouteTarget } from "./home-route"

test("configuredRouteTarget normalizes internal routes", () => {
  assert.equal(
    configuredRouteTarget(" /admin/posts?tab=all#top "),
    "/admin/posts?tab=all#top"
  )
  assert.equal(configuredRouteTarget("/admin/dashboard"), "/admin/dashboard")
  assert.equal(configuredRouteTarget("/"), "/")
})

test("configuredRouteTarget rejects empty and missing values", () => {
  assert.equal(configuredRouteTarget(""), null)
  assert.equal(configuredRouteTarget("   "), null)
  assert.equal(configuredRouteTarget(null), null)
  assert.equal(configuredRouteTarget(undefined), null)
})

test("configuredRouteTarget rejects external and protocol-relative targets", () => {
  assert.equal(configuredRouteTarget("https://example.com"), null)
  assert.equal(configuredRouteTarget("//example.com"), null)
  assert.equal(configuredRouteTarget("/\\example.com"), null)
})

test("configuredRouteTarget rejects redirect loops back to /admin", () => {
  assert.equal(configuredRouteTarget("/admin"), null)
  assert.equal(configuredRouteTarget("/admin/"), null)
  assert.equal(configuredRouteTarget("/admin?view=home"), null)
})
