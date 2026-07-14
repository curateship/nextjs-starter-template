import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveProxyConcurrency } from "./media-proxy-config.ts"

describe("resolveProxyConcurrency", () => {
  it("uses one worker for missing, invalid, and non-positive values", () => {
    assert.equal(resolveProxyConcurrency(undefined), 1)
    assert.equal(resolveProxyConcurrency("invalid"), 1)
    assert.equal(resolveProxyConcurrency("2workers"), 1)
    assert.equal(resolveProxyConcurrency("0"), 1)
    assert.equal(resolveProxyConcurrency("-1"), 1)
  })

  it("accepts bounded integers and clamps excessive concurrency", () => {
    assert.equal(resolveProxyConcurrency("2"), 2)
    assert.equal(resolveProxyConcurrency("999"), 4)
  })
})
