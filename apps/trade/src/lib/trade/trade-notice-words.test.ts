import { describe, expect, it } from "vitest"

import {
  fillNoticeWords,
  priceAlertNoticeWords,
  triggerNoticeWords,
} from "./trade-notice-words"

/**
 * The bell's sentences about trades. What matters here is the reading: the
 * dollars, the coin, the wallet's own label, and a level that gets louder as
 * the news gets worse.
 */

const wallet = { walletLabel: "Hyperliquid main", practice: false }

describe("a price alert's notice", () => {
  it("says which way the price was moving", () => {
    expect(
      priceAlertNoticeWords({
        marketKey: "hyperliquid:mainnet:ETH",
        price: 3_600,
        direction: "above",
      })
    ).toEqual({
      title: "ETH reached $3,600 (was rising)",
      body: "The price alert fired once and is now retired.",
      level: "info",
    })
  })
})

describe("a fill's notice", () => {
  it("says a buy in dollars, at its price, with the wallet's label", () => {
    const words = fillNoticeWords({
      marketKey: "hyperliquid:mainnet:ETH",
      side: "buy",
      px: 90,
      sz: 5.5555,
      closedPnl: 0,
      liquidation: false,
      ...wallet,
    })
    expect(words.title).toBe("Bought $500 of ETH at $90 (Hyperliquid main)")
    expect(words.level).toBe("info")
  })

  it("carries the dollars lost on a losing close, and gets louder", () => {
    const words = fillNoticeWords({
      marketKey: "hyperliquid:mainnet:ETH",
      side: "sell",
      px: 80,
      sz: 6.25,
      closedPnl: -55,
      liquidation: false,
      ...wallet,
    })
    expect(words.title).toContain("Sold $500 of ETH")
    expect(words.body).toBe("Lost $55.00 on this close.")
    expect(words.level).toBe("warning")
  })

  it("says made, quietly, on a winning close", () => {
    const words = fillNoticeWords({
      marketKey: "hyperliquid:mainnet:ETH",
      side: "sell",
      px: 100,
      sz: 5,
      closedPnl: 30,
      liquidation: false,
      ...wallet,
    })
    expect(words.body).toBe("Made $30.00 on this close.")
    expect(words.level).toBe("info")
  })

  it("names the average entry the exchange measured a close against", () => {
    // Bought once at 0.14737 and sold higher, yet the exchange counts a loss:
    // the rest of the position was bought near 0.16, and a close is measured
    // against the whole position's average entry.
    const words = fillNoticeWords({
      marketKey: "hyperliquid:mainnet:ENA",
      side: "sell",
      px: 0.15105,
      sz: 782,
      closedPnl: -3.805212,
      entryPx: 0.155916,
      liquidation: false,
      ...wallet,
    })
    expect(words.body).toBe(
      "Lost $3.81 on this close. That is measured against the whole position's average entry of $0.15592, not the last buy."
    )
  })

  it("is loudest when the exchange took the trade itself", () => {
    const words = fillNoticeWords({
      marketKey: "hyperliquid:mainnet:ETH",
      side: "sell",
      px: 70,
      sz: 7,
      closedPnl: -120,
      liquidation: true,
      ...wallet,
    })
    expect(words.title).toContain("The exchange liquidated ETH")
    expect(words.level).toBe("critical")
  })

  it("names practice money as practice", () => {
    const words = fillNoticeWords({
      marketKey: "hyperliquid:testnet:ETH",
      side: "buy",
      px: 90,
      sz: 1,
      closedPnl: 0,
      liquidation: false,
      walletLabel: "Test wallet",
      practice: true,
    })
    expect(words.title).toContain("(Test wallet, practice)")
  })
})

describe("a stop or target's second notice", () => {
  it("names the stop, the price and the dollars lost", () => {
    const words = triggerNoticeWords({
      kind: "stop",
      marketKey: "hyperliquid:mainnet:ETH",
      side: "sell",
      px: 80,
      closedPnl: -55,
      ...wallet,
    })
    expect(words.title).toBe(
      "Stop hit on ETH: sold at $80, lost $55.00 (Hyperliquid main)"
    )
    expect(words.level).toBe("warning")
  })

  it("says a target quietly, with the dollars made", () => {
    const words = triggerNoticeWords({
      kind: "target",
      marketKey: "hyperliquid:mainnet:BTC",
      side: "sell",
      px: 120000,
      closedPnl: 30,
      ...wallet,
    })
    expect(words.title).toContain("Target hit on BTC")
    expect(words.title).toContain("made $30.00")
    expect(words.level).toBe("info")
  })

  it("says bought when the stop closed a short", () => {
    const words = triggerNoticeWords({
      kind: "stop",
      marketKey: "hyperliquid:mainnet:ETH",
      side: "buy",
      px: 95,
      closedPnl: -12,
      ...wallet,
    })
    expect(words.title).toContain("bought at")
  })
})
