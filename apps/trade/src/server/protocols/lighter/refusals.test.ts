import { describe, expect, it } from "vitest"

import {
  lighterRefusalCode,
  lighterRefusalError,
  lighterRefusalSentence,
} from "@/server/protocols/lighter/refusals"

describe("Lighter refusals", () => {
  it("treats 429 and 405 as the same rate-limit hold", () => {
    // Lighter's docs name both for the same thing: 429 from its API servers
    // and 405 from the firewall in front of them.
    expect(lighterRefusalCode(429, "")).toBe("EXCHANGE_BUSY")
    expect(lighterRefusalCode(405, "")).toBe("EXCHANGE_BUSY")
    expect(lighterRefusalSentence("EXCHANGE_BUSY")).toContain("slow down")
  })

  it("names a missing market or record", () => {
    expect(lighterRefusalCode(404, "")).toBe("LIGHTER_NOT_FOUND")
    expect(lighterRefusalCode(200, "21500")).toBe("LIGHTER_NOT_FOUND")
  })

  it("names the country block, which reads nothing like a bad key", () => {
    // Measured 26 Aug 2026 from Canada: every read answered 200 while
    // `sendTx` answered 20558. Without its own words this arrives looking
    // like a rejected key, and somebody spends an afternoon making new ones.
    expect(lighterRefusalCode(400, "20558")).toBe("LIGHTER_REGION_BLOCKED")
    const said = lighterRefusalSentence("LIGHTER_REGION_BLOCKED")
    expect(said).toContain("country")
    // It must say what would actually fix it, which is not a new key.
    expect(said).toContain("server")
  })

  it("names a refused sequence number so the count gets thrown away", () => {
    expect(lighterRefusalCode(400, "21120")).toBe("LIGHTER_NONCE")
    expect(lighterRefusalSentence("LIGHTER_NONCE")).toContain("sequence")
  })

  it("answers null for a code it does not know", () => {
    expect(lighterRefusalCode(400, "21952")).toBeNull()
  })

  it("carries the named sentence after the code, for the screen to read", () => {
    const error = lighterRefusalError({ status: 429, code: "" })
    expect(error.message.startsWith("EXCHANGE_BUSY:")).toBe(true)
    expect(error.message).toContain(lighterRefusalSentence("EXCHANGE_BUSY"))
  })

  it("keeps an unknown numeric code and never Lighter's own words", () => {
    // The guarantee: a refusal Trade does not recognise still says something
    // useful, but nothing Lighter wrote reaches a screen or a log.
    const error = lighterRefusalError({ status: 400, code: "21952" })
    expect(error.message).toContain("21952")
    expect(error.message).toContain("LIGHTER_REFUSED:")
  })

  it("refuses to repeat a code that is not a plain number", () => {
    // Lighter's free-form text must never ride out through the code field.
    const error = lighterRefusalError({
      status: 400,
      code: "<script>alert(1)</script>",
    })
    expect(error.message).toContain("code unknown")
    expect(error.message).not.toContain("script")

    const long = lighterRefusalError({ status: 400, code: "12345678901" })
    expect(long.message).toContain("code unknown")
  })
})
