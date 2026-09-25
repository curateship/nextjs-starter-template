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
  /** Every socket opened, because this hub now runs several at once. */
  static all: FakeSocket[] = []
  readonly sent: string[] = []
  private listeners = new Map<string, Listener[]>()

  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeSocket.last = this
    FakeSocket.all.push(this)
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
  // The ticket is fetched before a socket is dialled, so a line is only ready
  // after the promise chain has run — and there may be several lines, each
  // fetching its own ticket.
  for (let tick = 0; tick < 6; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  for (const one of FakeSocket.all) one.fire("open")
  return FakeSocket.last
}

afterEach(() => {
  closeKucoinLivePrices("mainnet")
  FakeSocket.last = null
  FakeSocket.all = []
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

  it("offers no price at all once a line has gone quiet", async () => {
    stubExchange()
    const socket = await openAndSettle(["XBTUSDTM"])
    socket?.push("XBTUSDTM", 69_584.59)
    expect(kucoinLivePricesFresh("mainnet")).toBe(true)

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000)
    // **A price is offered to be traded on, so a quiet line offers none.**
    // This used to hand the old figure back and leave the caller to check the
    // age. That worked while there was one line and one age. There are now
    // several, and a single age cannot speak for six sockets that fail one at
    // a time, so each line answers only for itself and the caller asks the
    // exchange by name for whatever is missing.
    expect(readKucoinLivePrices("mainnet").prices.has("XBTUSDTM")).toBe(false)
    expect(kucoinLivePricesFresh("mainnet")).toBe(false)
    vi.restoreAllMocks()
  })

  it("spreads markets over as many lines as it takes", async () => {
    stubExchange()
    // Measured against the live exchange on 22 Aug 2026: 100 markets on one
    // connection tick normally and 130 deliver nothing at all — not the first
    // hundred and then silence, but silence from the first market on. So the
    // markets are split rather than truncated.
    const many = Array.from({ length: 200 }, (_, at) => `M${at}USDTM`)
    await openAndSettle(many)

    expect(FakeSocket.all).toHaveLength(3)
    const carried = FakeSocket.all.flatMap((one) => one.topics)
    expect(carried).toHaveLength(200)
    expect(new Set(carried).size).toBe(200)
    // No line is over the cap, which is the thing that kills a line outright.
    for (const one of FakeSocket.all) {
      expect(one.topics.length).toBeLessThanOrEqual(90)
    }
  })

  it("opens one line when one line is enough", async () => {
    stubExchange()
    await openAndSettle(["XBTUSDTM", "SOLUSDTM", "ETHUSDTM"])
    expect(FakeSocket.all).toHaveLength(1)
  })

  it("lets a quiet line take only its own markets off the feed", async () => {
    stubExchange()
    const many = Array.from({ length: 120 }, (_, at) => `M${at}USDTM`)
    await openAndSettle(many)
    expect(FakeSocket.all).toHaveLength(2)

    // Both lines are delivering.
    FakeSocket.all[0].push("M0USDTM", 100)
    FakeSocket.all[1].push("M95USDTM", 200)
    expect(readKucoinLivePrices("mainnet").prices.size).toBe(2)

    // The second line keeps talking while the first goes quiet. The first
    // line's market drops off and the second line's stays — which is the
    // whole reason for one hub per line rather than one shared clock.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000)
    FakeSocket.all[1].push("M95USDTM", 201)
    const { prices } = readKucoinLivePrices("mainnet")
    expect(prices.has("M0USDTM")).toBe(false)
    expect(prices.get("M95USDTM")).toBe(201)
    vi.restoreAllMocks()
  })

  it("stops opening lines rather than opening them forever", async () => {
    stubExchange()
    // Past the ceiling the rest are left to the REST read: slower and
    // rationed, but honest, and the caller already asks for what is missing.
    const many = Array.from({ length: 900 }, (_, at) => `M${at}USDTM`)
    await openAndSettle(many)
    expect(FakeSocket.all).toHaveLength(8)
    expect(FakeSocket.all.flatMap((one) => one.topics)).toHaveLength(8 * 90)
  })

  it("says nothing at all before it has been told a single market", () => {
    stubExchange()
    expect(kucoinLivePricesFresh("mainnet")).toBe(false)
    expect(readKucoinLivePrices("mainnet").prices.size).toBe(0)
  })
})
