import { describe, expect, it } from "vitest"

import {
  drawingAlertNoticeWords,
  fillNoticeWords,
  priceAlertNoticeWords,
  triggerNoticeWords,
} from "./trade-notice-words"
import { readBackNotice } from "./notice-sentences"

/**
 * Reading an old notice's sentence back into the pieces the bell draws.
 *
 * The sentences below are real ones, copied out of the live bell on 4 October
 * 2026. What matters is that a notice written months ago draws exactly like one
 * written today, because a bell with two shapes in it looks broken.
 */

describe("a notice written before its pieces were saved", () => {
  it("reads a fill back", () => {
    expect(
      readBackNotice(
        "Entered a trade: $431 of XBT at $86,194 (Ku1)",
        "The order filled on the exchange."
      )
    ).toEqual({
      headline: "Entered $431 of XBT",
      meta: ["@ $86,194", "Ku1", "filled"],
      kind: "entered",
      level: "info",
    })
  })

  it("takes the money off a closing fill's body", () => {
    expect(
      readBackNotice(
        "Exited a trade: $250 of USELESS at $0.2402 (HL1 - GRID)",
        "Lost $0.05 on this close. That is measured against the whole position's average entry of $0.24."
      )
    ).toEqual({
      headline: "Exited $250 of USELESS",
      meta: ["@ $0.2402", "HL1 - GRID", "lost $0.05"],
      kind: "exited",
      // A close that lost money is amber, not the green a winning one wears.
      level: "warning",
    })
  })

  it("reads a drawn line's alert back, buffer and all", () => {
    expect(
      readBackNotice(
        "USELESSUSDT crossed your trendline at $0.23653 (was rising)",
        "The price had to go 2% past the trendline. The trendline's alert fired once and is now off. The trendline is still on the chart."
      )
    ).toEqual({
      headline: "USELESSUSDT crossed your trendline",
      meta: ["@ $0.23653", "rising", "2% buffer"],
      kind: "alert",
      level: "info",
    })
  })

  it("finds a named line's price in the body, where the sentence put it", () => {
    expect(
      readBackNotice(
        "BTC crossed 4h base (was rising)",
        "4h base was at $61,200. The trendline's alert fired once and is now off. The trendline is still on the chart."
      )
    ).toEqual({
      headline: "BTC crossed 4h base",
      meta: ["@ $61,200", "rising"],
      kind: "alert",
      level: "info",
    })
  })

  it("reads an engine outage and its recovery back", () => {
    expect(
      readBackNotice(
        "The trading engine stopped at 2:37 PM EDT",
        "Watched orders and ladder rungs will not fire until it is running again."
      )
    ).toEqual({
      headline: "Trading engine stopped",
      meta: ["2:37 PM EDT", "down"],
      kind: "system",
      level: "warning",
    })
    expect(
      readBackNotice(
        "The trading engine came back at 2:43 PM EDT",
        "It was unavailable for 5 minutes 13 seconds. Watched orders and ladder rungs are working again."
      )
    ).toEqual({
      headline: "Trading engine was down 5m 13s",
      meta: ["2:43 PM EDT", "recovered"],
      kind: "system",
      level: "warning",
    })
  })

  it("will not read back a sentence far longer than any it writes", () => {
    // `message` is an unbounded text column and this runs on every row on every
    // render, so a huge string never reaches the patterns. It keeps the shell's
    // own look, the same as any sentence this app does not recognise.
    const real = "Entered a trade: $431 of XBT at $86,194 (Ku1)"
    expect(readBackNotice(real, null)).not.toBeNull()
    expect(readBackNotice(real + "x".repeat(400), null)).toBeNull()
  })

  it("says nothing about a sentence it does not recognise", () => {
    // A flow's stop, which has no figures to find. The bell then draws the
    // sentence exactly as it drew it before any of this existed.
    expect(readBackNotice("Flow Morning buy stopped", "The wallet was switched off.")).toBeNull()
    expect(readBackNotice(null, null)).toBeNull()
  })
})

/**
 * The one that would break quietly. Everything above is a sentence typed into
 * this file; these are built by the same code that writes real notices, so a
 * change to the wording that the reader cannot follow fails here rather than
 * silently turning half the bell back into prose.
 */
describe("the reader keeps up with the writer", () => {
  const cases = [
    fillNoticeWords({
      marketKey: "hyperliquid:mainnet:ETH",
      side: "buy",
      px: 90,
      sz: 5.5,
      closedPnl: 0,
      dir: "Open Long",
      liquidation: false,
      walletLabel: "Hyperliquid main",
      practice: false,
    }),
    fillNoticeWords({
      marketKey: "hyperliquid:mainnet:ETH",
      side: "sell",
      px: 90,
      sz: 5.5,
      closedPnl: -55,
      dir: "Close Long",
      liquidation: false,
      walletLabel: "Hyperliquid main",
      practice: false,
    }),
    triggerNoticeWords({
      kind: "stop",
      marketKey: "hyperliquid:mainnet:ETH",
      side: "sell",
      px: 80,
      closedPnl: -55,
      walletLabel: "Hyperliquid main",
      practice: false,
    }),
    priceAlertNoticeWords({
      marketKey: "hyperliquid:mainnet:ETH",
      price: 3_600,
      direction: "above",
    }),
    drawingAlertNoticeWords({
      marketKey: "hyperliquid:mainnet:BTC",
      kind: "trendline",
      price: 61_200,
      direction: "below",
    }),
  ]

  it.each(cases.map((one) => [one.title, one] as const))(
    "recovers the same heading and kind from %s",
    (_title, words) => {
      const readBack = readBackNotice(words.title, words.body)
      expect(readBack).not.toBeNull()
      expect(readBack!.headline).toBe(words.headline)
      expect(readBack!.kind).toBe(words.kind)
      expect(readBack!.level).toBe(words.level)
    }
  )
})
