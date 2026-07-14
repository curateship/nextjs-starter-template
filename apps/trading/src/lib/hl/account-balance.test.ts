import { describe, expect, it } from "vitest"

import { resolveTradingBalance } from "@/lib/hl/account-balance"

const clearinghouse = {
  marginSummary: { accountValue: "0.0" },
  withdrawable: "0.0",
}

describe("resolveTradingBalance", () => {
  it("uses USDC held in a unified account as trading equity", () => {
    expect(
      resolveTradingBalance("unifiedAccount", clearinghouse, {
        balances: [{ coin: "USDC", token: 0, total: "19.8", hold: "0.0" }],
        tokenToAvailableAfterMaintenance: [[0, "19.8"]],
      })
    ).toEqual({ equity: "19.8", withdrawable: "19.8" })
  })

  it("keeps the perpetual balance for standard accounts", () => {
    expect(
      resolveTradingBalance(
        "default",
        {
          marginSummary: { accountValue: "125.5" },
          withdrawable: "120.25",
        },
        {
          balances: [{ coin: "USDC", token: 0, total: "19.8", hold: "0.0" }],
        }
      )
    ).toEqual({ equity: "125.5", withdrawable: "120.25" })
  })

  it("uses the selected HIP-3 collateral in a unified account", () => {
    expect(
      resolveTradingBalance(
        "unifiedAccount",
        clearinghouse,
        {
          balances: [
            { coin: "USDC", token: 0, total: "10", hold: "0" },
            { coin: "USDH", token: 360, total: "42", hold: "0" },
          ],
          tokenToAvailableAfterMaintenance: [[360, "40"]],
        },
        360
      )
    ).toEqual({ equity: "42", withdrawable: "40" })
  })
})
