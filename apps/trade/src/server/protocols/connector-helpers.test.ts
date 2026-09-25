import { describe, expect, it, vi } from "vitest"

import {
  assertBracketValues,
  assertOrderValue,
  connectorErrors,
  decimalString,
  heldAnswerStillStands,
  loadHeldPromise,
} from "@/server/protocols/connector-helpers"

describe("connector helpers", () => {
  it("prints small and large numbers without scientific notation", () => {
    expect(decimalString(1e-7)).toBe("0.0000001")
    expect(decimalString(1e21)).toBe("1000000000000000000000")
    expect(decimalString(-3, { allowNegative: true })).toBe("-3")
    expect(decimalString(1.1234567890129)).toBe("1.123456789013")
  })

  it("refuses negative prices and sizes with their own code", () => {
    expect(() => decimalString(-1)).toThrow("LIVE_PRICE")
    expect(() => decimalString(-1, { errorCode: "LIVE_SIZE" })).toThrow(
      "LIVE_SIZE"
    )
    expect(() => assertOrderValue(-1, "LIVE_SIZE")).toThrow("LIVE_SIZE")
    expect(() =>
      assertBracketValues({
        targets: [{ px: 100, sz: -1 }],
        slPx: null,
        slSz: null,
      })
    ).toThrow("LIVE_SIZE")
  })

  it("uses age first, the live feed second, and never exceeds the ceiling", () => {
    const quiet = vi.fn(() => true)
    expect(heldAnswerStillStands(9_000, 2_000, 10_000, quiet, 10_000)).toBe(
      true
    )
    expect(quiet).not.toHaveBeenCalled()
    expect(heldAnswerStillStands(5_000, 2_000, 10_000, quiet, 10_000)).toBe(
      true
    )
    expect(quiet).toHaveBeenCalledOnce()
    expect(heldAnswerStillStands(0, 2_000, 10_000, quiet, 10_000)).toBe(false)
  })

  it("shares an answer and evicts it when it rejects", async () => {
    const cache = new Map<string, { at: number; answer: Promise<string> }>()
    const load = vi.fn(async () => "one")
    const first = loadHeldPromise(cache, "key", () => false, load)
    const second = loadHeldPromise(cache, "key", () => true, load)
    expect(second).toBe(first)
    await expect(first).resolves.toBe("one")
    expect(load).toHaveBeenCalledOnce()

    const failed = loadHeldPromise(
      cache,
      "key",
      () => false,
      async () => {
        throw new Error("refused")
      }
    )
    await expect(failed).rejects.toThrow("refused")
    expect(cache.has("key")).toBe(false)
  })

  it("keeps busy and credential failures while translating venue errors", () => {
    const errors = connectorErrors({
      explain: (reason) => `Said ${reason}`,
      refusedWhen: (message) => message.startsWith("VENUE_"),
      credentialRefused: (error) => error === "bad-key",
    })
    expect(errors.exchange(new Error("EXCHANGE_BUSY")).message).toBe(
      "EXCHANGE_BUSY"
    )
    expect(errors.exchange("bad-key").message).toBe("LIVE_WALLET_KEY")
    expect(errors.refused(new Error("VENUE_LIMIT")).message).toBe(
      "LIVE_ORDER_REFUSED:Said VENUE_LIMIT"
    )
  })
})
