import { describe, expect, it } from "vitest"

import {
  chosenWallet,
  tradeWalletNode,
  tradeWalletSettingsSchema,
} from "@/lib/recipes/trade-wallet"

/**
 * The wallet step's one question — pretend money, or a wallet that really
 * holds positions — and the sentence its canvas card says about the answer.
 */

describe("which wallet a step names", () => {
  it("answers nothing when no wallet is named", () => {
    expect(chosenWallet(tradeWalletNode.createSettings())).toBeNull()
  })

  it("treats an empty id as no wallet, not as a wallet called nothing", () => {
    expect(chosenWallet({ walletId: "" })).toBeNull()
  })

  it("reads the wallet a step names", () => {
    expect(
      chosenWallet({
        walletId: "w1",
        walletLabel: "Main",
        walletKind: "live",
        walletProtocol: "hyperliquid",
        walletNetwork: "mainnet",
      })
    ).toEqual({
      id: "w1",
      label: "Main",
      kind: "live",
      protocol: "hyperliquid",
      network: "mainnet",
    })
  })

  it("leaves the exchange unknown on a step saved before it was carried", () => {
    // Not a failure — the Wallet step fills both in the next time it opens.
    // Guessing an exchange here would point a real wallet at coins it cannot
    // trade, which is the one thing this must never do quietly.
    const older = chosenWallet({ walletId: "w1", walletLabel: "Main" })
    expect(older?.protocol).toBeNull()
    expect(older?.network).toBeNull()
  })

  it("never reads an unrecognised network as the practice one", () => {
    // Testnet prices are invented. A step that cannot be read must land on the
    // real network or on nothing, never quietly on the pretend one.
    expect(
      chosenWallet({ walletId: "w1", walletNetwork: "nonsense" })?.network
    ).toBeNull()
  })

  it("falls back to practice for an unreadable kind, never to real", () => {
    // A hand-edited flow must not be able to talk itself up into real money.
    expect(chosenWallet({ walletId: "w1", walletKind: "nonsense" })?.kind).toBe(
      "paper"
    )
  })

  it("stands in a phrase when the remembered name is missing", () => {
    expect(chosenWallet({ walletId: "w1" })?.label).toBe("a saved wallet")
  })
})

describe("what the step's card says", () => {
  const say = (settings: Record<string, unknown>) =>
    tradeWalletNode.description(settings as never)

  it("describes the pretend pot when no wallet is named", () => {
    expect(say(tradeWalletNode.createSettings())).toContain(
      "$10,000.00 of pretend money"
    )
  })

  it("names the wallet and says buys still have to be affordable", () => {
    expect(
      say({
        ...tradeWalletNode.createSettings(),
        walletId: "w1",
        walletLabel: "Practice 2",
        walletKind: "paper",
      })
    ).toBe(
      "Trades Practice 2 — practice money. Each watched buy is refused if the wallet cannot afford it when the price arrives."
    )
  })

  it("leads with REAL MONEY so a glance cannot mistake it", () => {
    // The canvas card is the glance. Anything softer than shouting reads the
    // same as a backtest from across the screen.
    expect(
      say({
        ...tradeWalletNode.createSettings(),
        walletId: "w1",
        walletLabel: "Main",
        walletKind: "live",
      })
    ).toMatch(/^REAL MONEY — /)
  })

  it("says real money out loud", () => {
    expect(
      say({
        ...tradeWalletNode.createSettings(),
        walletId: "w1",
        walletLabel: "Main",
        walletKind: "live",
      })
    ).toContain("real money")
  })

  it("does not ask for a wallet cap", () => {
    expect(
      say({
        ...tradeWalletNode.createSettings(),
        walletId: "w1",
        walletLabel: "Main",
        walletKind: "live",
      })
    ).not.toContain("how much of it this flow may use")
  })
})

describe("settings saved by an older build", () => {
  it("read back as pretend money with nothing missing", () => {
    const parsed = tradeWalletSettingsSchema.parse({
      startingUsd: 25_000,
      takerFeePct: 0.045,
      makerFeePct: 0.015,
      slippagePct: 0.05,
    })

    expect(parsed.walletId).toBeNull()
    expect(parsed.walletLabel).toBeNull()
    expect(parsed.walletKind).toBeNull()
  })
})
