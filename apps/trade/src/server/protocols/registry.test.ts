import { describe, expect, it } from "vitest"

import { KNOWN_PROTOCOLS } from "@/lib/protocols/contracts"
import {
  getProtocol,
  listProtocols,
  pricesEverySale,
} from "@/server/protocols/registry"

/**
 * The registry's one promise: every id the app knows resolves to a complete
 * entry. A key in `ProtocolId` with no entry here would make `getProtocol`
 * answer undefined somewhere deep in a settle — this pins the failure to a
 * test with the exchange's name in it instead.
 */
describe("the protocol registry", () => {
  it("answers for every protocol the app knows", () => {
    for (const id of KNOWN_PROTOCOLS) {
      const entry = getProtocol(id)
      expect(entry.id).toBe(id)
      expect(entry.networks.length).toBeGreaterThan(0)
      expect(entry.networks).toContain(entry.defaultNetwork)
    }
    expect(
      listProtocols()
        .map((one) => one.id)
        .sort()
    ).toEqual([...KNOWN_PROTOCOLS].sort())
    expect(listProtocols().map((one) => one.label)).toContain("Aster")
  })

  it("carries the trading blocks exactly where the flags say they are", () => {
    for (const id of KNOWN_PROTOCOLS) {
      const entry = getProtocol(id)
      expect(Boolean(entry.account)).toBe(entry.capabilities.accounts)
      expect(Boolean(entry.orders)).toBe(entry.capabilities.orders)
      // The sign-in form travels with accounts: an exchange someone can hold
      // a wallet on must say how that wallet signs in, and one they cannot
      // must not offer a form for it.
      expect(Boolean(entry.credentials)).toBe(entry.capabilities.accounts)
    }
  })

  it("distinguishes Aster's main wallet from its generated API wallet", () => {
    const form = getProtocol("aster").credentials?.form
    expect(form?.addressLabel).toBe("Main Aster wallet address")
    expect(form?.secretLabel).toBe("API wallet key")
    expect(form?.keyHelp).toContain("you do not paste that address")
  })

  it("gives every exchange the app trades on a pushed price feed", () => {
    // The engine looks at trigger prices every second with real money behind
    // them. A pushed price arrives the moment it changes; an asked-for one
    // can be seconds old and is rationed by the exchange, and the exchange
    // rations the whole app rather than one screen. An exchange that can take
    // an order and has no feed is the gap this closes.
    for (const entry of listProtocols()) {
      if (!entry.capabilities.orders) continue
      expect(
        entry.livePrices,
        `${entry.label} has no pushed price feed`
      ).toBeTruthy()
    }
  })

  it("lets every exchange say when the price it gave was a stale one", () => {
    // The engine asks this before acting on a price it had to ask for. An
    // exchange that cannot say would have its rationed, stale price treated
    // as today's — which is how a trigger fires on a number from a minute
    // ago.
    for (const entry of listProtocols()) {
      if (!entry.capabilities.orders) continue
      expect(
        typeof entry.markets.pricesWereRationed,
        `${entry.label} cannot say when a price was stale`
      ).toBe("function")
    }
  })

  it("says which exchanges price every sale, so no screen has to guess", () => {
    // KuCoin only pays out a figure when a whole position closes, so its
    // partial sales report zero and that zero means "not stated". Every
    // other exchange states one per sale. Sitting here rather than in the
    // Dashboard is the point: the fact belongs to the exchange it is true of.
    expect(pricesEverySale("kucoin")).toBe(false)
    expect(pricesEverySale("hyperliquid")).toBe(true)
    expect(pricesEverySale("phemex")).toBe(true)
    // An exchange with no accounts has no fills either, so its answer is
    // never used — but it must still be an answer, not a crash.
    for (const id of KNOWN_PROTOCOLS) {
      expect(typeof pricesEverySale(id)).toBe("boolean")
    }
  })

  it("names each feed for the worker's heartbeat", () => {
    // The Workers screen shows one line per open feed. It is built from the
    // registry, so a new exchange appears there by existing rather than by
    // anybody remembering to add it.
    const named = listProtocols()
      .filter((entry) => entry.livePrices)
      .map((entry) => entry.label)
    expect(named).toContain("Hyperliquid")
    expect(named).toContain("Phemex")
    expect(named).toContain("KuCoin")
    expect(named).toContain("Aster")
    expect(named).toContain("Lighter")
  })
})
