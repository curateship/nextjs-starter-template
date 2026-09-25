import { describe, expect, it } from "vitest"
import { MarketHistory, MAX_HISTORY_BYTES } from "./market-history"

describe("market windows", () => {
  it("waits for a full window and estimates traded dollars, clamping falling daily volume", () => {
    const history = new MarketHistory()
    const start = 1_000_000
    for (let second = 0; second < 5; second++)
      history.sample(
        "coin",
        start + second * 1000,
        100 + second,
        1000 + second * 20
      )
    expect(history.window("coin", start + 4000, 5)).toBeNull()
    history.sample("coin", start + 5000, 110, 1500)
    expect(history.window("coin", start + 5000, 5)).toEqual({
      move: 10,
      fraction: 0.1,
      traded: 500,
    })
    history.sample("coin", start + 6000, 110, 500)
    expect(history.window("coin", start + 6000, 5)?.traded).toBe(0)
  })
  it("does not rewrite a second or read a reconnect gap as a move", () => {
    const history = new MarketHistory()
    history.sample("coin", 1_000_000, 100, 1000)
    history.sample("coin", 999_000, 1, 1)
    history.sample("coin", 1_000_500, 1, 1)
    history.sample("coin", 1_005_000, 110, 1500)
    expect(history.window("coin", 1_005_000, 5)?.move).toBe(10)
    history.sample("coin", 1_050_000, 200, 2500)
    expect(history.window("coin", 1_050_000, 5)).toBeNull()
  })
  it("retains five minutes within a fixed allocation and clears on reconnect", () => {
    const history = new MarketHistory()
    const start = 1_000_000
    for (let second = 0; second <= 900; second++)
      history.sample("coin", start + second * 1000, 100 + second, 1000 + second)
    expect(history.window("coin", start + 900_000, 300)?.move).toBe(300)
    expect(history.window("coin", start + 900_000, 60)?.move).toBe(60)
    expect(MAX_HISTORY_BYTES).toBeLessThan(6_200_000)
    history.clear("coin")
    expect(history.window("coin", start + 900_000, 5)).toBeNull()
  })
})
