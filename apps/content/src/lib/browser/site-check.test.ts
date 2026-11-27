import { describe, expect, it } from "vitest"

import { compareSiteCheck, type PageReading, type Reference } from "./site-check"

const proxy: Reference = {
  kind: "proxy",
  name: "US-residential-3",
  ip: "198.51.100.7",
  country: "US",
  timezone: "America/New_York",
}

const throughProxy: PageReading = {
  address: "198.51.100.7",
  country: "US",
  webrtc: { available: true, addresses: ["192.168.1.20", "abc123.local", "198.51.100.7"] },
  timezone: "America/New_York",
  languages: ["en-US", "en"],
}

const verdicts = (lines: ReturnType<typeof compareSiteCheck>) =>
  Object.fromEntries(lines.map((line) => [line.label, line.verdict]))

describe("what a site sees, against the proxy", () => {
  it("matches on every line behind a working proxy", () => {
    expect(verdicts(compareSiteCheck(throughProxy, proxy))).toEqual({
      "Outside address": "matches",
      Country: "matches",
      Clock: "matches",
      Language: "matches",
      "Video-call addresses": "matches",
    })
  })

  it("names the address seen when it is not the proxy's", () => {
    const [line] = compareSiteCheck({ ...throughProxy, address: "203.0.113.9" }, proxy)
    expect(line).toEqual({
      label: "Outside address",
      verdict: "differs",
      text: "Sites see 203.0.113.9, not the proxy's 198.51.100.7.",
    })
  })

  it("shows a clock forced into another zone as not matching", () => {
    const lines = compareSiteCheck({ ...throughProxy, timezone: "Europe/Moscow" }, proxy)
    expect(lines.find((line) => line.label === "Clock")).toEqual({
      label: "Clock",
      verdict: "differs",
      text: "The browser's clock is on Europe/Moscow; the proxy's address is on America/New_York.",
    })
  })

  it("says a second video-call address was offered, as a fact", () => {
    const lines = compareSiteCheck(
      { ...throughProxy, webrtc: { available: true, addresses: ["198.51.100.7", "203.0.113.9"] } },
      proxy
    )
    expect(lines.at(-1)?.text).toBe(
      "A second address was offered: 203.0.113.9, which is not the proxy's 198.51.100.7."
    )
  })

  it("does not judge a language that names no country", () => {
    const lines = compareSiteCheck({ ...throughProxy, languages: ["en"] }, proxy)
    expect(lines.find((line) => line.label === "Language")?.verdict).toBe("noted")
  })

  it("says there is nothing to compare with when the proxy test failed", () => {
    const [line] = compareSiteCheck(throughProxy, {
      ...proxy,
      ip: "",
      country: "",
      timezone: "",
      error: "The proxy did not answer in time.",
    })
    expect(line.verdict).toBe("noted")
    expect(line.text).toBe(
      "Sites see 198.51.100.7. The proxy did not answer its own test, so there is nothing to compare it with: The proxy did not answer in time."
    )
  })
})

describe("what a site sees with no proxy", () => {
  it("says the site sees this computer's own address", () => {
    const [line] = compareSiteCheck(
      { ...throughProxy, address: "203.0.113.50", country: "GB", timezone: "Europe/London", languages: ["en-GB"] },
      { kind: "own", ip: "203.0.113.50", country: "GB", timezone: "Europe/London" }
    )
    expect(line).toEqual({
      label: "Outside address",
      verdict: "noted",
      text: "Sites see this computer's own address, 203.0.113.50. The profile has no proxy.",
    })
  })
})
