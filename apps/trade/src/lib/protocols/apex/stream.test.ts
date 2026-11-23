import { describe, expect, it } from "vitest"

import frames from "@/lib/protocols/apex/socket.fixture.json"
import type { CandleBar, CandleInterval, LiveFigures } from "@/lib/protocols/contracts"
import { handleApexFrame } from "@/lib/protocols/apex/stream"

function recorder() {
  const figures: Array<ReadonlyMap<string, LiveFigures>> = []
  const candles: Array<[string, CandleInterval, CandleBar]> = []
  return {
    figures,
    candles,
    context: {
      publishFigures: (updates: ReadonlyMap<string, LiveFigures>) => figures.push(updates),
      publishCandle: (marketId: string, interval: CandleInterval, bar: CandleBar) =>
        candles.push([marketId, interval, bar]),
    },
  }
}

describe("ApeX Omni's browser stream", () => {
  it("publishes every contract's figures and drops the prediction markets", () => {
    const seen = recorder()
    expect(handleApexFrame(seen.context, frames.allMarkets, () => {})).toBe(true)
    const ids = [...seen.figures[0].keys()]
    expect(ids).toContain("BTCUSDT")
    expect(ids).toContain("SPCXUSDT")
    expect(ids.some((id) => id.includes("_"))).toBe(false)
  })

  it("publishes the working bar of a one-minute candle push", () => {
    const seen = recorder()
    expect(handleApexFrame(seen.context, frames.candle, () => {})).toBe(true)
    const pushed = frames.candle.data[0]
    expect(seen.candles).toEqual([
      [
        "BTCUSDT",
        "1m",
        {
          openTime: pushed.start,
          open: Number(pushed.open),
          high: Number(pushed.high),
          low: Number(pushed.low),
          close: Number(pushed.close),
          volume: Number(pushed.volume),
        },
      ],
    ])
  })

  it("answers ApeX's ping and ignores its pong", () => {
    const seen = recorder()
    const replies: object[] = []
    expect(handleApexFrame(seen.context, frames.ping, (one) => replies.push(one))).toBe(false)
    expect(handleApexFrame(seen.context, frames.pong, (one) => replies.push(one))).toBe(false)
    expect(replies).toEqual([{ op: "pong", args: frames.ping.args }])
  })
})
