import { afterEach, describe, expect, it, vi } from "vitest"

import {
  closeAsterStream,
  setAsterPageVisible,
  watchCandle,
  watchFigures,
} from "@/lib/protocols/aster/stream"
import { reconnectDelay } from "@/lib/protocols/timing"

type Listener = (event: { data: string }) => void

class FakeSocket {
  static OPEN = 1
  static last: FakeSocket | null = null
  static all: FakeSocket[] = []
  readyState = 0
  readonly sent: string[] = []
  closed = 0
  private listeners = new Map<string, Listener[]>()
  readonly url: string
  constructor(url: string) {
    this.url = url
    FakeSocket.last = this
    FakeSocket.all.push(this)
  }
  addEventListener(kind: string, listener: Listener) {
    const listeners = this.listeners.get(kind) ?? []
    listeners.push(listener)
    this.listeners.set(kind, listeners)
  }
  send(text: string) {
    this.sent.push(text)
  }
  close() {
    this.closed++
  }
  fire(kind: string, data: unknown = "") {
    if (kind === "open") this.readyState = FakeSocket.OPEN
    for (const listener of this.listeners.get(kind) ?? []) {
      listener({ data: typeof data === "string" ? data : JSON.stringify(data) })
    }
  }
}

afterEach(() => {
  closeAsterStream("mainnet")
  FakeSocket.all = []
  FakeSocket.last = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("the Aster browser feed", () => {
  it("batches the list and chart streams on one socket and publishes marks", () => {
    vi.stubGlobal("WebSocket", FakeSocket)
    const figures: unknown[] = []
    const bars: unknown[] = []
    watchFigures("mainnet", (updates) => figures.push(updates.get("BTCUSDT")))
    watchCandle("mainnet", "BTCUSDT", "1m", (bar) => bars.push(bar))

    const socket = FakeSocket.last
    socket?.fire("open")
    expect(socket?.sent).toHaveLength(1)
    const command = JSON.parse(socket?.sent[0] ?? "{}")
    expect(command.params).toEqual([
      "!markPrice@arr@1s",
      "!ticker@arr",
      "btcusdt@kline_1m",
    ])

    socket?.fire("message", [
      { e: "24hrTicker", s: "BTCUSDT", c: "70000", P: "2", q: "1000" },
      { e: "markPriceUpdate", s: "BTCUSDT", p: "70125" },
    ])
    expect(figures).toEqual([expect.objectContaining({ price: 70_125 })])

    socket?.fire("message", {
      e: "kline",
      s: "BTCUSDT",
      k: { i: "1m", t: 1_000, o: "10", h: "12", l: "9", c: "11", v: "5" },
    })
    expect(bars).toEqual([
      expect.objectContaining({ openTime: 1_000, close: 11 }),
    ])
  })

  it("caps reconnect waits at thirty seconds", () => {
    expect(reconnectDelay(0)).toBe(1_000)
    expect(reconnectDelay(20)).toBe(30_000)
  })

  it("tears down a socket whose data stays quiet", () => {
    vi.useFakeTimers()
    vi.stubGlobal("WebSocket", FakeSocket)
    watchFigures("mainnet", () => {})
    const socket = FakeSocket.last
    socket?.fire("open")

    vi.advanceTimersByTime(16_001)
    expect(socket?.closed).toBe(1)
  })

  it("closes in a hidden tab and reconnects when the tab returns", () => {
    vi.stubGlobal("WebSocket", FakeSocket)
    const figures: number[] = []
    watchFigures("mainnet", (updates) => {
      const price = updates.get("BTCUSDT")?.price
      if (price !== undefined) figures.push(price)
    })
    const first = FakeSocket.last
    first?.fire("open")

    setAsterPageVisible(false)
    expect(first?.closed).toBe(1)

    setAsterPageVisible(true)
    const second = FakeSocket.last
    expect(FakeSocket.all).toHaveLength(2)
    expect(second).not.toBe(first)
    second?.fire("open")
    second?.fire("message", [
      { e: "24hrTicker", s: "BTCUSDT", P: "1", q: "20" },
      { e: "markPriceUpdate", s: "BTCUSDT", p: "70125" },
    ])
    expect(figures).toEqual([70_125])
  })
})
