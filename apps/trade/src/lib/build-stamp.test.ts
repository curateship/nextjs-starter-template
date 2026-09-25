import { afterEach, describe, expect, it, vi } from "vitest"

import { buildStamp, describeBuild } from "./build-stamp"

describe("the build stamp", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("is null in a dev server or a test run, which never take part in the newest-build rule", () => {
    expect(buildStamp()).toBeNull()
  })

  it("reads what the build wrote in", () => {
    vi.stubGlobal(
      "__TRADE_BUILD_STAMP__",
      JSON.stringify({ builtAt: 1_788_872_100_000, commit: "abc1234def" })
    )
    expect(buildStamp()).toEqual({ builtAt: 1_788_872_100_000, commit: "abc1234def" })
  })

  it("ignores a stamp it cannot read rather than guessing a date", () => {
    vi.stubGlobal("__TRADE_BUILD_STAMP__", "{not json")
    expect(buildStamp()).toBeNull()
    vi.stubGlobal("__TRADE_BUILD_STAMP__", JSON.stringify({ commit: "x" }))
    expect(buildStamp()).toBeNull()
  })

  it("describes a build the way the console and the Workers card say it", () => {
    expect(describeBuild(null)).toBe("an unstamped build (dev or test)")
    expect(describeBuild({ builtAt: Date.UTC(2026, 8, 4, 12, 55), commit: null })).toBe(
      "built 2026-09-04 12:55 UTC"
    )
    expect(
      describeBuild({ builtAt: Date.UTC(2026, 8, 4, 12, 55), commit: "abc1234def" })
    ).toBe("built 2026-09-04 12:55 UTC (abc1234)")
  })
})
