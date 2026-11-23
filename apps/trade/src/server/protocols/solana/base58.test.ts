import { describe, expect, it } from "vitest"

import { decodeBase58, encodeBase58 } from "@/server/protocols/solana/base58"

describe("base58", () => {
  it("round-trips bytes, leading zeros included", () => {
    const bytes = new Uint8Array([0, 0, 1, 2, 3, 255, 128, 64, 0])
    const text = encodeBase58(bytes)
    // Two leading zero bytes are two leading "1"s, which arithmetic alone
    // would drop.
    expect(text.startsWith("11")).toBe(true)
    expect(text.startsWith("111")).toBe(false)
    expect(decodeBase58(text)).toEqual(bytes)
  })

  it("spells a known address the way Solana does", () => {
    // The system program's address is thirty-two zero bytes.
    const zeros = new Uint8Array(32)
    expect(encodeBase58(zeros)).toBe("11111111111111111111111111111111")
    expect(decodeBase58("11111111111111111111111111111111")).toEqual(zeros)
  })

  it("refuses a character outside the alphabet", () => {
    // 0, O, I and l are left out of base58 on purpose.
    expect(decodeBase58("0abc")).toBeNull()
    expect(decodeBase58("abcO")).toBeNull()
    expect(decodeBase58("abcI")).toBeNull()
    expect(decodeBase58("abcl")).toBeNull()
    expect(decodeBase58("abc def")).toBeNull()
  })

  it("answers nothing for nothing", () => {
    expect(decodeBase58("")).toEqual(new Uint8Array(0))
    expect(encodeBase58(new Uint8Array(0))).toBe("")
  })
})
