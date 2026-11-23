import { describe, expect, it } from "vitest"
import { historySourceFor } from "@/lib/protocols/history-source"
import { dukascopyInstrumentFor } from "@/lib/protocols/dukascopy/instruments"
import { ROBINHOOD_DUKASCOPY_HISTORY } from "./history"

const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec"
const META = "0xc0d6457c16cc70d6790dd43521c899c87ce02f35"
const GME = "0x1b0e319c6a659f002271b69db8a7df2f911c153e"
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73"
// Named "NVIDIA • Robinhood Token", but Robinhood's factory did not make it.
const FAKE_NVDA = "0x1076f47f9632d726cf0ff93ad1616c45cbb8b94d"
const PONS = "0x39dbed3a2bd333467115de45665cc57f813c4571"

describe("Robinhood Chain's borrowed history", () => {
  it("borrows Dukascopy for a stock token Robinhood made", () => {
    expect(historySourceFor(`robinhood:mainnet:${NVDA}`)).toBe(
      "dukascopy:mainnet:nvdaususd"
    )
    // Upper-case addresses are the same token.
    const mixedCase = NVDA.replace(/[a-f]/g, (c) => c.toUpperCase())
    expect(historySourceFor(`robinhood:mainnet:${mixedCase}`)).toBe(
      "dukascopy:mainnet:nvdaususd"
    )
    // Dukascopy still files Meta under its old ticker.
    expect(historySourceFor(`robinhood:mainnet:${META}`)).toBe(
      "dukascopy:mainnet:fbususd"
    )
  })
  it("borrows nothing for an impostor, whatever it is called", () => {
    expect(historySourceFor(`robinhood:mainnet:${FAKE_NVDA}`)).toBeNull()
  })
  it("borrows nothing for a real stock Dukascopy does not carry", () => {
    expect(historySourceFor(`robinhood:mainnet:${GME}`)).toBeNull()
  })
  it("borrows Binance only for the chain's own wrapped ETH", () => {
    expect(historySourceFor(`robinhood:mainnet:${WETH}`)).toBe(
      "binance:mainnet:ETH"
    )
    expect(historySourceFor(`robinhood:mainnet:${PONS}`)).toBeNull()
    expect(historySourceFor(`robinhood:testnet:${WETH}`)).toBeNull()
  })
  it("pins only lowercase addresses whose tickers Dukascopy lists", () => {
    const entries = Object.entries(ROBINHOOD_DUKASCOPY_HISTORY)
    expect(entries).toHaveLength(72)
    for (const [address, ticker] of entries) {
      expect(address).toMatch(/^0x[\da-f]{40}$/)
      expect(dukascopyInstrumentFor(ticker, true), ticker).not.toBeNull()
    }
  })
})
