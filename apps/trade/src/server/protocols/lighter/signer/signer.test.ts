import { describe, expect, it } from "vitest"

import {
  LIGHTER_CHAIN_ID,
  lighterAuthToken,
  loadLighterKey,
} from "@/server/protocols/lighter/signer"

/**
 * The vendored signer, run for real.
 *
 * **This is the test that matters most in the Lighter work.** Everything
 * Lighter can ever be asked to do with money runs through this binary, a
 * wrong signature looks exactly like a wrong key from the outside, and the
 * file is a compiled blob nobody here can read. So it is exercised rather
 * than trusted: if a future Node, or a replaced `.wasm`, or a mismatched
 * `wasm_exec.js` breaks it, this fails instead of a real order failing.
 *
 * No network and no real key. The keys below are made-up bytes, which is
 * enough because the signer does not care whether a key is registered — only
 * the exchange does.
 */

const KEY = `0x${"11".repeat(40)}`
const OTHER_KEY = `0x${"22".repeat(40)}`

describe("Lighter's vendored signer", () => {
  it("loads under this Node and derives a public key", async () => {
    const { publicKey } = await loadLighterKey({
      privateKey: KEY,
      accountIndex: 1,
      apiKeyIndex: 2,
    })
    // Lighter states public keys as 40 bytes of hex, the same shape its
    // `apikeys` endpoint answers with — which is what makes them comparable.
    expect(publicKey).toMatch(/^[0-9a-f]{80}$/)
  }, 60_000)

  it("gives the same key the same public key every time", async () => {
    const first = await loadLighterKey({
      privateKey: KEY,
      accountIndex: 1,
      apiKeyIndex: 2,
    })
    const again = await loadLighterKey({
      privateKey: KEY,
      accountIndex: 1,
      apiKeyIndex: 2,
    })
    expect(again.publicKey).toBe(first.publicKey)

    const other = await loadLighterKey({
      privateKey: OTHER_KEY,
      accountIndex: 1,
      apiKeyIndex: 2,
    })
    expect(other.publicKey).not.toBe(first.publicKey)
  }, 60_000)

  it("refuses a key that is not forty bytes, and says so without it", async () => {
    await expect(
      loadLighterKey({ privateKey: "0x1234", accountIndex: 1, apiKeyIndex: 2 })
    ).rejects.toSatisfy((error: Error) => {
      expect(error.message).toContain("LIGHTER_SIGNER_KEY:")
      expect(error.message).toContain("expected: 40")
      // The refusal names lengths, never the key itself.
      expect(error.message).not.toContain("1234")
      return true
    })
  }, 60_000)

  it("signs an auth token that carries its own deadline", async () => {
    await loadLighterKey({
      privateKey: KEY,
      accountIndex: 7,
      apiKeyIndex: 3,
    })
    const { token, deadline } = await lighterAuthToken({
      accountIndex: 7,
      apiKeyIndex: 3,
    })

    // Lighter wants `deadline:accountIndex:apiKeyIndex:signature`.
    const parts = token.split(":")
    expect(parts).toHaveLength(4)
    expect(parts[1]).toBe("7")
    expect(parts[2]).toBe("3")
    expect(parts[3]).toMatch(/^[0-9a-f]+$/)

    // Seconds, not milliseconds, and in the future. Lighter's build fixes
    // this at one hour, so the app renews against the stated deadline rather
    // than against any number written down.
    const secondsLeft = deadline - Math.floor(Date.now() / 1_000)
    expect(secondsLeft).toBeGreaterThan(0)
    expect(secondsLeft).toBeLessThanOrEqual(3_600)
    expect(Number(parts[0])).toBe(deadline)
  }, 60_000)

  it("refuses a token for an account whose key was never loaded", async () => {
    await expect(
      lighterAuthToken({ accountIndex: 999_111, apiKeyIndex: 0 })
    ).rejects.toThrow("LIGHTER_SIGNER_TOKEN:")
  }, 60_000)

  it("keeps each account's key apart", async () => {
    await loadLighterKey({
      privateKey: KEY,
      accountIndex: 11,
      apiKeyIndex: 0,
    })
    await loadLighterKey({
      privateKey: OTHER_KEY,
      accountIndex: 12,
      apiKeyIndex: 0,
    })
    const one = await lighterAuthToken({ accountIndex: 11, apiKeyIndex: 0 })
    const two = await lighterAuthToken({ accountIndex: 12, apiKeyIndex: 0 })
    expect(one.token).not.toBe(two.token)
  }, 60_000)

  it("signs on the chain Lighter's own examples use", () => {
    expect(LIGHTER_CHAIN_ID).toBe(304)
  })
})
