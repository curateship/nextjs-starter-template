import { describe, expect, it } from "vitest"

import { getCandlesErrorMessage } from "@/lib/api/candles"
import { getLiveErrorMessage } from "@/lib/api/live"
import { getSmartOrderErrorMessage } from "@/lib/api/smart-orders"

/**
 * The refusals that carry their own sentence, and reach the screen intact.
 *
 * **Why these need pinning.** Most refusals are a bare code looked up in a
 * table of fixed sentences. A few cannot be: they name figures — the leverage
 * this market allows, what the position is holding, where liquidation would
 * land against the stop, what this venue's smallest order comes to — so the
 * sentence is built where the figures are and travels with the code.
 *
 * Each of those needs a line in the reader that pulls it back out. Miss one
 * and it falls through to "That did not go through. Try it again.", which is
 * the least useful thing the app can say about real money. All four of the
 * ones added with the part close and the leverage window did exactly that
 * until this test was written.
 */

describe("a refusal that carries its own figures", () => {
  it("hands back the leverage cap this market states", () => {
    expect(
      getLiveErrorMessage(
        new Error(
          "LIVE_LEVERAGE_TOO_HIGH:Hyperliquid allows at most 10x on this market."
        )
      )
    ).toBe("Hyperliquid allows at most 10x on this market.")
  })

  it("hands back what the position is holding when too much is asked back", () => {
    expect(
      getLiveErrorMessage(
        new Error(
          "LIVE_MARGIN_TOO_MUCH:This position is holding $99.12 of margin, and taking $500.00 back would leave nothing behind it."
        )
      )
    ).toBe(
      "This position is holding $99.12 of margin, and taking $500.00 back would leave nothing behind it."
    )
  })

  it("hands back both prices when margin out would pass the stop", () => {
    const said = getLiveErrorMessage(
      new Error(
        "LIVE_MARGIN_PAST_STOP:Taking that out moves the liquidation price to about $92.00, which the market reaches before the stop at $90.00 — the exchange would take the trade before the stop could. Take out less, or move the stop first."
      )
    )
    expect(said).toContain("$92.00")
    expect(said).toContain("$90.00")
    expect(said).not.toContain("LIVE_")
  })

  it("hands back this venue's floor when a part close is too small", () => {
    expect(
      getSmartOrderErrorMessage(
        new Error(
          "PART_CLOSE_TOO_SMALL:Hyperliquid's smallest order here is $10, and this piece is $4."
        )
      )
    ).toBe("Hyperliquid's smallest order here is $10, and this piece is $4.")
  })

  it("still says something honest about a code it does not know", () => {
    expect(getLiveErrorMessage(new Error("SOMETHING_NEW"))).toBe(
      "That did not go through. Try it again."
    )
  })

  it("does not tell anyone to retry an exchange it cannot trade yet", () => {
    // Lighter can hold a wallet but not place an order, which no venue had
    // done before. Without this the screen said "That did not go through.
    // Try it again." about something that can never go through, on a screen
    // about real money.
    const said = getLiveErrorMessage(new Error("PROTOCOL_NO_ORDERS:lighter"))
    expect(said).toContain("Lighter")
    expect(said).toContain("cannot place")
    expect(said).not.toContain("Try it again")
    // The venue is named from the id, so the next exchange in this position
    // reads correctly without another edit here.
    expect(getLiveErrorMessage(new Error("PROTOCOL_NO_ORDERS:kucoin"))).toContain(
      "KuCoin"
    )
    // An id this build does not know must not be printed back raw.
    expect(
      getLiveErrorMessage(new Error("PROTOCOL_NO_ORDERS:whatever"))
    ).toContain("This exchange")
  })

  it("shows a Lighter refusal's own words rather than a retry", () => {
    // Closing a Lighter position failed with "That did not go through. Try it
    // again." because the connector's own codes reach no screen. The order
    // path now badges them `LIVE_EXCHANGE:`, which does.
    const blocked = getLiveErrorMessage(
      new Error(
        "LIVE_EXCHANGE:Lighter will not accept orders from this server's country."
      )
    )
    expect(blocked).toContain("country")
    expect(blocked).not.toContain("Try it again")

    const missing = getLiveErrorMessage(
      new Error("LIVE_EXCHANGE:Lighter's signing files are not on this server.")
    )
    expect(missing).toContain("signing files")
  })

  it("tells a chart why it did not draw, when the app itself refused", () => {
    // `EXCHANGE_BUSY` is the app's own counter refusing before a request
    // leaves. It was not in the chart's list, so it fell through to "Nothing
    // is wrong on your side", which sent Tyler hunting for a broken chart
    // while Lighter's sixty-a-minute allowance was simply spent.
    const said = getCandlesErrorMessage(new Error("EXCHANGE_BUSY"))
    expect(said).toContain("allowance")
    expect(said).not.toContain("Nothing is wrong on your side")

    // The exchange saying it, rather than the app, still reads its own way.
    expect(getCandlesErrorMessage(new Error("429 Too Many Requests"))).toContain(
      "slow down"
    )
    // And anything genuinely unknown keeps the honest fallback.
    expect(getCandlesErrorMessage(new Error("SOMETHING_ELSE"))).toContain(
      "could not load"
    )
  })

  it("keeps the fixed sentences for the codes that carry no figures", () => {
    expect(
      getLiveErrorMessage(new Error("LIVE_LEVERAGE_UNSUPPORTED"))
    ).toContain("cannot change leverage")
    expect(getLiveErrorMessage(new Error("LIVE_MARGIN_UNSUPPORTED"))).toContain(
      "cannot add or take back"
    )
    expect(
      getSmartOrderErrorMessage(new Error("PART_CLOSE_POSITION_GONE"))
    ).toContain("not there any more")
  })
})
