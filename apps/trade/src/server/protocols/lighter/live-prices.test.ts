import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  closeLighterLivePrices,
  lighterLivePricesFresh,
  openLighterLivePrices,
  readLighterLivePrices,
} from "@/server/protocols/lighter/live-prices"
import { clearLighterBudgets, lighterBudgetSnapshot } from "@/server/protocols/lighter/budget"

/**
 * A stand-in socket the test drives by hand. Only the four members the hub
 * touches are real; nothing here reaches the network.
 */
class FakeSocket {
  static last: FakeSocket | null = null
  /** The hub checks `WebSocket.OPEN` before sending, as the real one does. */
  static OPEN = 1
  readyState = 1
  sent: string[] = []
  private listeners = new Map<string, ((event: unknown) => void)[]>()

  constructor() {
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
}

const STATS = {
  channel: "market_stats:all",
  type: "update/market_stats",
  market_stats: {
    "1": { symbol: "BTC", market_id: 1, mark_price: "78584.1" },
    "0": { symbol: "ETH", market_id: 0, mark_price: "2456.57" },
  },
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("WebSocket", FakeSocket)
  clearLighterBudgets()
})

afterEach(() => {
  closeLighterLivePrices("mainnet")
  vi.unstubAllGlobals()
  vi.useRealTimers()
  clearLighterBudgets()
})

describe("the Lighter price hub", () => {
  it("never calls itself fresh before a real price has arrived", () => {
    openLighterLivePrices("mainnet")
    FakeSocket.last?.fire("open")

    // The socket is open and subscribed, but nothing has been pushed. The
    // engine must not treat an empty map as today's prices.
    expect(readLighterLivePrices("mainnet").prices.size).toBe(0)
    expect(lighterLivePricesFresh("mainnet")).toBe(false)

    FakeSocket.last?.push(STATS)
    expect(readLighterLivePrices("mainnet").prices.get("BTC")).toBe(78_584.1)
    expect(lighterLivePricesFresh("mainnet")).toBe(true)
  })

  it("gives a new socket its full twelve seconds before tearing it down", () => {
    openLighterLivePrices("mainnet")
    const opened = FakeSocket.last
    opened?.fire("open")

    // Four seconds in, the watchdog runs and must leave the quiet-but-new
    // socket alone rather than reconnecting on its first tick.
    vi.advanceTimersByTime(4_000)
    expect(FakeSocket.last).toBe(opened)
    expect(opened?.readyState).toBe(1)

    // Past twelve seconds with nothing said, it is replaced.
    vi.advanceTimersByTime(12_000)
    expect(opened?.readyState).toBe(3)
  })

  it("pings before Lighter's two-minute silence limit and counts the frame", () => {
    openLighterLivePrices("mainnet")
    const socket = FakeSocket.last
    socket?.fire("open")
    const afterSubscribe = lighterBudgetSnapshot("mainnet").socketSends

    // A healthy Lighter line pushes constantly — 490 messages a minute when
    // measured — so the staleness watchdog never fires on it. What Lighter
    // does close is a line whose CLIENT has been silent for two minutes, and
    // its own pushes do not count towards that.
    for (let second = 0; second < 52; second += 1) {
      socket?.push(STATS)
      vi.advanceTimersByTime(1_000)
    }

    expect(FakeSocket.last).toBe(socket)
    const frames = socket?.sent.map((one) => JSON.parse(one)) ?? []
    expect(frames.some((one) => one.type === "ping")).toBe(true)
    // Lighter counts socket frames against the same sixty-a-minute allowance.
    expect(lighterBudgetSnapshot("mainnet").socketSends).toBeGreaterThan(
      afterSubscribe
    )
  })

  it("reconnects after the socket is lost", () => {
    openLighterLivePrices("mainnet")
    const first = FakeSocket.last
    first?.fire("open")
    first?.push(STATS)

    first?.fire("close")
    expect(readLighterLivePrices("mainnet").prices.size).toBe(2)

    // The first backoff step is one second; the watchdog runs every four.
    vi.advanceTimersByTime(4_000)
    expect(FakeSocket.last).not.toBe(first)
  })

  it("opens nothing for a network Lighter does not serve", () => {
    // Lighter is mainnet only. Asking for another network must not open a
    // socket, and must not start a reconnect loop against a refusal either.
    FakeSocket.last = null
    openLighterLivePrices("testnet")
    expect(FakeSocket.last).toBeNull()

    // Unfresh, so the caller falls back to REST and hears the refusal there
    // once rather than never hearing anything.
    expect(readLighterLivePrices("testnet").prices.size).toBe(0)
    expect(lighterLivePricesFresh("testnet")).toBe(false)

    vi.advanceTimersByTime(30_000)
    expect(FakeSocket.last).toBeNull()
  })
})
