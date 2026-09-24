import { describe, expect, it } from "vitest"

import saved from "./socket.fixture.json"
import type { CandleBar, CandleInterval, LiveFigures } from "@/lib/protocols/contracts"
import { handleEdgexFrame } from "@/lib/protocols/edgex/stream"

/** Frames read from edgeX's public socket on 24 Sep 2026, trimmed. */
function contextFor() {
  const published: Array<ReadonlyMap<string, LiveFigures>> = []
  const candles: Array<{ marketId: string; interval: CandleInterval; bar: CandleBar }> = []
  return {
    published,
    candles,
    context: {
      state: { contractIds: new Map<string, string>(), waiting: new Map() },
      publishFigures: (updates: ReadonlyMap<string, LiveFigures>) => published.push(updates),
      publishCandle: (marketId: string, interval: CandleInterval, bar: CandleBar) =>
        candles.push({ marketId, interval, bar }),
    },
  }
}

describe("edgeX's browser stream", () => {
  it("publishes every contract's figures and learns their numbers", () => {
    const { context, published } = contextFor()
    expect(handleEdgexFrame(context, saved.tickers, () => {})).toBe(true)
    expect([...published[0].keys()].sort()).toEqual(["BTCUSDC", "SAMSUNGUSDC", "SPYUSDC"])
    expect(context.state.contractIds.get("BTCUSDC")).toBe("30000001")
  })

  it("publishes the open chart's working candle under its market name", () => {
    const { context, candles } = contextFor()
    expect(handleEdgexFrame(context, saved.kline, () => {})).toBe(true)
    expect(candles[0].marketId).toBe("BTCUSDC")
    expect(candles[0].interval).toBe("1m")
    expect(candles[0].bar.close).toBe(Number(saved.kline.content.data[0].close))
  })

  it("subscribes a chart that opened before its contract's number was known", () => {
    const { context } = contextFor()
    context.state.waiting.set("BTCUSDC\n1h", { marketId: "BTCUSDC", interval: "1h" })
    const sent: object[] = []
    handleEdgexFrame(context, saved.tickers, (frame) => sent.push(frame))
    expect(sent).toEqual([{ type: "subscribe", channel: "kline.LAST_PRICE.30000001.HOUR_1" }])
    expect(context.state.waiting.size).toBe(0)
  })

  it("answers a ping with the same time and counts it as no data", () => {
    const { context } = contextFor()
    const sent: object[] = []
    expect(
      handleEdgexFrame(context, { type: "ping", time: "1790279780011" }, (frame) => sent.push(frame))
    ).toBe(false)
    expect(sent).toEqual([{ type: "pong", time: "1790279780011" }])
  })
})
