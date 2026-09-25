import { afterEach, describe, expect, it, vi } from "vitest"

import {
  asterLivePricesFresh,
  closeAsterLivePrices,
  openAsterLivePrices,
  readAsterLivePrices,
} from "@/server/protocols/aster/live-prices"

type Listener = (event: { data: string }) => void

class FakeSocket {
  static last: FakeSocket | null = null
  readonly sent: string[] = []
  private listeners = new Map<string, Listener[]>()
  readonly url: string
  constructor(url: string) {
    this.url = url
    FakeSocket.last = this
  }
  addEventListener(kind: string, listener: Listener) {
    const listeners = this.listeners.get(kind) ?? []
    listeners.push(listener)
    this.listeners.set(kind, listeners)
  }
  send(text: string) { this.sent.push(text) }
  close() {}
  fire(kind: string, data: unknown = "") {
    for (const listener of this.listeners.get(kind) ?? []) {
      listener({ data: typeof data === "string" ? data : JSON.stringify(data) })
    }
  }
}

afterEach(() => {
  closeAsterLivePrices("mainnet")
  FakeSocket.last = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the Aster engine price feed", () => {
  it("subscribes once to all marks and publishes mark price", () => {
    vi.stubGlobal("WebSocket", FakeSocket)
    openAsterLivePrices("mainnet")
    const socket = FakeSocket.last
    socket?.fire("open")
    expect(socket?.sent).toHaveLength(1)
    expect(socket?.sent[0]).toContain("!markPrice@arr@1s")

    socket?.fire("message", [
      { e: "markPriceUpdate", s: "BTCUSDT", p: "77236.42" },
      { e: "markPriceUpdate", s: "ETHUSDT", p: "4300.5" },
    ])
    expect(readAsterLivePrices("mainnet").prices.get("BTCUSDT")).toBe(77_236.42)
    expect(asterLivePricesFresh("mainnet")).toBe(true)
  })

  it("rejects last trades and malformed marks", () => {
    vi.stubGlobal("WebSocket", FakeSocket)
    openAsterLivePrices("mainnet")
    FakeSocket.last?.fire("message", [
      { e: "24hrTicker", s: "BTCUSDT", c: "70000" },
      { e: "markPriceUpdate", s: "ETHUSDT", p: "bad" },
    ])
    expect(readAsterLivePrices("mainnet").prices.size).toBe(0)
    expect(asterLivePricesFresh("mainnet")).toBe(false)
  })
})
