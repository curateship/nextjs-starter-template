import { describe, expect, it } from "vitest"

import frames from "@/lib/protocols/apex/socket.fixture.json"
import { applyApexFrame } from "@/server/protocols/apex/live-prices"
import type { LiveFigures } from "@/lib/protocols/contracts"

function state(tradable: string[]) {
  return {
    figures: new Map<string, LiveFigures>(),
    prices: new Map<string, number>(),
    index: new Map<string, number>(),
    tradable: new Set(tradable),
  }
}

describe("ApeX Omni's pushed prices on the server", () => {
  it("applies an all-markets frame, keeping only what the catalogue lists", () => {
    const hub = state(["BTCUSDT", "SPCXUSDT"])
    const replies: object[] = []
    const frame = frames.allMarkets
    expect(applyApexFrame(hub, frame, (one) => replies.push(one))).toBe(true)
    expect([...hub.prices.keys()].sort()).toEqual(["BTCUSDT", "SPCXUSDT"])
    // The saved frame carries prediction markets too; none got through.
    const predictions = frame.data.filter((row) => row.s.includes("_"))
    expect(predictions.length).toBeGreaterThan(0)
    for (const row of predictions) expect(hub.prices.has(row.s)).toBe(false)
    const btc = frame.data.find((row) => row.s === "BTCUSDT")!
    expect(hub.figures.get("BTCUSDT")).toEqual({
      price: Number(btc.mp),
      change24h: Number(btc.pr),
      volume24hUsd: Number(btc.to),
      fundingHourly: Number(btc.fr),
      openInterestUsd: Number(btc.o) * Number(btc.mp),
    })
    expect(hub.index.get("BTCUSDT")).toBe(Number(btc.xp))
    expect(replies).toEqual([])
  })

  it("applies a delta the same way, market by market", () => {
    const hub = state(["BTCUSDT", "ETHUSDT"])
    applyApexFrame(hub, frames.allMarkets, () => {})
    const eth = hub.prices.get("ETHUSDT")
    applyApexFrame(
      hub,
      { topic: "instrumentInfo.all", type: "delta", data: [{ s: "BTCUSDT", mp: "90000.5" }] },
      () => {}
    )
    expect(hub.prices.get("BTCUSDT")).toBe(90000.5)
    expect(hub.prices.get("ETHUSDT")).toBe(eth)
  })

  it("answers ApeX's own ping with a pong carrying the same stamp", () => {
    const replies: object[] = []
    expect(applyApexFrame(state([]), frames.ping, (one) => replies.push(one))).toBe(false)
    expect(replies).toEqual([{ op: "pong", args: frames.ping.args }])
  })

  it("does not count a pong, an acknowledgement or a candle as a price", () => {
    const hub = state(["BTCUSDT"])
    for (const frame of [frames.pong, frames.subscribed, frames.candle]) {
      expect(applyApexFrame(hub, frame, () => {})).toBe(false)
    }
    expect(hub.prices.size).toBe(0)
  })
})
