import { afterEach, describe, expect, it, vi } from "vitest"

import { asterNonce, clearAsterClocks } from "@/server/protocols/aster/clock"

afterEach(clearAsterClocks)

describe("Aster's clock", () => {
  it("stamps microseconds using the measured server difference", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(1_100)
    const nonce = await asterNonce({
      network: "mainnet",
      signer: "0xabc",
      now: 1_200,
      readTime: async () => 1_550,
    })
    expect(nonce).toBe(1_700_000)
  })

  it("never repeats a stamp in the same instant", async () => {
    const readTime = async () => 1_000
    vi.spyOn(Date, "now").mockReturnValue(1_000)
    const first = await asterNonce({
      network: "testnet",
      signer: "0xabc",
      now: 1_000,
      readTime,
    })
    const second = await asterNonce({
      network: "testnet",
      signer: "0xabc",
      now: 1_000,
      readTime,
    })
    expect(second).toBe(first + 1)
  })

  it("remeasures after a clock refusal", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000)
    const readTime = vi
      .fn()
      .mockResolvedValueOnce(1_000)
      .mockResolvedValueOnce(2_000)
    await asterNonce({
      network: "mainnet",
      signer: "0xabc",
      now: 1_000,
      readTime,
    })
    const refreshed = await asterNonce({
      network: "mainnet",
      signer: "0xabc",
      now: 1_000,
      readTime,
      refresh: true,
    })
    expect(readTime).toHaveBeenCalledTimes(2)
    expect(refreshed).toBe(2_000_000)
  })
})
