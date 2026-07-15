import { describe, expect, it, vi } from "vitest"

import { reconcileMarketScannerEngine } from "./index"

describe("market scanner runtime control", () => {
  it("stops and removes the market engine when scanning is turned off", async () => {
    const engine = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
    }

    const result = await reconcileMarketScannerEngine(
      engine,
      false,
      () => engine
    )

    expect(result).toBeNull()
    expect(engine.stop).toHaveBeenCalledOnce()
  })

  it("starts a new market engine when scanning is turned on", async () => {
    const engine = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
    }

    const result = await reconcileMarketScannerEngine(null, true, () => engine)

    expect(result).toBe(engine)
    expect(engine.start).toHaveBeenCalledOnce()
  })

  it("does nothing when the requested state is already active", async () => {
    const engine = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
    }

    const result = await reconcileMarketScannerEngine(
      engine,
      true,
      () => engine
    )

    expect(result).toBe(engine)
    expect(engine.start).not.toHaveBeenCalled()
    expect(engine.stop).not.toHaveBeenCalled()
  })
})
