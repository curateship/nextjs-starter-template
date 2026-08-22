import { describe, expect, it, vi } from "vitest"

import { fetchAsterAccount } from "@/server/protocols/aster/account"
import { verifyAsterAgentKey } from "@/server/protocols/aster/agent"
import {
  packAsterCredential,
  parseAsterCredential,
} from "@/server/protocols/aster/client"

vi.mock("@/server/protocols/aster/account", () => ({
  fetchAsterAccount: vi.fn(async () => ({
    equity: 0,
    free: 0,
    inTrades: 0,
    openProfit: 0,
  })),
}))

const fetchAccount = vi.mocked(fetchAsterAccount)

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
    ).resolves.toEqual({ validUntil: null })
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
