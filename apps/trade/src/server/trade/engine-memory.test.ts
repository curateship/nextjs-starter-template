import { describe, expect, it } from "vitest"
import { MAX_ENGINE_TIMESTAMPS, rememberEngineTimestamp } from "./engine-memory"

describe("engine timestamp retention", () => {
  it("clears at capacity only when adding a new wallet", () => {
    const timestamps = new Map<string, number>()
    for (let index = 0; index < MAX_ENGINE_TIMESTAMPS; index++)
      rememberEngineTimestamp(timestamps, `wallet-${index}`, index)
    expect(timestamps.size).toBe(MAX_ENGINE_TIMESTAMPS)

    rememberEngineTimestamp(timestamps, "wallet-0", 123456)
    expect(timestamps.size).toBe(MAX_ENGINE_TIMESTAMPS)
    expect(timestamps.get("wallet-0")).toBe(123456)
    expect(timestamps.get("wallet-1")).toBe(1)

    rememberEngineTimestamp(timestamps, "returning-wallet", 3_600_000)
    expect([...timestamps]).toEqual([["returning-wallet", 3_600_000]])
  })

  it("stays bounded across repeated capacity crossings and uses the caller's clock", () => {
    const timestamps = new Map<string, number>()
    for (let index = 0; index < MAX_ENGINE_TIMESTAMPS * 3 + 1; index++) {
      rememberEngineTimestamp(timestamps, `wallet-${index}`, 42)
      expect(timestamps.size).toBeLessThanOrEqual(MAX_ENGINE_TIMESTAMPS)
    }
    expect([...timestamps.values()]).toEqual([42])
  })
})
