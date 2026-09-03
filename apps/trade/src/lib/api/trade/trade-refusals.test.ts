import { describe, expect, it } from "vitest"

import { getCandlesErrorMessage } from "@/lib/api/trade/candles"
import { getLiveErrorMessage } from "@/lib/api/trade/live"
import { getSmartOrderErrorMessage } from "@/lib/api/trade/smart-orders"

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
  it("explains why an older engine blocks a market-first ladder", () => {
    expect(
      getSmartOrderErrorMessage(new Error("LIVE_ENGINE_DCA_MARKET_FIRST_OLD"))
    ).toContain("Deploy the web app and trading engine together")
  })

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
    expect(
      getLiveErrorMessage(new Error("PROTOCOL_NO_ORDERS:kucoin"))
    ).toContain("KuCoin")
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

  it("shows the measured Lighter allowance when it blocks a close", () => {
    const said = getLiveErrorMessage(
      new Error("EXCHANGE_BUSY:spent 25 of 24 this minute (24 read, 1 socket)")
    )

    expect(said).toContain("The exchange")
    expect(said).toContain("25 of 24")
    expect(said).toContain("24 read")
    expect(said).not.toContain("That did not go through")
  })

  it("names the exchange that would not answer, and guesses no cause", () => {
    /**
     * `EXCHANGE_BUSY` is thrown by Lighter, Aster AND KuCoin, and Aster
     * throws it for a plain timeout where nothing is rationed at all. An
     * earlier version of this message announced that the allowance was
     * spent — a guess dressed as a fact, and it cost a day of looking at the
     * wrong exchange. So it says WHICH venue and stops there.
     */
    const named = getCandlesErrorMessage(new Error("EXCHANGE_BUSY:Lighter"))
    expect(named).toContain("Lighter")
    expect(named).not.toContain("allowance")
    expect(named).not.toContain("Nothing is wrong on your side")

    // A different venue reads as itself, from the same code.
    expect(getCandlesErrorMessage(new Error("EXCHANGE_BUSY:Aster"))).toContain(
      "Aster"
    )

    /**
     * **The count reaches the screen.** Four guesses were made at why this
     * fires on the deployed site and not locally, all wrong, because nothing
     * said what had been spent. The figures travel with the refusal now.
     */
    const counted = getCandlesErrorMessage(
      new Error(
        "EXCHANGE_BUSY:Lighter — spent 34 of 34 this minute (22 read, 12 socket)"
      )
    )
    expect(counted).toContain("Lighter")
    expect(counted).toContain("34 of 34")
    expect(counted).toContain("22 read")
    expect(counted).toContain("12 socket")
    // And an unnamed one must never print a raw code back.
    const bare = getCandlesErrorMessage(new Error("EXCHANGE_BUSY"))
    expect(bare).toContain("exchange")
    expect(bare).not.toContain("EXCHANGE_BUSY")

    // The exchange saying it, rather than the app, still reads its own way.
    expect(
      getCandlesErrorMessage(new Error("429 Too Many Requests"))
    ).toContain("slow down")
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

  it("says a refused grid adjustment left the existing grid running", () => {
    const said = getSmartOrderErrorMessage(new Error("SMART_GRID_ADJUST_BUSY"))
    expect(said).toContain("changes were not saved")
    expect(said).toContain("still running")
    expect(said).not.toContain("Nothing was placed")
  })

  it("says when an edit lost a race with a grid finishing", () => {
    expect(getSmartOrderErrorMessage(new Error("SMART_GRID_FINISHED"))).toBe(
      "That grid has already finished, so nothing was changed."
    )
  })
})
