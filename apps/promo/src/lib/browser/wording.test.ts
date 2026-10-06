import { describe, expect, it } from "vitest"

import {
  addressWords,
  deleteSignOutWords,
  countryJumpWarning,
  namesList,
  proxyTestWords,
  signedInWords,
} from "./wording"

const NOW = new Date("2099-06-10T12:00:00.000Z")
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60_000)

describe("what a proxy's address record says on its row", () => {
  it("has nothing to say before a test has worked", () => {
    expect(addressWords({ total: 0, changesToday: 0, currentSince: null }, NOW)).toBe("Not seen yet")
  })

  it("counts the days one address has held", () => {
    expect(addressWords({ total: 1, changesToday: 0, currentSince: hoursAgo(24 * 12 + 3) }, NOW)).toBe(
      "Same address for 12 days"
    )
    expect(addressWords({ total: 1, changesToday: 0, currentSince: hoursAgo(30) }, NOW)).toBe(
      "Same address for 1 day"
    )
  })

  it("calls out a proxy rotating more than once a day", () => {
    expect(addressWords({ total: 15, changesToday: 14, currentSince: hoursAgo(0.1) }, NOW)).toBe(
      "Address changed 14 times today"
    )
  })

  it("tells a first sighting today from a change today", () => {
    expect(addressWords({ total: 1, changesToday: 0, currentSince: hoursAgo(2) }, NOW)).toBe(
      "Same address since today"
    )
    expect(addressWords({ total: 2, changesToday: 1, currentSince: hoursAgo(2) }, NOW)).toBe(
      "Address changed once today"
    )
  })
})

describe("a proxy's last test in a few words", () => {
  it("reads untested, failed, or the country and speed", () => {
    expect(proxyTestWords(null)).toBe("Untested")
    expect(proxyTestWords({ ok: false, error: "refused" })).toBe("Failed")
    expect(proxyTestWords({ ok: true, country: "US", latencyMs: 412 })).toBe("US · 412ms")
  })
})

describe("the warning before a profile changes country", () => {
  it("warns when the new proxy goes out from somewhere else", () => {
    expect(countryJumpWarning("US", "DE")).toContain("last went out from US")
    expect(countryJumpWarning("US", "DE")).toContain("goes out from DE")
  })

  it("stays quiet when either country is unknown, or they match", () => {
    expect(countryJumpWarning("", "DE")).toBeNull()
    expect(countryJumpWarning("US", "")).toBeNull()
    expect(countryJumpWarning("US", "US")).toBeNull()
  })
})

describe("names in a sentence", () => {
  it("joins two or three, and counts the rest", () => {
    expect(namesList(["Main"])).toBe("Main")
    expect(namesList(["Main", "Second"])).toBe("Main and Second")
    expect(namesList(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more")
  })
})

describe("who is signed in inside a profile", () => {
  it("reads as the network and the name", () => {
    expect(signedInWords({ platform: "reddit", handle: "a_persona", blocked: false })).toBe("Reddit: u/a_persona")
    expect(signedInWords({ platform: "reddit", handle: "", blocked: false })).toBe("Reddit: signed out")
    expect(signedInWords({ platform: "reddit", handle: "a_persona", blocked: true })).toBe("Reddit: needs a person")
  })
})

describe("what deleting a profile signs out", () => {
  it("names the accounts, signed in or not", () => {
    expect(deleteSignOutWords([{ platform: "reddit", handle: "a_persona" }])).toBe(
      "The Reddit account u/a_persona inside is signed out, and kept with no profile until one is picked in Settings."
    )
    expect(deleteSignOutWords([{ platform: "reddit", handle: "" }])).toBe(
      "The Reddit account inside is signed out, and kept with no profile until one is picked in Settings."
    )
    expect(deleteSignOutWords([])).toBeNull()
  })
})
