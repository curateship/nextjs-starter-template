import { describe, expect, it } from "vitest"

import {
  marketPageTitle,
  marketTitleFromMatches,
  tradePageTitle,
} from "@/app/page-title"

const matches = [
  { routeId: "__root__", loaderData: { appName: "Trade" } },
  { routeId: "/_authenticated/admin/hyper-liquid" },
]

describe("trade page titles", () => {
  it("keeps the saved app name at the end", () => {
    expect(tradePageTitle(matches, "Backtests")).toBe("Backtests · Trade")
  })

  it("names a market and its exchange", () => {
    expect(
      marketPageTitle(matches, "hyperliquid:mainnet:BTC", "Hyperliquid")
    ).toBe("BTC · Hyperliquid · Trade")
  })

  it("names a Solana coin by its shortened mint, not 44 characters of it", () => {
    // The whole address filled the tab and said nothing. The market header
    // on the page still shows the real ticker, which it has the row for.
    expect(
      marketPageTitle(
        matches,
        "solana:mainnet:CbyTNf7UPzvewHh4Zp6umogM2RWahhmGRJWLJnPwpump",
        "Solana"
      )
    ).toBe("CbyTNf…pump · Solana · Trade")
  })

  it("falls back to the screen name when the market is missing or invalid", () => {
    expect(marketPageTitle(matches, undefined, "Aster")).toBe("Aster · Trade")
    expect(marketPageTitle(matches, "not-a-market", "KuCoin")).toBe(
      "KuCoin · Trade"
    )
  })

  it("reads the current market from the matched route", () => {
    expect(
      marketTitleFromMatches(
        [...matches, { routeId: "run", search: { coin: "aster:mainnet:ETH" } }],
        "coin",
        "Flow run"
      )
    ).toBe("ETH · Aster · Trade")
  })
})
