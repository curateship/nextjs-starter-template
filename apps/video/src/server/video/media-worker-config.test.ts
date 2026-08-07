import { describe, expect, it } from "vitest"

import { resolveProxyConcurrency } from "@/server/video/media-worker-config"

describe("resolveProxyConcurrency", () => {
  it("falls back to one at a time for anything unusable", () => {
    for (const value of [undefined, "invalid", "2workers", "0", "-1", "1.5"]) {
      expect(resolveProxyConcurrency(value)).toBe(1)
    }
  })

  it("honors a sensible setting", () => {
    expect(resolveProxyConcurrency("2")).toBe(2)
  })

  it("caps runaway settings", () => {
    expect(resolveProxyConcurrency("999")).toBe(4)
  })
})
