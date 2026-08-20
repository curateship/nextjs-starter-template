import { afterEach, describe, expect, it, vi } from "vitest"

import {
  closePhemexLivePrices,
  openPhemexLivePrices,
  phemexLivePricesFresh,
  readPhemexLivePrices,
} from "@/server/protocols/phemex/live-prices"

/**
 * Phemex's price feed, and the one thing it exists to prove: **the column
 * names are the exchange's, not ones that sound right.**
 *
 * The hub used to look for `markPriceRp` and fall back to `closeRp`. Phemex
 * sends neither. It sends `markRp` and `lastRp`, so every pack that arrived
 * was thrown away — the socket connected, stayed healthy, said nothing, and
 * the whole app quietly went back to asking for prices over and over. Phemex
 * eventually rationed the asking, and once it did, watched orders on that
 * account were never compared against their level at all.
 *
 * The legend below is copied verbatim from a live message on 20 Aug 2026, so
 * a rename at the exchange breaks this test rather than the trading.
 */

const FIELDS = [
  "symbol",
  "openRp",
  "highRp",
  "lowRp",
  "lastRp",
  "volumeRq",
  "turnoverRv",
  "openInterestRv",
  "indexRp",
  "markRp",
  "fundingRateRr",
  "predFundingRateRr",
  "bidRp",
  "askRp",
] as const

/** One real row, as the exchange sent it. Mark price 0.1972, last 0.1971. */
const ADA_ROW = [
  "ADAUSDT",
  "0.1916",
  "0.2034",
  "0.1816",
  "0.1971",
  "69289933.31",
  "13214598.240451",
  "164085703.19125",
  "0.19737968",
  "0.1972",
  "0.00008428",
  "0.00008428",
  "0.1972",
  "0.1973",
]

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

  /** One pack, in the shape the exchange really uses. */
  pack(rows: unknown[][], fields: readonly string[] = FIELDS) {
    this.fire("message", {
      data: JSON.stringify({
        data: rows,
        fields,
        method: "perp_market24h_pack_p.update",
        timestamp: 1_787_261_161_461_883_600,
        type: "snapshot",
      }),
    })
  }
}

function open() {
  vi.stubGlobal("WebSocket", FakeSocket)
  openPhemexLivePrices("mainnet")
  const socket = FakeSocket.last
  socket?.fire("open")
  return socket
}

afterEach(() => {
  closePhemexLivePrices("mainnet")
  FakeSocket.last = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the Phemex price feed", () => {
  it("reads the mark price out of a real pack", () => {
    const socket = open()
    socket?.pack([ADA_ROW])

    // 0.1972 is `markRp`. 0.1971 is `lastRp` and 0.1973 is the ask — picking
    // either of those would be a different number to trade on.
    expect(readPhemexLivePrices("mainnet").prices.get("ADAUSDT")).toBe(0.1972)
    expect(phemexLivePricesFresh("mainnet")).toBe(true)
  })

  it("falls back to the last trade when a pack carries no mark", () => {
    const socket = open()
    const fields = FIELDS.filter((name) => name !== "markRp")
    const row = ADA_ROW.filter((_, at) => at !== FIELDS.indexOf("markRp"))
    socket?.pack([row], fields)

    expect(readPhemexLivePrices("mainnet").prices.get("ADAUSDT")).toBe(0.1971)
  })

  it("carries every symbol in the pack, not just the first", () => {
    const socket = open()
    const btc = [...ADA_ROW]
    btc[0] = "BTCUSDT"
    btc[FIELDS.indexOf("markRp")] = "69584.5"
    socket?.pack([ADA_ROW, btc])

    const { prices } = readPhemexLivePrices("mainnet")
    expect(prices.get("ADAUSDT")).toBe(0.1972)
    expect(prices.get("BTCUSDT")).toBe(69_584.5)
  })

  it("subscribes to the pack and says nothing before one arrives", () => {
    const socket = open()
    expect(socket?.sent[0]).toContain("perp_market24h_pack_p.subscribe")
    expect(phemexLivePricesFresh("mainnet")).toBe(false)
    expect(readPhemexLivePrices("mainnet").prices.size).toBe(0)
  })

  it("ignores a message with no legend rather than guessing the columns", () => {
    const socket = open()
    socket?.fire("message", {
      data: JSON.stringify({ data: [ADA_ROW], method: "no.legend" }),
    })
    socket?.fire("message", { data: JSON.stringify({ id: 1, result: "ok" }) })
    socket?.fire("message", { data: "not json" })

    expect(readPhemexLivePrices("mainnet").prices.size).toBe(0)
    expect(phemexLivePricesFresh("mainnet")).toBe(false)
  })

  it("goes stale rather than serving an old price as a live one", () => {
    const socket = open()
    socket?.pack([ADA_ROW])
    expect(phemexLivePricesFresh("mainnet")).toBe(true)

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000)
    // Still remembered, just no longer worth trading on — the engine falls
    // back to asking the exchange outright.
    expect(readPhemexLivePrices("mainnet").prices.get("ADAUSDT")).toBe(0.1972)
    expect(phemexLivePricesFresh("mainnet")).toBe(false)
  })
})
