import { describe, expect, it } from "vitest"

import {
  DUKASCOPY_IDS,
  DUKASCOPY_INSTRUMENTS,
} from "@/lib/protocols/dukascopy/instruments.generated"
import {
  dukascopyFirstBar,
  dukascopyInstrumentFor,
} from "@/lib/protocols/dukascopy/instruments"
import {
  COINS_THAT_SPELL_A_US_STOCK,
  DUKASCOPY_ALIASES,
  dukascopyCategory,
  dukascopySymbol,
  usStockInstrumentId,
} from "@/lib/protocols/dukascopy/naming"

/**
 * The alias table is typed by hand, and a typo in it would send a venue's
 * gold market to an instrument that does not exist. So every entry is
 * checked against the list Dukascopy actually publishes.
 */
describe("the alias table", () => {
  const published = new Set(DUKASCOPY_IDS)

  it("names only instruments Dukascopy publishes", () => {
    for (const [venueName, instrumentId] of Object.entries(DUKASCOPY_ALIASES)) {
      expect(published.has(instrumentId), `${venueName} -> ${instrumentId}`).toBe(
        true
      )
      // And each one carries a start date, or the store could not fill it.
      expect(DUKASCOPY_INSTRUMENTS[instrumentId], instrumentId).toBeDefined()
    }
  })

  it("lists 1,499 instruments, 615 of them US stocks", () => {
    expect(DUKASCOPY_IDS).toHaveLength(1499)
    expect(DUKASCOPY_IDS.filter((id) => id.endsWith("ususd"))).toHaveLength(615)
  })

  it("keeps the coin exceptions honest", () => {
    // An entry here only earns its place while a US stock really does share
    // the letters. A stale one would send a coin to nothing for no reason.
    for (const coin of COINS_THAT_SPELL_A_US_STOCK) {
      expect(published.has(usStockInstrumentId(coin)), coin).toBe(true)
    }
  })
})

describe("naming", () => {
  it("finds a US stock by its ticker whatever the case", () => {
    expect(dukascopyInstrumentFor("TSLA", false)).toBe("tslaususd")
    expect(dukascopyInstrumentFor("aapl", false)).toBe("aaplususd")
    expect(dukascopyInstrumentFor("SPY", false)).toBe("spyususd")
  })

  it("refuses a name it cannot place", () => {
    expect(dukascopyInstrumentFor("KIOXIA", true)).toBeNull()
    expect(dukascopyInstrumentFor("BTC", false)).toBeNull()
    expect(dukascopyInstrumentFor("../x", true)).toBeNull()
  })

  it("lets a venue that knows it is a stock past the coin exceptions", () => {
    expect(dukascopyInstrumentFor("SUI", false)).toBeNull()
    expect(dukascopyInstrumentFor("SUI", true)).toBe("suiususd")
  })

  it("prints the venue's kind of name", () => {
    expect(dukascopySymbol("tslaususd")).toBe("TSLA")
    expect(dukascopySymbol("fbususd")).toBe("META")
    expect(dukascopySymbol("xauusd")).toBe("XAU")
    expect(dukascopySymbol("usa500idxusd")).toBe("US500")
    expect(dukascopySymbol("lightcmdusd")).toBe("WTI")
  })

  it("reads the category off the id and never says other", () => {
    expect(dukascopyCategory("tslaususd")).toBe("stocks")
    expect(dukascopyCategory("usa500idxusd")).toBe("indices")
    expect(dukascopyCategory("xauusd")).toBe("commodities")
    expect(dukascopyCategory("lightcmdusd")).toBe("commodities")
    expect(dukascopyCategory("eurusd")).toBe("forex")
  })

  it("knows when each instrument's bars begin", () => {
    // Tesla's minutes start on 26 Jan 2017; the S&P 500's dailies in 1980.
    expect(dukascopyFirstBar("tslaususd", "1h")).toBe(
      Date.parse("2017-01-26T00:00:00.000Z")
    )
    expect(dukascopyFirstBar("usa500idxusd", "1d")).toBe(
      Date.parse("1980-01-02T00:00:00.000Z")
    )
    expect(dukascopyFirstBar("usa500idxusd", "4h")).toBe(
      Date.parse("2012-01-16T00:00:00.000Z")
    )
    expect(dukascopyFirstBar("nothing", "1h")).toBeNull()
  })
})
