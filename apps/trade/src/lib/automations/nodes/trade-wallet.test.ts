import { describe, expect, it } from "vitest"

import {
  chosenWallet,
  tradeWalletNode,
  tradeWalletSettingsSchema,
} from "@/lib/automations/nodes/trade-wallet"

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
        spendCapUsd: 500,
        walletProtocol: "hyperliquid",
        walletNetwork: "mainnet",
      })
    ).toEqual({
      id: "w1",
      label: "Main",
      kind: "live",
      capUsd: 500,
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

  it("names the wallet, the cap and which kind of money", () => {
    expect(
      say({
        ...tradeWalletNode.createSettings(),
        walletId: "w1",
        walletLabel: "Practice 2",
        walletKind: "paper",
        spendCapUsd: 500,
      })
    ).toBe(
      // The cap is a ceiling, never a promise: "up to $10,000 of real money"
      // on a wallet holding $900 read as ten thousand to spend.
      "Trades Practice 2 — practice money, capped at $500.00. It can never spend more than the wallet holds."
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
        spendCapUsd: 250,
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
        spendCapUsd: 250,
      })
    ).toContain("real money")
  })

  it("asks for the cap rather than implying there is no limit", () => {
    expect(
      say({
        ...tradeWalletNode.createSettings(),
        walletId: "w1",
        walletLabel: "Main",
        walletKind: "live",
      })
    ).toContain("how much of it this flow may use")
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
    expect(parsed.spendCapUsd).toBeNull()
  })
})
