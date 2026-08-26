import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  closeLighterStream,
  watchCandle,
  watchFigures,
} from "@/lib/protocols/lighter/stream"

class FakeSocket {
  static last: FakeSocket | null = null
  static OPEN = 1
  readyState = 1
  sent: string[] = []
  url: string
  private listeners = new Map<string, ((event: unknown) => void)[]>()

  constructor(url: string) {
    this.url = url
    FakeSocket.last = this
  }
  addEventListener(kind: string, listener: (event: unknown) => void): void {
    const held = this.listeners.get(kind) ?? []
    held.push(listener)
    this.listeners.set(kind, held)
  }
  send(frame: string): void {
    this.sent.push(frame)
  }
  close(): void {
    this.readyState = 3
  }
  fire(kind: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(kind) ?? []) listener(event)
  }
  push(payload: unknown): void {
    this.fire("message", { data: JSON.stringify(payload) })
  }
  frames(): Array<{ type?: string; channel?: string }> {
    return this.sent.map((one) => JSON.parse(one))
  }
}

const STATS = {
  channel: "market_stats:all",
  type: "update/market_stats",
  market_stats: {
    "1": {
      symbol: "BTC",
      market_id: 1,
      mark_price: "78584.1",
      last_trade_price: "78581.8",
      current_funding_rate: "0.0012",
      daily_quote_token_volume: 707_479_903.17,
      daily_price_change: -1.1543,
      open_interest: "151681070.25",
    },
  },
}

const CANDLE = {
  channel: "candle:1:4h",
  type: "update/candle",
  candles: [
    { t: 1_787_752_800_000, o: 78_439.3, h: 78_601.4, l: 78_264.3, c: 78_483.3, v: 203.58, V: 15_978_075 },
  ],
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("WebSocket", FakeSocket)
})

afterEach(() => {
  closeLighterStream("mainnet")
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("the Lighter browser stream", () => {
  it("opens a read-only line and translates a pushed market row", () => {
    const seen: Array<ReadonlyMap<string, unknown>> = []
    const stop = watchFigures("mainnet", (updates) => seen.push(updates))
    FakeSocket.last?.fire("open")
    expect(FakeSocket.last?.url).toContain("readonly=true")
    expect(FakeSocket.last?.frames()[0]).toEqual({
      type: "subscribe",
      channel: "market_stats/all",
    })

    FakeSocket.last?.push(STATS)
    expect(seen).toHaveLength(1)
    const btc = seen[0].get("BTC") as { price: number; openInterestUsd: number }
    expect(btc.price).toBe(78_584.1)
    // The socket states open interest in dollars already, unlike the REST
    // catalogue, which counts coins.
    expect(btc.openInterestUsd).toBeCloseTo(151_681_070.25, 2)
    stop()
  })

  it("waits for a market's number before subscribing to its candles", () => {
    const bars: Array<{ close: number }> = []
    const stop = watchCandle("mainnet", "BTC", "4h", (bar) => bars.push(bar))
    FakeSocket.last?.fire("open")

    // Lighter names a candle channel by market number, and the browser only
    // learns numbers from market_stats. Nothing is subscribed yet.
    expect(
      FakeSocket.last?.frames().some((one) => one.channel?.startsWith("candle/"))
    ).toBe(false)

    FakeSocket.last?.push(STATS)
    expect(FakeSocket.last?.frames()).toContainEqual({
      type: "subscribe",
      channel: "candle/1/4h",
    })

    FakeSocket.last?.push(CANDLE)
    expect(bars).toHaveLength(1)
    expect(bars[0].close).toBe(78_483.3)
    stop()
  })

  it("unsubscribes the candle channel when the last watcher leaves", () => {
    const stop = watchCandle("mainnet", "BTC", "4h", () => {})
    FakeSocket.last?.fire("open")
    FakeSocket.last?.push(STATS)
    stop()
    expect(FakeSocket.last?.frames()).toContainEqual({
      type: "unsubscribe",
      channel: "candle/1/4h",
    })
  })

  it("pings before Lighter's two-minute silence limit", () => {
    const socket = (() => {
      const stop = watchFigures("mainnet", () => {})
      FakeSocket.last?.fire("open")
      return { socket: FakeSocket.last, stop }
    })()

    for (let second = 0; second < 52; second += 1) {
      socket.socket?.push(STATS)
      vi.advanceTimersByTime(1_000)
    }
    expect(socket.socket?.frames().some((one) => one.type === "ping")).toBe(true)
    socket.stop()
  })
})
