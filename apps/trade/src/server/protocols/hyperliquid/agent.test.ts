import { beforeEach, describe, expect, it, vi } from "vitest"

import { verifyHyperliquidAgentKey } from "@/server/protocols/hyperliquid/agent"

const extraAgents = vi.fn()
vi.mock("@/server/protocols/hyperliquid/client", () => ({
  infoClient: () => ({ extraAgents }),
}))

/** Private key 1 and the address it signs as. */
const AGENT_KEY = `0x${"0".repeat(63)}1`
const AGENT_ADDRESS = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf"
const ACCOUNT = "0x1234567890abcdef1234567890abcdef12345678"

describe("proving a trading key before it is saved", () => {
  beforeEach(() => {
    extraAgents.mockReset()
  })

  it("refuses the account's own key outright — it never even asks the exchange", async () => {
    await expect(
      // The pasted key derives to the very address it claims to trade FOR:
      // that is the main key, the one that can move money out.
      verifyHyperliquidAgentKey("mainnet", AGENT_ADDRESS, AGENT_KEY)
    ).rejects.toThrow("KEY_IS_ACCOUNT")
    expect(extraAgents).not.toHaveBeenCalled()
  })

  it("refuses a key the exchange does not list for the account", async () => {
    extraAgents.mockResolvedValue([
      { address: "0x" + "9".repeat(40), name: "other", validUntil: null },
    ])
    await expect(
      verifyHyperliquidAgentKey("mainnet", ACCOUNT, AGENT_KEY)
    ).rejects.toThrow("KEY_NOT_APPROVED")
  })

  it("refuses an approval that has already run out", async () => {
    extraAgents.mockResolvedValue([
      { address: AGENT_ADDRESS, name: "mine", validUntil: Date.now() - 1000 },
    ])
    await expect(
      verifyHyperliquidAgentKey("mainnet", ACCOUNT, AGENT_KEY)
    ).rejects.toThrow("KEY_EXPIRED")
  })

  it("refuses the SAVE — with its own code — when the exchange cannot be asked", async () => {
    extraAgents.mockRejectedValue(new Error("network down"))
    await expect(
      verifyHyperliquidAgentKey("mainnet", ACCOUNT, AGENT_KEY)
    ).rejects.toThrow("KEY_CHECK_UNAVAILABLE")
  })

  it("answers the approval's expiry for a listed key, case-insensitively", async () => {
    const validUntil = Date.now() + 90 * 86_400_000
    extraAgents.mockResolvedValue([
      { address: AGENT_ADDRESS.toUpperCase().replace("0X", "0x"), name: "mine", validUntil },
    ])
    await expect(
      verifyHyperliquidAgentKey("mainnet", ACCOUNT, AGENT_KEY)
    ).resolves.toEqual({ validUntil })
  })
})
