import { afterEach, describe, expect, it, vi } from "vitest"

import {
  closeKucoinLivePrices,
  kucoinLivePricesFresh,
  openKucoinLivePrices,
  readKucoinLivePrices,
} from "@/server/protocols/kucoin/live-prices"

/**
 * KuCoin's price feed, which differs from the other two in the one way that
 * matters: it carries nothing until it is told which markets to carry.
 *
 * Both mistakes this guards against were seen for real on 20 Aug 2026. The
 * exchange accepts a subscription to every market at once and then never
 * sends anything, so a feed can look open and be empty. And the topic that
 * looks like the obvious one carries the best bid and ask rather than the
 * mark price the engine fires triggers on.
 */

const TICKET = {
  code: "200000",
  data: {
    token: "a-ticket",
    instanceServers: [
      { endpoint: "wss://ws-api-futures.kucoin.example/", pingInterval: 18_000 },
    ],
  },
}

type Listener = (event: { data: string }) => void

/** A socket that never leaves this file, with a way to push messages in. */
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
    const found = this.listeners.get(kind) ?? []
    found.push(listener)
    this.listeners.set(kind, found)
  }

  send(text: string) {
    this.sent.push(text)
  }

  close() {}

  fire(kind: string, event: { data: string } = { data: "" }) {
    for (const listener of this.listeners.get(kind) ?? []) listener(event)
  }

  /** One pushed mark price, exactly as the exchange sends it. */
  push(symbol: string, markPrice: number) {
    this.fire("message", {
      data: JSON.stringify({
        type: "message",
        topic: `/contract/instrument:${symbol}`,
        subject: "mark.index.price",
        data: { markPrice, indexPrice: markPrice + 1, timestamp: 1_787_203_862_000 },
      }),
    })
  }

  get topics(): string[] {
    return this.sent
      .map((text) => JSON.parse(text) as { type?: string; topic?: string })
      .filter((message) => message.type === "subscribe")
      .map((message) => message.topic ?? "")
  }
}

/** Opens the hub and waits for the ticket fetch and the socket to settle. */
async function openAndSettle(marketIds: string[]) {
  openKucoinLivePrices("mainnet", marketIds)
  // The ticket is fetched before the socket is dialled, so the hub is only
  // ready after the promise chain has run.
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
  const socket = FakeSocket.last
  socket?.fire("open")
  return socket
}

afterEach(() => {
  closeKucoinLivePrices("mainnet")
  FakeSocket.last = null
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function stubExchange() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(TICKET))
  )
  vi.stubGlobal("WebSocket", FakeSocket)
}

describe("the KuCoin price feed", () => {
  it("subscribes to the markets it is told, one topic each", async () => {
    stubExchange()
    const socket = await openAndSettle(["XBTUSDTM", "ETHUSDTM"])
    expect(socket?.topics).toEqual([
      "/contract/instrument:XBTUSDTM",
      "/contract/instrument:ETHUSDTM",
    ])
    // Never the all-markets topic: the exchange accepts it and sends nothing.
    expect(socket?.sent.join(" ")).not.toContain(":all")
  })

  it("takes a market added later without reconnecting", async () => {
    stubExchange()
    const socket = await openAndSettle(["XBTUSDTM"])
    openKucoinLivePrices("mainnet", ["XBTUSDTM", "SOLUSDTM"])
    expect(socket?.topics).toEqual([
      "/contract/instrument:XBTUSDTM",
      "/contract/instrument:SOLUSDTM",
    ])
    expect(FakeSocket.last).toBe(socket)
  })

  it("reads the mark price the engine acts on", async () => {
    stubExchange()
    const socket = await openAndSettle(["XBTUSDTM"])
    socket?.push("XBTUSDTM", 69_584.59)
    expect(readKucoinLivePrices("mainnet").prices.get("XBTUSDTM")).toBe(69_584.59)
    expect(kucoinLivePricesFresh("mainnet")).toBe(true)
  })

  it("ignores anything on the line that is not a mark price", async () => {
    stubExchange()
    const socket = await openAndSettle(["XBTUSDTM"])
    // The best bid and ask ride a different topic, and are not what a trigger
    // fires on — on a thin book they sit percentage points from the mark.
    socket?.fire("message", {
      data: JSON.stringify({
        type: "message",
        topic: "/contractMarket/tickerV2:XBTUSDTM",
        subject: "tickerV2",
        data: { bestBidPrice: "69567.4", bestAskPrice: "69567.5" },
      }),
    })
    socket?.fire("message", { data: JSON.stringify({ type: "pong" }) })
    socket?.fire("message", { data: "not json at all" })
    expect(readKucoinLivePrices("mainnet").prices.size).toBe(0)
    expect(kucoinLivePricesFresh("mainnet")).toBe(false)
  })

  it("goes stale rather than serving an old price as a live one", async () => {
    stubExchange()
    const socket = await openAndSettle(["XBTUSDTM"])
    socket?.push("XBTUSDTM", 69_584.59)
    expect(kucoinLivePricesFresh("mainnet")).toBe(true)

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000)
    // The price is still remembered; it is simply no longer worth trading on,
    // and the engine falls back to asking the exchange outright.
    expect(readKucoinLivePrices("mainnet").prices.get("XBTUSDTM")).toBe(69_584.59)
    expect(kucoinLivePricesFresh("mainnet")).toBe(false)
    vi.restoreAllMocks()
  })

  it("stops taking markets rather than losing them quietly", async () => {
    stubExchange()
    const many = Array.from({ length: 120 }, (_, at) => `M${at}USDTM`)
    const socket = await openAndSettle(many)
    // KuCoin refuses a subscription past its cap without saying so, and a
    // market that never ticks on a feed calling itself fresh is worse than a
    // market this hub never claimed. The rest fall back to the REST read.
    expect(socket?.topics.length).toBe(90)
    expect(socket?.topics[0]).toBe("/contract/instrument:M0USDTM")
  })

  it("says nothing at all before it has been told a single market", () => {
    stubExchange()
    expect(kucoinLivePricesFresh("mainnet")).toBe(false)
    expect(readKucoinLivePrices("mainnet").prices.size).toBe(0)
  })
})
