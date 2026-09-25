import { afterEach, describe, expect, it, vi } from "vitest"
import { leftForANewerBuild } from "./left-for-newer-build"

/**
 * The engine's one check before it touches a saved plan. Both halves have
 * ended real grids: a newer build's fields on 3 Sep 2026, and a stripped
 * direction on 4 Sep, when an old website saved twelve short grids back
 * without it and the engine that followed ran them as buying grids.
 */
describe("leftForANewerBuild", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("trades a grid that carries its direction and nothing unknown", () => {
    expect(
      leftForANewerBuild("row-1", "grid", { direction: "short", levels: [] })
    ).toBe(false)
  })

  it("leaves a grid with no direction alone and says so once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(leftForANewerBuild("row-2", "grid", { levels: [] })).toBe(true)
    expect(leftForANewerBuild("row-2", "grid", { levels: [] })).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain("older build")
    expect(warn.mock.calls[0]?.[0]).toContain("direction")
  })

  it("leaves a grid with a field it has never heard of alone", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(
      leftForANewerBuild("row-3", "grid", {
        direction: "long",
        splitsIntoThirds: true,
      })
    ).toBe(true)
  })

  it("does not hold a ladder to the grid's rule", () => {
    expect(leftForANewerBuild("row-4", "dca", { rungs: [] })).toBe(false)
  })
})
