import { describe, expect, it } from "vitest"

import {
  readSocialHandle,
  socialAddressToCheck,
  SocialHandleError,
} from "@/lib/trade/social/creator"

/**
 * The handle reader takes whatever a person has to hand. Every shape below is
 * one somebody actually pastes: a link off the timeline, a link to one post, a
 * name read off a screen, an @name.
 */
describe("reading an X handle", () => {
  it("takes a full address", () => {
    expect(readSocialHandle("https://x.com/cryptosam")).toBe("cryptosam")
  })

  it("takes twitter.com and the www and mobile hosts", () => {
    expect(readSocialHandle("https://twitter.com/cryptosam")).toBe("cryptosam")
    expect(readSocialHandle("https://www.x.com/cryptosam")).toBe("cryptosam")
    expect(readSocialHandle("https://mobile.twitter.com/cryptosam")).toBe(
      "cryptosam"
    )
  })

  it("drops a trailing slash, a query string and a fragment", () => {
    expect(readSocialHandle("https://x.com/cryptosam/")).toBe("cryptosam")
    expect(readSocialHandle("https://x.com/cryptosam?ref=home")).toBe(
      "cryptosam"
    )
    expect(readSocialHandle("https://x.com/cryptosam#top")).toBe("cryptosam")
  })

  it("takes a link to one post and answers with whose it is", () => {
    expect(readSocialHandle("https://x.com/cryptosam/status/1234567890")).toBe(
      "cryptosam"
    )
  })

  it("takes a host with no scheme", () => {
    expect(readSocialHandle("x.com/cryptosam")).toBe("cryptosam")
  })

  it("takes a bare handle with or without the @", () => {
    expect(readSocialHandle("@cryptosam")).toBe("cryptosam")
    expect(readSocialHandle("  cryptosam  ")).toBe("cryptosam")
  })

  it("keeps the capitals the creator writes their own name with", () => {
    expect(readSocialHandle("https://x.com/CryptoSam")).toBe("CryptoSam")
  })

  it("refuses another site", () => {
    expect(() => readSocialHandle("https://instagram.com/cryptosam")).toThrow(
      SocialHandleError
    )
  })

  it("refuses X's own pages, which are not somebody's account", () => {
    expect(() => readSocialHandle("https://x.com/home")).toThrow(
      SocialHandleError
    )
    expect(() => readSocialHandle("https://x.com/i/flow/login")).toThrow(
      SocialHandleError
    )
  })

  it("refuses an empty box and a handle X could never issue", () => {
    expect(() => readSocialHandle("   ")).toThrow(SocialHandleError)
    expect(() => readSocialHandle("@this-handle-is-far-too-long")).toThrow(
      SocialHandleError
    )
    expect(() => readSocialHandle("https://x.com/")).toThrow(SocialHandleError)
  })
})

describe("what gets checked against the private-address rules", () => {
  it("hands an address over whole", () => {
    expect(socialAddressToCheck("https://x.com/cryptosam")).toBe(
      "https://x.com/cryptosam"
    )
  })

  it("gives a bare host the https it left out, so it is still checked", () => {
    expect(socialAddressToCheck("localhost:3000/sam")).toBe(
      "https://localhost:3000/sam"
    )
  })

  it("has nothing to check for a bare handle", () => {
    expect(socialAddressToCheck("@cryptosam")).toBeNull()
    expect(socialAddressToCheck("cryptosam")).toBeNull()
  })
})
