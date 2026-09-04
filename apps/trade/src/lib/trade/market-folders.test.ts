import { describe, expect, it } from "vitest"

import {
  DEFAULT_MARKET_PANEL_ROWS,
  readMarketPanelRows,
} from "@/lib/trade/market-folders"

describe("the stored market panel rows", () => {
  it("reads a row saved before hidden coins existed as nothing hidden", () => {
    expect(
      readMarketPanelRows({
        watched: { position: 0, hidden: false },
        all: { position: 3, hidden: true },
      })
    ).toEqual({
      watched: { position: 0, hidden: false },
      all: { position: 3, hidden: true },
      hiddenMarketKeys: [],
    })
  })

  it("keeps the hidden coins and drops a repeated one", () => {
    expect(
      readMarketPanelRows({
        watched: { position: -1, hidden: false },
        all: { position: 9, hidden: false },
        hiddenMarketKeys: [
          "hyperliquid:mainnet:DOGE",
          "hyperliquid:mainnet:PEPE",
          "hyperliquid:mainnet:DOGE",
        ],
      }).hiddenMarketKeys
    ).toEqual(["hyperliquid:mainnet:DOGE", "hyperliquid:mainnet:PEPE"])
  })

  it("falls back to the original arrangement for a bad value", () => {
    expect(readMarketPanelRows({ hiddenMarketKeys: ["x"] })).toEqual(
      DEFAULT_MARKET_PANEL_ROWS
    )
    expect(readMarketPanelRows(undefined)).toEqual(DEFAULT_MARKET_PANEL_ROWS)
  })
})
