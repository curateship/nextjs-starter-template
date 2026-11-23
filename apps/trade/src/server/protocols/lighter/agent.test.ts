import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearLighterAccountFacts,
  fetchLighterAccountIndex,
  findLighterApiKeyIndex,
  lighterAccountFacts,
  verifyLighterAgentKey,
} from "@/server/protocols/lighter/agent"
import { lighterPublic } from "@/server/protocols/lighter/client"

vi.mock("@/server/protocols/lighter/client", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/server/protocols/lighter/client")>()
  return { ...real, lighterPublic: vi.fn() }
})

const publicRead = vi.mocked(lighterPublic)

/** Forty bytes, which is the only length Lighter's signer accepts. */
const KEY = `0x${"11".repeat(40)}`
const OTHER_KEY = `0x${"22".repeat(40)}`
const ADDRESS = "0x887960F1faffbEC960F22f8F95aa4f311F91ff19"

/**
 * The real answer shape, trimmed: one address can hold several accounts, and
 * the main one is the lowest index. The huge second index is a sub-account,
 * copied from a live read on 26 Aug 2026.
 */
const SUB_ACCOUNTS = {
  code: 200,
  l1_address: ADDRESS,
  sub_accounts: [
    { code: 0, account_type: 1, index: 281_474_976_710_614, status: 0 },
    { code: 0, account_type: 0, index: 5, status: 1 },
  ],
}

/** Answers the two reads in the order `lighterAccountFacts` makes them. */
function lighterAnswers(publicKeyForSlot: Record<number, string>) {
  return async (_network: unknown, path: unknown) => {
    if (path === "/api/v1/accountsByL1Address") return SUB_ACCOUNTS
    if (path === "/api/v1/apikeys") {
      return {
        code: 200,
        api_keys: Object.entries(publicKeyForSlot).map(([slot, key]) => ({
          account_index: 5,
          api_key_index: Number(slot),
          public_key: key,
        })),
      }
    }
    throw new Error(`unexpected path ${String(path)}`)
  }
}

beforeEach(() => {
  publicRead.mockReset()
  clearLighterAccountFacts()
})

afterEach(() => {
  clearLighterAccountFacts()
})

describe("finding the Lighter account behind an address", () => {
  it("takes the lowest index, which is the main account", async () => {
    publicRead.mockResolvedValue(SUB_ACCOUNTS)
    expect(await fetchLighterAccountIndex("mainnet", ADDRESS)).toBe(5)
  })

  it("says so plainly when Lighter holds no account there", async () => {
    publicRead.mockResolvedValue({ code: 200, sub_accounts: [] })
    await expect(
      fetchLighterAccountIndex("mainnet", ADDRESS)
    ).rejects.toThrow(/^KEY_NOT_APPROVED:/)
  })
})

describe("matching a key to its slot", () => {
  it("finds the slot whose public key matches", async () => {
    publicRead.mockResolvedValue({
      code: 200,
      api_keys: [
        { account_index: 5, api_key_index: 0, public_key: "aaaa" },
        { account_index: 5, api_key_index: 3, public_key: "BBBB" },
      ],
    })
    // Lighter states its keys in lower case; a comparison must not depend on
    // which case either side happens to use.
    expect(await findLighterApiKeyIndex("mainnet", 5, "bbbb")).toBe(3)
  })

  it("refuses a key Lighter has never registered", async () => {
    publicRead.mockResolvedValue({
      code: 200,
      api_keys: [{ account_index: 5, api_key_index: 0, public_key: "aaaa" }],
    })
    await expect(
      findLighterApiKeyIndex("mainnet", 5, "cccc")
    ).rejects.toThrow(/^KEY_NOT_APPROVED:/)
  })
})

describe("proving a pasted key", () => {
  it("accepts a key Lighter has registered, and finds its slot", async () => {
    // The public key is whatever Lighter's own signer derives from this
    // private key — asked for here rather than written down, because it is
    // the signer's answer that has to match.
    const { loadLighterKey } = await import(
      "@/server/protocols/lighter/signer"
    )
    const { publicKey } = await loadLighterKey({
      privateKey: KEY,
      accountIndex: 5,
      apiKeyIndex: 0,
    })
    publicRead.mockImplementation(lighterAnswers({ 2: publicKey }))

    const facts = await lighterAccountFacts("mainnet", ADDRESS, () => KEY)
    expect(facts).toEqual({ accountIndex: 5, apiKeyIndex: 2 })
    await expect(
      verifyLighterAgentKey("mainnet", ADDRESS, KEY)
    ).resolves.toEqual({ validUntil: null })
  }, 60_000)

  it("refuses a key that signs fine but belongs to nobody here", async () => {
    // This is the case a signature alone would never catch: the key is
    // perfectly valid maths, it is simply not registered to this account.
    publicRead.mockImplementation(lighterAnswers({ 0: "not-this-key" }))
    await expect(
      verifyLighterAgentKey("mainnet", ADDRESS, OTHER_KEY)
    ).rejects.toThrow(/^KEY_NOT_APPROVED:/)
  }, 60_000)

  it("refuses a key of the wrong length without ever quoting it", async () => {
    await expect(
      verifyLighterAgentKey("mainnet", ADDRESS, "0xdeadbeef")
    ).rejects.toSatisfy((error: Error) => {
      expect(error.message).toBe("LIVE_WALLET_KEY")
      expect(error.message).not.toContain("deadbeef")
      return true
    })
    // Refused before a single request was spent on it.
    expect(publicRead).not.toHaveBeenCalled()
  })

  it("asks Lighter once and then answers from what it learned", async () => {
    const { loadLighterKey } = await import(
      "@/server/protocols/lighter/signer"
    )
    const { publicKey } = await loadLighterKey({
      privateKey: KEY,
      accountIndex: 5,
      apiKeyIndex: 0,
    })
    publicRead.mockImplementation(lighterAnswers({ 2: publicKey }))

    await lighterAccountFacts("mainnet", ADDRESS, () => KEY)
    const spent = publicRead.mock.calls.length
    await lighterAccountFacts("mainnet", ADDRESS, () => KEY)
    expect(publicRead.mock.calls.length).toBe(spent)
  }, 60_000)

  it("does not answer one key's slot for a different key", async () => {
    const { loadLighterKey } = await import(
      "@/server/protocols/lighter/signer"
    )
    const { publicKey } = await loadLighterKey({
      privateKey: KEY,
      accountIndex: 5,
      apiKeyIndex: 0,
    })
    publicRead.mockImplementation(lighterAnswers({ 2: publicKey }))
    await lighterAccountFacts("mainnet", ADDRESS, () => KEY)

    // Same wallet, different key: the held answer must not be reused, or a
    // replaced key would sign under the old key's slot and be refused.
    await expect(
      lighterAccountFacts("mainnet", ADDRESS, () => OTHER_KEY)
    ).rejects.toThrow(/^KEY_NOT_APPROVED:/)
  }, 60_000)

  it("refuses when the wallet has no stored credential", async () => {
    await expect(
      lighterAccountFacts("mainnet", ADDRESS, () => null)
    ).rejects.toThrow("LIVE_WALLET_KEY")
  })
})
