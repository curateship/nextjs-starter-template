import { beforeEach, describe, expect, it, vi } from "vitest"

const hubs = new Map<
  string,
  { fresh: boolean; prices: Map<string, number> }
>()

vi.mock("@/server/protocols/registry", () => ({
  getProtocol: (protocol: string) => ({
    livePrices: hubs.has(protocol)
      ? {
          open: () => {},
          fresh: () => hubs.get(protocol)!.fresh,
          read: () => ({ prices: hubs.get(protocol)!.prices, ageMs: 0 }),
        }
      : null,
  }),
}))

const { pushedMarks } = await import("@/server/trade/live-marks")

/**
 * What the open line can answer for, and what it cannot.
 *
 * This used to be all or nothing, and the cost of that was measured on
 * 22 Aug 2026: a wallet on 454 KuCoin markets got 90 of them off the line and
 * the other 364 were missing, so the whole answer was thrown away and the
 * engine asked KuCoin for all 454 one market at a time. Twelve seconds, every
 * pass, with ninety good prices sitting unused.
 */
describe("pushedMarks", () => {
  beforeEach(() => {
    hubs.clear()
  })

  it("answers for the markets the line carries and names the rest", () => {
    hubs.set("kucoin", {
      fresh: true,
      prices: new Map([["XBTUSDTM", 64000]]),
    })
    const { marks, missing } = pushedMarks([
      "kucoin:mainnet:XBTUSDTM",
      "kucoin:mainnet:ETHUSDTM",
    ])
    expect(marks.get("kucoin:mainnet:XBTUSDTM")).toBe(64000)
    expect(missing).toEqual(["kucoin:mainnet:ETHUSDTM"])
  })

  it("says nothing is missing when the line covers the lot", () => {
    hubs.set("kucoin", {
      fresh: true,
      prices: new Map([
        ["XBTUSDTM", 64000],
        ["ETHUSDTM", 3200],
      ]),
    })
    const { marks, missing } = pushedMarks([
      "kucoin:mainnet:XBTUSDTM",
      "kucoin:mainnet:ETHUSDTM",
    ])
    expect(marks.size).toBe(2)
    expect(missing).toEqual([])
  })

  it("trusts nothing from a line that has gone quiet", () => {
    // A price from a silent feed is a minute-old number, and trading on one is
    // worse than waiting. Every market goes back to be asked for.
    hubs.set("kucoin", {
      fresh: false,
      prices: new Map([["XBTUSDTM", 64000]]),
    })
    const { marks, missing } = pushedMarks(["kucoin:mainnet:XBTUSDTM"])
    expect(marks.size).toBe(0)
    expect(missing).toEqual(["kucoin:mainnet:XBTUSDTM"])
  })

  it("does not let one quiet exchange spoil another that is talking", () => {
    // The whole reason a wallet on a healthy venue must not wait for a sick
    // one. Hyperliquid answers; KuCoin is silent and only its markets are
    // asked for.
    hubs.set("hyperliquid", { fresh: true, prices: new Map([["BTC", 64000]]) })
    hubs.set("kucoin", { fresh: false, prices: new Map([["XBTUSDTM", 64000]]) })
    const { marks, missing } = pushedMarks([
      "hyperliquid:mainnet:BTC",
      "kucoin:mainnet:XBTUSDTM",
    ])
    expect(marks.get("hyperliquid:mainnet:BTC")).toBe(64000)
    expect(missing).toEqual(["kucoin:mainnet:XBTUSDTM"])
  })

  it("keeps three exchanges live when Aster goes quiet", () => {
    hubs.set("hyperliquid", { fresh: true, prices: new Map([["BTC", 64000]]) })
    hubs.set("phemex", { fresh: true, prices: new Map([["BTCUSDT", 64000]]) })
    hubs.set("kucoin", {
      fresh: true,
      prices: new Map([["XBTUSDTM", 64000]]),
    })
    hubs.set("aster", {
      fresh: false,
      prices: new Map([["BTCUSDT", 64000]]),
    })

    const { marks, missing } = pushedMarks([
      "hyperliquid:mainnet:BTC",
      "phemex:mainnet:BTCUSDT",
      "kucoin:mainnet:XBTUSDTM",
      "aster:mainnet:BTCUSDT",
    ])

    expect([...marks.keys()]).toEqual([
      "hyperliquid:mainnet:BTC",
      "phemex:mainnet:BTCUSDT",
      "kucoin:mainnet:XBTUSDTM",
    ])
    expect(missing).toEqual(["aster:mainnet:BTCUSDT"])
  })

  it("treats an exchange with no line at all as simply missing", () => {
    const { marks, missing } = pushedMarks(["phemex:mainnet:BTCUSDT"])
    expect(marks.size).toBe(0)
    expect(missing).toEqual(["phemex:mainnet:BTCUSDT"])
  })

  it("never reports a market as answered when the price is zero", () => {
    hubs.set("kucoin", { fresh: true, prices: new Map([["XBTUSDTM", 0]]) })
    const { missing } = pushedMarks(["kucoin:mainnet:XBTUSDTM"])
    expect(missing).toEqual(["kucoin:mainnet:XBTUSDTM"])
  })
})
