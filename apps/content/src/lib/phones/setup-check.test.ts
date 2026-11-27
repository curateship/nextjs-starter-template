import { describe, expect, it } from "vitest"

import { addressVerdict, buildSetupCheck, localeCountry, readSetupFacts, type SetupFacts } from "./setup-check"

/** A SIM phone in Canada with everything set up as it should be. */
function facts(patch: Partial<SetupFacts> = {}): SetupFacts {
  return {
    wifiOn: false,
    locationApps: { reddit: false },
    timezone: "America/Toronto",
    timezoneCountry: "CA",
    locale: "en-CA",
    sim: { country: "CA", carrier: "Rogers" },
    network: { carrier: "Rogers" },
    autoUpdate: "off",
    autoUpdateError: "",
    battery: { percent: 78, charging: true },
    outside: { ip: "198.51.100.7", country: "CA", timezone: "America/Toronto", org: "AS812 Rogers Communications", error: "" },
    home: { ip: "203.0.113.5", country: "CA", timezone: "America/Toronto", org: "AS577 Bell Canada", error: "" },
    ...patch,
  }
}

const sim = { kind: "android" as const, connection: "sim" as const, proxy: null, battery: { highest: 80, readings: 144 } }
const now = new Date("2026-10-14T18:00:00Z")

describe("the setup check (part 23)", () => {
  it("passes every line on a phone set up as it should be, and the country matches the SIM's", () => {
    const check = buildSetupCheck(facts(), sim, now)
    expect(check.passed).toBe(true)
    expect(check.lines.map((line) => [line.key, line.verdict])).toEqual([
      ["charging", "passes"],
      ["wifi", "passes"],
      ["address", "passes"],
      ["location", "passes"],
      ["timezone", "passes"],
      ["language", "passes"],
      ["auto_update", "passes"],
    ])
    expect(check.seen.find((line) => line.label === "Country")).toMatchObject({ verdict: "matches" })
    expect(check.figures).toMatchObject({ address: "198.51.100.7", country: "CA", simCarrier: "Rogers" })
  })

  it("fails a phone showing the house's address, whatever else passes", () => {
    const home = buildSetupCheck(facts({ outside: { ip: "203.0.113.5", country: "CA", timezone: "America/Toronto", org: "AS577 Bell", error: "" } }), sim, now)
    expect(home.passed).toBe(false)
    expect(home.lines.find((line) => line.key === "address")).toMatchObject({ verdict: "fails" })
  })

  it("fails the Wi-Fi line on a SIM phone with Wi-Fi left on, and passes it once fixed", () => {
    const on = buildSetupCheck(facts({ wifiOn: true }), sim, now)
    expect(on.passed).toBe(false)
    expect(on.lines.find((line) => line.key === "wifi")).toMatchObject({ verdict: "fails" })
    expect(on.lines.find((line) => line.key === "wifi")?.text).toContain("Turn Wi-Fi off")
    expect(buildSetupCheck(facts({ wifiOn: false }), sim, now).lines.find((line) => line.key === "wifi")).toMatchObject({
      verdict: "passes",
    })
  })

  it("fails charging that reached 100, location left on, the wrong clock and language, and automatic updates", () => {
    const check = buildSetupCheck(
      facts({
        locationApps: { reddit: true, tiktok: false },
        timezone: "Europe/London",
        timezoneCountry: "GB",
        locale: "en-GB",
        autoUpdate: "wifi",
      }),
      { ...sim, battery: { highest: 100, readings: 144 } },
      now
    )
    const byKey = Object.fromEntries(check.lines.map((line) => [line.key, line]))
    expect(byKey.charging).toMatchObject({ verdict: "fails" })
    expect(byKey.charging.text).toContain("reached 100 out of 100")
    expect(byKey.location.text).toBe(
      "Reddit may read the phone's location. Turn it off in each app's permissions, so a whole rack of phones never shows one address."
    )
    expect(byKey.timezone.text).toContain("in GB, but its SIM's country is CA")
    expect(byKey.language).toMatchObject({ verdict: "fails" })
    expect(byKey.auto_update.text).toContain("over Wi-Fi")
  })

  it("keeps the same seven lines on an iPhone and names the iPhone's settings", () => {
    const check = buildSetupCheck(
      facts({ autoUpdate: "any", autoUpdateError: "" }),
      { ...sim, kind: "iphone", battery: { highest: 100, readings: 144 } },
      now
    )
    expect(check.lines.map((line) => line.key)).toEqual(["charging", "wifi", "address", "location", "timezone", "language", "auto_update"])
    const byKey = Object.fromEntries(check.lines.map((line) => [line.key, line]))
    expect(byKey.auto_update).toMatchObject({ verdict: "fails" })
    expect(byKey.auto_update.text).toContain("Settings, App Store, App Updates")
    expect(byKey.charging.text).toContain("Settings, Battery, Charging, 80% Limit on an iPhone 15 or newer")
    expect(buildSetupCheck(facts(), { ...sim, kind: "iphone" }, now).lines.find((line) => line.key === "auto_update")?.text).toBe(
      "The App Store's App Updates switch is off, so a new version only arrives through Update on the Self-test window."
    )
    expect(buildSetupCheck(facts({ autoUpdate: "" }), { ...sim, kind: "iphone" }, now).lines.find((line) => line.key === "auto_update")?.text).toBe(
      "The App Store's setting could not be read."
    )
    const wifi = buildSetupCheck(facts(), { kind: "iphone", connection: "wifi", proxy: null, battery: sim.battery }, now)
    expect(wifi.lines.find((line) => line.key === "wifi")?.text).toContain("a VPN-style proxy app")
  })

  it("says it could not tell, rather than guessing, when a part was not read", () => {
    const check = buildSetupCheck(
      facts({ wifiOn: null, sim: { country: "", carrier: "" }, autoUpdate: "", autoUpdateError: "No Settings in the Play Store menu." }),
      { ...sim, battery: { highest: null, readings: 0 } },
      now
    )
    // Nothing failed, but Wi-Fi on a SIM phone could not be read, which is
    // one of the two lines that must be.
    expect(check.passed).toBe(false)
    // Any other unread line does not hold a phone back.
    expect(
      buildSetupCheck(
        facts({ sim: { country: "", carrier: "" }, autoUpdate: "", autoUpdateError: "No Settings in the Play Store menu." }),
        { ...sim, battery: { highest: null, readings: 0 } },
        now
      ).passed
    ).toBe(true)
    expect(check.lines.filter((line) => line.verdict === "unknown").map((line) => line.key)).toEqual([
      "charging",
      "wifi",
      "timezone",
      "language",
      "auto_update",
    ])
    expect(check.lines.find((line) => line.key === "auto_update")?.text).toBe(
      "The Play Store's setting could not be read: No Settings in the Play Store menu."
    )
  })

  it("compares a Wi-Fi phone with its proxy, and fails one with no proxy", () => {
    const proxy = { name: "US home line", ip: "198.51.100.7", country: "US" }
    const wifi = { kind: "android" as const, connection: "wifi" as const, proxy, battery: sim.battery }
    const check = buildSetupCheck(facts({ timezone: "America/New_York", timezoneCountry: "US", locale: "en-US" }), wifi, now)
    expect(check.lines.find((line) => line.key === "wifi")).toMatchObject({ verdict: "passes" })
    expect(check.seen[0]).toMatchObject({ label: "Outside address", verdict: "matches" })
    expect(check.seen.find((line) => line.label === "Country")).toMatchObject({ verdict: "differs" })

    const bare = buildSetupCheck(facts(), { ...wifi, proxy: null }, now)
    expect(bare.lines.find((line) => line.key === "wifi")).toMatchObject({ verdict: "fails" })
  })

  it("reads an older rack's answer with parts missing", () => {
    const read = readSetupFacts({ wifiOn: "yes", locationApps: { reddit: true, other: true }, sim: { country: "ca" } })
    expect(read).toMatchObject({ wifiOn: null, locationApps: { reddit: true }, sim: { country: "CA", carrier: "" }, autoUpdate: "" })
    expect(read.outside).toEqual({ ip: "", country: "", timezone: "", org: "", error: "" })
  })

  it("reads a country from a language only when it names one", () => {
    expect(localeCountry("en-CA")).toBe("CA")
    expect(localeCountry("fr_CA")).toBe("CA")
    expect(localeCountry("en")).toBe("")
    expect(localeCountry("zh-Hant-TW")).toBe("TW")
  })
})

describe("the address apps see (part 28)", () => {
  const proxy = { name: "US home line", ip: "198.51.100.7", country: "US" }

  it("is wrong when it is the house's own address, whatever the phone", () => {
    expect(addressVerdict("203.0.113.5", "203.0.113.5", { connection: "wifi", proxy })).toMatchObject({ ok: false, home: true })
    expect(addressVerdict("203.0.113.5", "203.0.113.5", { connection: "sim", proxy: null })).toMatchObject({ ok: false, home: true })
  })

  it("is right on a Wi-Fi phone only when it is the proxy's", () => {
    expect(addressVerdict("198.51.100.7", "203.0.113.5", { connection: "wifi", proxy })).toMatchObject({ ok: true })
    expect(addressVerdict("192.0.2.1", "203.0.113.5", { connection: "wifi", proxy })).toMatchObject({
      ok: false,
      words: "Apps see 192.0.2.1, not US home line's 198.51.100.7.",
    })
  })

  it("says nothing either way when there is nothing to compare", () => {
    expect(addressVerdict("", "203.0.113.5", { connection: "wifi", proxy }).ok).toBeNull()
    expect(addressVerdict("192.0.2.1", "203.0.113.5", { connection: "wifi", proxy: { ...proxy, ip: "" } }).ok).toBeNull()
    expect(addressVerdict("192.0.2.1", "", { connection: "sim", proxy: null }).ok).toBeNull()
  })

  it("is right on a SIM phone whenever it is not the house's", () => {
    expect(addressVerdict("192.0.2.1", "203.0.113.5", { connection: "sim", proxy: null })).toMatchObject({
      ok: true,
      words: "Apps see 192.0.2.1, not the house's address.",
    })
  })
})
