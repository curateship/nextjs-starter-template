import { beforeEach, describe, expect, it, vi } from "vitest"

const recoveryMocks = vi.hoisted(() => ({
  withdraw3: vi.fn(),
  loadTradingAccountState: vi.fn(),
}))

vi.mock("@nktkas/hyperliquid", () => ({
  ExchangeClient: class {
    withdraw3 = recoveryMocks.withdraw3
  },
  HttpTransport: class {},
  InfoClient: class {},
}))

vi.mock("@/lib/eth-wallet", () => ({
  createInjectedWalletSigner: vi.fn(() => ({})),
}))

vi.mock("@/lib/hl/account-balance", () => ({
  loadTradingAccountState: recoveryMocks.loadTradingAccountState,
}))

import {
  buildRecoveryWithdrawal,
  loadRecoveryBalance,
  submitRecoveryWithdrawal,
  validateRecoveryAmount,
} from "@/lib/hyperliquid-recovery"

beforeEach(() => vi.clearAllMocks())

describe("Hyperliquid recovery withdrawals", () => {
  it("accepts a positive USDC amount within the live withdrawable balance", () => {
    expect(validateRecoveryAmount("12.345678", "20")).toBeNull()
  })

  it.each(["", "0", "-1", "1.0000001", "1e2", "abc"])(
    "rejects invalid amount %s",
    (amount) => {
      expect(validateRecoveryAmount(amount, "20")).toBeTruthy()
    }
  )

  it("rejects an amount above the live withdrawable balance without float rounding", () => {
    expect(validateRecoveryAmount("10.000001", "10")).toBe(
      "Amount exceeds the available USDC balance."
    )
  })

  it("locks the destination to the connected master wallet", () => {
    expect(
      buildRecoveryWithdrawal(
        "0xA000000000000000000000000000000000000001",
        "4.25",
        "10"
      )
    ).toEqual({
      destination: "0xa000000000000000000000000000000000000001",
      amount: "4.25",
    })
  })

  it.each([
    { equity: "not-a-number", withdrawable: "10" },
    { equity: "10", withdrawable: "not-a-number" },
    { equity: "10", withdrawable: "-1" },
    { equity: "10", withdrawable: "1e9" },
    { equity: "10", withdrawable: "1".repeat(129) },
  ])("rejects an invalid Hyperliquid balance response", async (balance) => {
    recoveryMocks.loadTradingAccountState.mockResolvedValue(balance)

    await expect(
      loadRecoveryBalance(
        "testnet",
        "0xA000000000000000000000000000000000000001"
      )
    ).rejects.toThrow("Hyperliquid returned an invalid balance.")
  })

  it("keeps an accepted withdrawal successful when its balance refresh fails", async () => {
    recoveryMocks.loadTradingAccountState
      .mockResolvedValueOnce({ equity: "10", withdrawable: "10" })
      .mockRejectedValueOnce(new Error("Refresh failed"))
    recoveryMocks.withdraw3.mockResolvedValue({
      status: "ok",
      response: { type: "default" },
    })

    await expect(
      submitRecoveryWithdrawal({
        network: "testnet",
        address: "0xA000000000000000000000000000000000000001",
        amount: "4.25",
      })
    ).resolves.toEqual({ balance: null })
  })
})
