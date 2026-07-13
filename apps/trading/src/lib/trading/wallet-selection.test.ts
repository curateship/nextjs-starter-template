import { describe, expect, it } from "vitest"

import { resolveSelectedWalletValue } from "@/lib/trading/wallet-selection"

const validWallets = new Set(["testnet", "mainnet"])

describe("resolveSelectedWalletValue", () => {
  it("restores the last selected wallet when the URL has no wallet", () => {
    expect(
      resolveSelectedWalletValue(undefined, "mainnet", validWallets, "testnet")
    ).toBe("mainnet")
  })

  it("uses an explicit valid wallet from the URL", () => {
    expect(
      resolveSelectedWalletValue("testnet", "mainnet", validWallets, null)
    ).toBe("testnet")
  })

  it("ignores saved wallets that no longer exist", () => {
    expect(
      resolveSelectedWalletValue(undefined, "removed", validWallets, "testnet")
    ).toBe("testnet")
  })
})
