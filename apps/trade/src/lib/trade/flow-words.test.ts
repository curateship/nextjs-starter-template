import { describe, expect, it } from "vitest"

import { flowVenueMismatchProblem } from "@/lib/trade/flow-words"

describe("a flow whose Markets step and wallet disagree", () => {
  it("names both exchanges in the refusal", () => {
    expect(
      flowVenueMismatchProblem({
        marketProtocol: "binance",
        marketKeys: ["binance:mainnet:BTC"],
        walletLabel: "Aster main",
        walletProtocol: "aster",
        walletNetwork: "mainnet",
      })
    ).toBe(
      "The Markets step names Binance, but Aster main trades Aster. Choose Aster markets for this wallet."
    )
  })

  it("names the wrong Aster network rather than implying both sides agree", () => {
    expect(
      flowVenueMismatchProblem({
        marketProtocol: "aster",
        // The first coin agrees. The old wording named that one and produced
        // "Aster but Aster", hiding the testnet coin that caused the refusal.
        marketKeys: ["aster:mainnet:BTC", "aster:testnet:ETH"],
        walletLabel: "Aster main",
        walletProtocol: "aster",
        walletNetwork: "mainnet",
      })
    ).toBe(
      "The Markets step names Aster Testnet, but Aster main trades Aster. Choose Aster markets for this wallet."
    )
  })

  it("allows Aster mainnet markets with an Aster mainnet wallet", () => {
    expect(
      flowVenueMismatchProblem({
        marketProtocol: "aster",
        marketKeys: ["aster:mainnet:BTC", "aster:mainnet:ETH"],
        walletLabel: "Aster main",
        walletProtocol: "aster",
        walletNetwork: "mainnet",
      })
    ).toBeNull()
  })
})
