import { describe, expect, it } from "vitest"

import { DASHBOARD_PROTOCOLS, marketChartHref } from "@/lib/protocols/contracts"
import {
  dashboardNetwork,
  readHiddenProtocols,
  readProtocolOrder,
  readTradeDashboardSearch,
  shownProtocols,
  viewFromSearch,
} from "@/lib/trade/dashboard-view"

/** What the Trade dashboard's address picks, and the Protocols block lists. */
describe("the Trade dashboard's address", () => {
  it("keeps the rows it knows and drops the rest", () => {
    expect(readTradeDashboardSearch({ view: "overview", network: "testnet" })).toEqual({
      view: "overview",
      market: undefined,
      network: "testnet",
    })
    expect(readTradeDashboardSearch({ view: "dukascopy" }).view).toBeUndefined()
    expect(readTradeDashboardSearch({ view: "nowhere" }).view).toBeUndefined()
  })

  it("lets a market name its own exchange, over the view", () => {
    expect(viewFromSearch({ view: "overview", market: "phemex:mainnet:BTCUSDT" })).toBe("phemex")
    expect(viewFromSearch({ view: "kucoin" })).toBe("kucoin")
    // A bare /trade opens on the row picked last.
    expect(viewFromSearch({})).toBeNull()
  })

  it("opens a practice network only on an exchange that has one", () => {
    expect(dashboardNetwork("hyperliquid", { network: "testnet" })).toBe("testnet")
    expect(dashboardNetwork("hyperliquid", { market: "hyperliquid:testnet:BTC" })).toBe("testnet")
    expect(dashboardNetwork("phemex", { network: "testnet" })).toBe("mainnet")
  })

  it("links every market to /trade, which reads its exchange off the key", () => {
    expect(marketChartHref("kucoin:mainnet:XBTUSDTM")).toBe("/trade?market=kucoin%3Amainnet%3AXBTUSDTM")
    // Dukascopy is history only, with no place on the dashboard.
    expect(marketChartHref("dukascopy:mainnet:EURUSD")).toBeNull()
  })
})

describe("the Protocols block's rows", () => {
  it("lists all eleven exchanges to start", () => {
    expect(shownProtocols([], null)).toEqual(DASHBOARD_PROTOCOLS)
    expect(DASHBOARD_PROTOCOLS).toHaveLength(11)
  })

  it("leaves out the hidden ones, but never the one on screen", () => {
    expect(shownProtocols(["phemex", "kucoin"], "hyperliquid")).not.toContain("phemex")
    expect(shownProtocols(["phemex"], "phemex")).toContain("phemex")
  })

  it("cleans a stored list to known exchanges, once each, in the block's order", () => {
    expect(readHiddenProtocols(["kucoin", "x", "phemex", "kucoin"])).toEqual(["phemex", "kucoin"])
    expect(readHiddenProtocols("phemex")).toEqual([])
  })

  it("lists them in the order dragged, still leaving out the hidden ones", () => {
    const order = readProtocolOrder(["aster", "kucoin"])
    expect(shownProtocols(["kucoin"], null, order).slice(0, 2)).toEqual(["aster", DASHBOARD_PROTOCOLS[0]])
  })

  it("makes a stored order whole: saved ones first, then the rest in the block's order", () => {
    const order = readProtocolOrder(["kucoin", "x", "aster", "kucoin"])
    expect(order.slice(0, 2)).toEqual(["kucoin", "aster"])
    expect(order.slice(2)).toEqual(DASHBOARD_PROTOCOLS.filter((id) => id !== "kucoin" && id !== "aster"))
    expect(readProtocolOrder(null)).toEqual(DASHBOARD_PROTOCOLS)
  })
})
