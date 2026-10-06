import { describe, expect, it } from "vitest"

import {
  addressWords,
  graphicsCardName,
  identityRows,
  deleteSignOutWords,
  countryJumpWarning,
  namesList,
  proxyTestWords,
  signedInWords,
  loadWords,
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

describe("a profile's identity in words", () => {
  it("reads a graphics card the way a person names one", () => {
    expect(
      graphicsCardName("ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar")
    ).toBe("NVIDIA GeForce GTX 980")
    expect(graphicsCardName("Mesa Intel(R) UHD Graphics")).toBe("Mesa Intel(R) UHD Graphics")
    // A bracket inside the card's own name, read from a real launch on 6 Oct 2026.
    expect(
      graphicsCardName("ANGLE (Intel, Intel(R) HD Graphics Direct3D11 vs_5_0 ps_5_0), or similar")
    ).toBe("Intel(R) HD Graphics")
  })

  it("lists the machine, then the clock and language", () => {
    const rows = identityRows({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0",
      platform: "Win32",
      oscpu: "Windows NT 10.0; Win64; x64",
      hardwareConcurrency: 8,
      screen: { width: 1536, height: 960, colorDepth: 24 },
      devicePixelRatio: 1,
      gpuVendor: "Google Inc. (NVIDIA)",
      gpuRenderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar",
      fonts: ["Arial", "Calibri"],
      timezone: "UTC",
      languages: ["en-US", "en"],
    })
    expect(Object.fromEntries(rows.map((row) => [row.label, row.value]))).toEqual({
      "Operating system": "Windows",
      Browser: "Firefox 156",
      Screen: "1536 × 960",
      "Graphics card": "NVIDIA GeForce GTX 980",
      Fonts: "2 of the common ones",
      Clock: "UTC",
      Language: "en-US, en",
    })
  })

  it("says how full the machine is in one line", () => {
    const gigabyte = 1024 ** 3
    expect(loadWords({ open: 0, maxOpen: 3, memoryBytes: 0 })).toBe("No browsers open. Up to 3 can be open at once.")
    expect(loadWords({ open: 2, maxOpen: 3, memoryBytes: 2.14 * gigabyte })).toBe("2 of 3 browsers open, using about 2.1GB.")
    expect(loadWords({ open: 1, maxOpen: 1, memoryBytes: gigabyte })).toBe("1 of 1 browser open, which is the limit, using about 1.0GB.")
    // A limit lowered under browsers already open still reads as full.
    expect(loadWords({ open: 3, maxOpen: 2, memoryBytes: 3 * gigabyte })).toBe("3 browsers open, over the limit of 2, using about 3.0GB.")
  })
})
