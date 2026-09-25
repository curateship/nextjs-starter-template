import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchAsterAccount,
  fetchAsterPositionMode,
} from "@/server/protocols/aster/account"
import { verifyAsterAgentKey } from "@/server/protocols/aster/agent"
import {
  packAsterCredential,
  parseAsterCredential,
} from "@/server/protocols/aster/client"

vi.mock("@/server/protocols/aster/account", () => ({
  ASTER_ONE_WAY_REQUIRED:
    "Change Position Mode to One-way Mode on Aster, then refresh.",
  fetchAsterAccount: vi.fn(async () => ({
    equity: 0,
    free: 0,
    inTrades: 0,
    openProfit: 0,
  })),
  fetchAsterPositionMode: vi.fn(async () => "one-way"),
}))

const fetchAccount = vi.mocked(fetchAsterAccount)
const fetchPositionMode = vi.mocked(fetchAsterPositionMode)

beforeEach(() => {
  fetchAccount.mockClear()
  fetchPositionMode.mockReset()
  fetchPositionMode.mockResolvedValue("one-way")
})

describe("Aster API wallet verification", () => {
  it("refuses a key whose address matches the entered account", async () => {
    const blob = packAsterCredential({ agentKey: `0x${"1".padStart(64, "0")}` })
    const signer = parseAsterCredential(blob).signer
    await expect(verifyAsterAgentKey("testnet", signer, blob)).rejects.toThrow(
      "ASTER_KEY_MATCHES_ACCOUNT"
    )
  })

  it("records no invented expiry when Aster accepts the read", async () => {
    const blob = packAsterCredential({ agentKey: `0x${"1".padStart(64, "0")}` })
    await expect(
      verifyAsterAgentKey(
        "testnet",
        "0x1111111111111111111111111111111111111111",
        blob
      )
    ).resolves.toEqual({ validUntil: null, positionMode: "one-way" })
    expect(fetchPositionMode).toHaveBeenCalled()
  })

  it("refuses a two-sided account with the setting that must change", async () => {
    fetchPositionMode.mockResolvedValueOnce("two-sided")
    const blob = packAsterCredential({
      agentKey: `0x${"1".padStart(64, "0")}`,
    })

    await expect(
      verifyAsterAgentKey(
        "testnet",
        "0x1111111111111111111111111111111111111111",
        blob
      )
    ).rejects.toThrow("Change Position Mode to One-way Mode")
    expect(fetchAccount).not.toHaveBeenCalled()
  })

  it("does not call an unknown refusal a bad key", async () => {
    fetchAccount.mockRejectedValueOnce(new Error("ASTER_REFUSED:maintenance"))
    const blob = packAsterCredential({
      agentKey: `0x${"1".padStart(64, "0")}`,
    })

    await expect(
      verifyAsterAgentKey(
        "testnet",
        "0x1111111111111111111111111111111111111111",
        blob
      )
    ).rejects.toThrow("KEY_CHECK_UNAVAILABLE")
  })

  it("keeps an address block distinct from a bad key", async () => {
    fetchAccount.mockRejectedValueOnce(new Error("ASTER_IP_BANNED"))
    const blob = packAsterCredential({
      agentKey: `0x${"1".padStart(64, "0")}`,
    })

    await expect(
      verifyAsterAgentKey(
        "testnet",
        "0x1111111111111111111111111111111111111111",
        blob
      )
    ).rejects.toThrow("ASTER_IP_BANNED")
  })
})
