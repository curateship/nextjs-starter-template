import { describe, expect, it } from "vitest"

import {
  fillNoticeWords,
  drawingAlertNoticeWords,
  priceAlertNoticeWords,
  triggerNoticeWords,
} from "./trade-notice-words"

/**
 * The bell's sentences about trades. What matters here is the reading: the
 * dollars, the coin, the wallet's own label, and a level that gets louder as
 * the news gets worse.
 */

const wallet = { walletLabel: "Hyperliquid main", practice: false }

describe("a drawn line's alert notice", () => {
  it("names the coin, where the line was, and which way the price came", () => {
    expect(
      drawingAlertNoticeWords({
        marketKey: "hyperliquid:mainnet:BTC",
        kind: "trendline",
        price: 61_200,
        direction: "below",
      })
    ).toEqual({
      title: "BTC crossed your trendline at $61,200 (was falling)",
      body: "The trendline's alert fired once and is now off. The trendline is still on the chart.",
      level: "info",
    })
    expect(
      drawingAlertNoticeWords({
        marketKey: "hyperliquid:mainnet:BTC",
        kind: "level",
        price: 61_200,
        direction: "above",
      }).title
    ).toBe("BTC crossed your level at $61,200 (was rising)")
  })

  it("says how far past the line the price had to go, when a buffer was set", () => {
    const said = drawingAlertNoticeWords({
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "level",
      price: 60_000,
      direction: "above",
      buffer: 0.1,
    })
    expect(said.title).toBe("BTC crossed your level at $60,000 (was rising)")
    expect(said.body).toBe(
      "The price had to go 0.1% past the level. The level's alert fired once and is now off. The level is still on the chart."
    )
    // Nothing said about it when there was none.
    expect(
      drawingAlertNoticeWords({
        marketKey: "hyperliquid:mainnet:BTC",
        kind: "level",
        price: 60_000,
        direction: "above",
      }).body
    ).not.toContain("past the")
  })

  it("calls a named line by its name, and puts the price in the body", () => {
    expect(
      drawingAlertNoticeWords({
        marketKey: "hyperliquid:mainnet:BTC",
        kind: "trendline",
        price: 61_200,
        direction: "above",
        name: "4h base",
      })
    ).toEqual({
      title: "BTC crossed 4h base (was rising)",
      body: "4h base was at $61,200. The trendline's alert fired once and is now off. The trendline is still on the chart.",
      level: "info",
    })
  })
})

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
  it("says an entry in dollars, at its price, with the wallet's label", () => {
    const words = fillNoticeWords({
      marketKey: "hyperliquid:mainnet:ETH",
      side: "buy",
      px: 90,
      sz: 5.5555,
      closedPnl: 0,
      liquidation: false,
      ...wallet,
    })
    expect(words.title).toBe(
      "Entered a trade: $500 of ETH at $90 (Hyperliquid main)"
    )
    expect(words.level).toBe("info")
  })

  it("says exited when the venue calls it a close, even at breakeven", () => {
    const words = fillNoticeWords({
      marketKey: "hyperliquid:mainnet:ETH",
      side: "sell",
      px: 90,
      sz: 5.5555,
      closedPnl: 0,
      dir: "Close Long",
      liquidation: false,
      ...wallet,
    })
    expect(words.title).toBe(
      "Exited a trade: $500 of ETH at $90 (Hyperliquid main)"
    )
  })

  it("never says shorted or sold on a buy that closed a short", () => {
    const words = fillNoticeWords({
      marketKey: "hyperliquid:mainnet:ETH",
      side: "buy",
      px: 90,
      sz: 5.5555,
      closedPnl: 12,
      dir: "Close Short",
      liquidation: false,
      ...wallet,
    })
    expect(words.title).toBe(
      "Exited a trade: $500 of ETH at $90 (Hyperliquid main)"
    )
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
    expect(words.title).toContain("Exited a trade: $500 of ETH")
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
      "Stop hit on ETH: exited at $80, lost $55.00 (Hyperliquid main)"
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

  it("says exited, not bought, when the stop closed a short", () => {
    const words = triggerNoticeWords({
      kind: "stop",
      marketKey: "hyperliquid:mainnet:ETH",
      side: "buy",
      px: 95,
      closedPnl: -12,
      ...wallet,
    })
    expect(words.title).toContain("exited at")
    expect(words.title).not.toContain("bought")
  })
})
