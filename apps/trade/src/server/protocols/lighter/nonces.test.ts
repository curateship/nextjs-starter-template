import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { lighterPublic } from "@/server/protocols/lighter/client"
import {
  clearLighterNonces,
  forgetLighterNonce,
  nextLighterNonce,
} from "@/server/protocols/lighter/nonces"

vi.mock("@/server/protocols/lighter/client", () => ({
  lighterPublic: vi.fn(),
}))

const publicRead = vi.mocked(lighterPublic)

beforeEach(() => {
  publicRead.mockReset()
  clearLighterNonces()
})

afterEach(() => {
  clearLighterNonces()
})

describe("Lighter's transaction numbers", () => {
  it("asks Lighter once, then counts on by itself", async () => {
    publicRead.mockResolvedValue({ code: 200, nonce: 12 })

    expect(await nextLighterNonce("mainnet", 5, 2)).toBe(12)
    expect(await nextLighterNonce("mainnet", 5, 2)).toBe(13)
    expect(await nextLighterNonce("mainnet", 5, 2)).toBe(14)
    expect(publicRead).toHaveBeenCalledTimes(1)
    expect(publicRead.mock.calls[0]?.[1]).toBe("/api/v1/nextNonce")
    expect(publicRead.mock.calls[0]?.[3]).toMatchObject({
      account_index: 5,
      api_key_index: 2,
    })
  })

  it("never hands the same number to two orders at once", async () => {
    // Both callers arrive before the first read comes back. Handing them the
    // same number would have Lighter refuse the second, which is how a wallet
    // stops trading until somebody notices.
    publicRead.mockImplementation(
      async () =>
        await new Promise((resolve) =>
          setTimeout(() => resolve({ code: 200, nonce: 100 }), 10)
        )
    )
    const [first, second, third] = await Promise.all([
      nextLighterNonce("mainnet", 5, 2),
      nextLighterNonce("mainnet", 5, 2),
      nextLighterNonce("mainnet", 5, 2),
    ])
    expect(new Set([first, second, third]).size).toBe(3)
    expect(Math.min(first, second, third)).toBe(100)
    expect(publicRead).toHaveBeenCalledTimes(1)
  })

  it("asks again after a refusal instead of guessing", async () => {
    // A refused transaction may or may not have spent its number, and from
    // out here the two look the same. One wasted request beats a wallet stuck
    // on a sequence Lighter disagrees with.
    publicRead.mockResolvedValueOnce({ code: 200, nonce: 12 })
    expect(await nextLighterNonce("mainnet", 5, 2)).toBe(12)

    forgetLighterNonce("mainnet", 5, 2)
    publicRead.mockResolvedValueOnce({ code: 200, nonce: 13 })
    expect(await nextLighterNonce("mainnet", 5, 2)).toBe(13)
    expect(publicRead).toHaveBeenCalledTimes(2)
  })

  it("counts each key and network on its own", async () => {
    publicRead.mockResolvedValueOnce({ code: 200, nonce: 5 })
    publicRead.mockResolvedValueOnce({ code: 200, nonce: 900 })
    expect(await nextLighterNonce("mainnet", 5, 2)).toBe(5)
    // A second key on the same account has its own sequence entirely.
    expect(await nextLighterNonce("mainnet", 5, 3)).toBe(900)
    expect(await nextLighterNonce("mainnet", 5, 2)).toBe(6)
  })

  it("refuses an answer it cannot read rather than sending a zero", async () => {
    publicRead.mockResolvedValue({ code: 200 })
    await expect(nextLighterNonce("mainnet", 5, 2)).rejects.toThrow(
      "LIGHTER_NONCE_UNREADABLE"
    )
  })
})
