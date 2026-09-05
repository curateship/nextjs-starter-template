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
    expect(listProtocols().map((one) => one.label)).toContain("Solana")
  })

  it("carries the trading blocks exactly where the flags say they are", () => {
    for (const id of KNOWN_PROTOCOLS) {
      const entry = getProtocol(id)
      expect(Boolean(entry.account)).toBe(entry.capabilities.accounts)
      expect(Boolean(entry.orders)).toBe(entry.capabilities.orders)
      // An exchange whose accounts can be read must say how a wallet there
      // signs in. The form may also exist without an account block — a
      // chain wallet that is made and funded before its holdings can be
      // read — but never without a way to prove the credential first.
      if (entry.capabilities.accounts) {
        expect(
          entry.credentials,
          `${entry.label} has no sign-in form`
        ).toBeTruthy()
      }
      if (entry.credentials) {
        expect(
          entry.agent,
          `${entry.label} stores a key it cannot prove`
        ).toBeTruthy()
        // The dialog offers "Make a new wallet" exactly where the entry can.
        expect(Boolean(entry.credentials.make)).toBe(
          entry.credentials.form.canMakeWallet
        )
      }
    }
  })

  it("reads a Solana wallet's holdings by address and swaps through Jupiter", () => {
    // Holdings are public on the chain, so the reader never needs the key.
    // Every order is a swap: the entry says so, and offers the quote a swap
    // venue shows before anything is signed.
    const entry = getProtocol("solana")
    expect(entry.networks).toEqual(["mainnet"])
    expect(entry.capabilities).toMatchObject({
      markets: true,
      accounts: true,
      orders: true,
      ordersAreSwaps: true,
    })
    expect(entry.account?.fetch).toBeTypeOf("function")
    expect(entry.account?.portfolio).toBeTypeOf("function")
    // The chain states no profit on a sale, so a zero is "not stated".
    expect(entry.account?.profitPerSale).toBe(false)
    expect(entry.orders?.place).toBeTypeOf("function")
    expect(entry.orders?.quote).toBeTypeOf("function")
    expect(entry.orders?.fills).toBeTypeOf("function")
    // Jupiter publishes no socket, so there is no line to push prices down;
    // the engine asks through the rationed read instead (`solana.md`).
    expect(entry.livePrices).toBeUndefined()
    // An open network lists more coins than any list holds, so Solana is
    // the one venue with a lookup beside its list.
    expect(entry.markets.search).toBeTypeOf("function")
    expect(entry.funding).toBeUndefined()
    expect(entry.credentials?.make).toBeTypeOf("function")
    // Publishes no candles of its own: its charts are borrowed or recorded.
    expect(entry.markets.recordsOwnBars).toBe(true)
    const form = entry.credentials?.form
    // A Solana key is not an EVM agent key: the 64-hex shape check would
    // refuse every real one.
    expect(form?.secretIsAgentKey).toBe(false)
    expect(form?.needsPassphrase).toBe(false)
    expect(form?.canMakeWallet).toBe(true)
    expect(form?.keyHelp).toContain("only what you mean to trade")
  })

  it("does not call Lighter's key an EVM agent key, because it is not one", () => {
    // `secretIsAgentKey` turns on the dialog's EVM shape checks, and those
    // insist a key is 32 bytes. Lighter's are 40, so this being true refused
    // every real Lighter key with "a key is exactly 64 characters" before it
    // could be saved. Found by typing one into the running app.
    const form = getProtocol("lighter").credentials?.form
    expect(form?.secretIsAgentKey).toBe(false)
    expect(form?.needsPassphrase).toBe(false)
    expect(form?.addressLabel).toBe("Lighter account address")
    expect(form?.secretLabel).toBe("API private key")
    // Trade works the account number and key slot out for itself, so nobody
    // is asked to find them, and the wallet's own Ethereum key is never
    // wanted.
    expect(form?.keyHelp).toContain("never asks for the wallet's own Ethereum")
  })

  it("reads Lighter's key from the field the dialog actually sends", () => {
    // **This is the bug that made a real save fail.** The dialog puts the
    // pasted secret in `agentKey` only when `secretIsAgentKey` is true, and
    // in `secret` otherwise. Lighter's is false, so a packer reading only
    // `agentKey` received nothing and refused a key that was plainly there.
    const pack = getProtocol("lighter").credentials?.pack
    const key = `0x${"ab".repeat(40)}`
    expect(pack?.({ secret: key })).toBe(key)
  })

  it("keeps Lighter's key rule where the right length lives", () => {
    // The length rule did not disappear when the flag above went false — it
    // moved to the packer, which knows Lighter's real number.
    const pack = getProtocol("lighter").credentials?.pack
    expect(() => pack?.({ secret: `0x${"ab".repeat(40)}` })).not.toThrow()
    // A 32-byte key is the Ethereum shape, and Lighter refuses it.
    expect(() => pack?.({ secret: `0x${"ab".repeat(32)}` })).toThrow(
      /^KEY_NOT_APPROVED:/
    )
    expect(() => pack?.({ secret: "  " })).toThrow("KEY_SECRET_REQUIRED")
  })

  it("refuses a Lighter key in words the wallet window can show", () => {
    // Only `KEY_NOT_APPROVED:` and `WALLET_POSITION_MODE:` carry a reason
    // through to the screen. Any other code, however well worded, is dropped
    // and the person sees only "That did not save. Try it again."
    const pack = getProtocol("lighter").credentials?.pack
    try {
      pack?.({ secret: "0xdeadbeef" })
      throw new Error("should have refused")
    } catch (error) {
      const message = (error as Error).message
      expect(message.startsWith("KEY_NOT_APPROVED:")).toBe(true)
      expect(message).toContain("80 characters")
      // A refusal never repeats the key back.
      expect(message).not.toContain("deadbeef")
    }
  })

  it("distinguishes Aster's main wallet from its generated API wallet", () => {
    const form = getProtocol("aster").credentials?.form
    expect(form?.addressLabel).toBe("Main Aster wallet address")
    expect(form?.secretLabel).toBe("API wallet key")
    expect(form?.keyHelp).toContain("you do not paste that address")
  })

  it("keeps a venue with no candles of its own out of the backtest picker", () => {
    // The picker offers venues that list markets, take orders and publish
    // candles of their own — the rule `backtests.ts` applies. Solana takes
    // orders and records its own bars, so the third rule is what keeps
    // borrowed and recorded history away from a run that would read as a
    // real result.
    const pickable = listProtocols().filter(
      (one) =>
        one.capabilities.markets &&
        one.capabilities.orders &&
        !one.markets.recordsOwnBars &&
        one.networks.includes("mainnet")
    )
    expect(pickable.map((one) => one.id)).not.toContain("solana")
    expect(pickable.map((one) => one.id)).toContain("hyperliquid")
  })

  it("gives every exchange the app trades on a pushed price feed", () => {
    // The engine looks at trigger prices every second with real money behind
    // them. A pushed price arrives the moment it changes; an asked-for one
    // can be seconds old and is rationed by the exchange, and the exchange
    // rations the whole app rather than one screen. An exchange that can take
    // an order and has no feed is the gap this closes.
    for (const entry of listProtocols()) {
      if (!entry.capabilities.orders) continue
      // Solana is the one venue with orders and no socket to push prices:
      // Jupiter publishes none, and a coin's price there is a route across
      // pools rather than one pool's number (`solana.md`, "Why not a
      // socket"). The engine asks it through the rationed read, and the
      // entry says so by recording its own bars from those reads.
      if (entry.markets.recordsOwnBars) continue
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
