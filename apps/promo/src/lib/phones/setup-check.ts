import { APP_WORDS, TRACKED_APPS, storeWords, type PhoneConnection, type PhoneKind, type TrackedApp } from "./options"

/**
 * A phone's setup check and what the platform sees (part 23 of the phone
 * farm), and the Wi-Fi phone's address guard (part 28).
 *
 * The rack reads the facts off the phone (`phone/setup-check` in
 * `rack/promo_rack.py`); this turns them into lines, each passing or failing
 * with why, in the same spirit as the browser's "Check what a site sees"
 * (`src/lib/browser/site-check.ts`): a verdict only when the comparison is
 * certain, otherwise the line says what was seen.
 *
 * Pure, so the dashboard, the server and the tests all read the same lines.
 *
 * The seven lines and their keys are the same on an iPhone (part 53); only
 * the words naming a setting follow the kind. The rack fills the same facts
 * from iOS: the App Store's App Updates switch stands in for the Play
 * Store's auto-update setting.
 */

/** One outside address as read by the phone or the rack computer. */
export type OutsideReading = { ip: string; country: string; timezone: string; org: string; error: string }

/** What the rack read off the phone. The shape of `phone/setup-check`'s answer. */
export type SetupFacts = {
  /** Null when it could not be read. */
  wifiOn: boolean | null
  /** Each installed tracked app: true when it may read the location. */
  locationApps: Partial<Record<TrackedApp, boolean>>
  timezone: string
  /** The country the phone's time zone is in, or empty when unknown. */
  timezoneCountry: string
  locale: string
  sim: { country: string; carrier: string }
  network: { carrier: string }
  /**
   * The Play Store's auto-update setting: off, Wi-Fi only, any network, or
   * empty when unread. On an iPhone, the App Store's App Updates switch:
   * off, or "any" when on.
   */
  autoUpdate: "off" | "wifi" | "any" | ""
  autoUpdateError: string
  battery: { percent: number | null; charging: boolean }
  /** What the phone shows the internet. */
  outside: OutsideReading
  /** What the rack computer shows the internet: the house's own address. */
  home: OutsideReading
}

export type SetupVerdict = "passes" | "fails" | "unknown"

export type SetupLineKey = "charging" | "wifi" | "address" | "location" | "timezone" | "language" | "auto_update"

export type SetupLine = { key: SetupLineKey; label: string; verdict: SetupVerdict; text: string }

export type SeenVerdict = "matches" | "differs" | "noted"

export type SeenLine = { label: string; verdict: SeenVerdict; text: string }

/** The stored check: every line, and the reading of what the platform sees. */
export type SetupCheck = {
  checkedAt: string
  /**
   * True when no line fails and the two lines that matter most were read:
   * Wi-Fi on a SIM phone, and the address apps see. Any other line that
   * could not be read does not stop a phone, since the rack may not find a
   * setting on one maker's screens and a wiped phone would then never take an
   * account again. The tab shows it.
   */
  passed: boolean
  lines: SetupLine[]
  seen: SeenLine[]
  /** The plain figures behind the reading, for the dashboard's summary and the rack mix. */
  figures: {
    address: string
    country: string
    simCarrier: string
    addressOwner: string
    timezone: string
    language: string
  }
}

/** The battery a phone held to about 80 never goes past this in a day. */
const CHARGE_LIMIT_PERCENT = 85

export type SetupContext = {
  /** Android or iPhone: the store, the charging setting and the words follow it. */
  kind: PhoneKind
  connection: PhoneConnection
  /** The proxy a Wi-Fi phone goes out through, with its address from a test, or null. */
  proxy: { name: string; ip: string; country: string } | null
  /** The highest battery reading in the last day, and how many readings there were. */
  battery: { highest: number | null; readings: number }
}

/** "en-CA" names Canada; "en" names no country. */
export function localeCountry(locale: string): string {
  const parts = locale.replace(/_/g, "-").split("-")
  const region = parts.find((part, index) => index > 0 && /^[A-Za-z]{2}$/.test(part))
  return region ? region.toUpperCase() : ""
}

/**
 * The country the phone ought to look like it is in: its SIM's on a SIM
 * phone, its proxy's on Wi-Fi with a proxy. Empty when nothing says.
 */
function expectedCountry(facts: Pick<SetupFacts, "sim">, context: Pick<SetupContext, "connection" | "proxy">): {
  country: string
  whose: string
} {
  if (context.connection === "sim") return { country: facts.sim.country.toUpperCase(), whose: "its SIM's" }
  if (context.proxy) return { country: context.proxy.country.toUpperCase(), whose: "its proxy's" }
  return { country: "", whose: "" }
}

/** Where the charging limit is, by kind: each maker names the setting differently. */
function chargingLimitWords(kind: PhoneKind): string {
  if (kind === "iphone") {
    return "Turn on its charging limit (Settings, Battery, Charging, 80% Limit on an iPhone 15 or newer; Optimized Battery Charging on an older one)."
  }
  return "Turn on its charging limit (on a Pixel: Battery, Charging optimization, Limit to 80%; on a Samsung: Battery, Protect battery)."
}

function setupLines(facts: SetupFacts, context: SetupContext): SetupLine[] {
  const lines: SetupLine[] = []
  const kind = context.kind
  const store = storeWords(kind)
  const Store = store.replace(/^the/, "The")

  // Charging stops at about 80. Read from the battery readings rather than
  // a setting, because each maker names the setting differently and the
  // readings say what actually happens.
  const { highest, readings } = context.battery
  lines.push(
    !readings || highest === null
      ? {
          key: "charging",
          label: "Charging stops near 80",
          verdict: "unknown",
          text: "No battery readings from the last day yet. The rack reads the battery once a minute while it is plugged in.",
        }
      : highest <= CHARGE_LIMIT_PERCENT
        ? {
            key: "charging",
            label: "Charging stops near 80",
            verdict: "passes",
            text: `The battery stayed at ${highest} out of 100 or less over the last day, so charging stops near 80.`,
          }
        : {
            key: "charging",
            label: "Charging stops near 80",
            verdict: "fails",
            text: `The battery reached ${highest} out of 100 in the last day. A phone that sits at 100 all day does not look like anyone's. ${chargingLimitWords(kind)}`,
          }
  )

  // Wi-Fi. A SIM phone with Wi-Fi on goes out over the house's address.
  if (context.connection === "sim") {
    lines.push(
      facts.wifiOn === null
        ? { key: "wifi", label: "Wi-Fi off", verdict: "unknown", text: "Whether Wi-Fi is on could not be read." }
        : facts.wifiOn
          ? {
              key: "wifi",
              label: "Wi-Fi off",
              verdict: "fails",
              text: "Wi-Fi is on. A SIM phone should go out over its SIM only; on the house Wi-Fi, apps see the house's address. Turn Wi-Fi off on the phone.",
            }
          : { key: "wifi", label: "Wi-Fi off", verdict: "passes", text: "Wi-Fi is off, so it goes out over its SIM." }
    )
  } else {
    lines.push(
      context.proxy
        ? {
            key: "wifi",
            label: "Goes out through its proxy",
            verdict: "passes",
            text: `It is a Wi-Fi phone set to go out through ${context.proxy.name}, forced by a VPN-style proxy app on the phone. Before every job the rack checks the address apps see.`,
          }
        : {
            key: "wifi",
            label: "Goes out through a proxy",
            verdict: "fails",
            text: "It is on the house Wi-Fi with no proxy, so apps see the house's address. Pick a proxy in its settings and turn on a VPN-style proxy app on the phone.",
          }
    )
  }

  // The address apps see. The house's own address is never right.
  const address = addressVerdict(facts.outside.ip, facts.home.ip, context)
  lines.push({
    key: "address",
    label: "Never the house's address",
    verdict: address.ok === null ? "unknown" : address.ok ? "passes" : "fails",
    text: address.words,
  })

  // Location permission for the apps Promo uses.
  const installed = TRACKED_APPS.filter((app) => app in facts.locationApps)
  const allowed = installed.filter((app) => facts.locationApps[app])
  lines.push(
    !installed.length
      ? {
          key: "location",
          label: "Location off for the apps",
          verdict: "passes",
          text: "None of Reddit, Instagram or TikTok is on it yet.",
        }
      : allowed.length
        ? {
            key: "location",
            label: "Location off for the apps",
            verdict: "fails",
            text: `${listWords(allowed.map((app) => APP_WORDS[app]))} may read the phone's location. Turn it off in each app's permissions, so a whole rack of phones never shows one address.`,
          }
        : {
            key: "location",
            label: "Location off for the apps",
            verdict: "passes",
            text: `${listWords(installed.map((app) => APP_WORDS[app]))} cannot read the location.`,
          }
  )

  // The clock and the language against the country it should look like.
  const expected = expectedCountry(facts, context)
  const zoneCountry = facts.timezoneCountry.toUpperCase()
  lines.push(
    !expected.country
      ? {
          key: "timezone",
          label: "Clock matches the country",
          verdict: "unknown",
          text: `The clock is on ${facts.timezone || "no zone"}. ${context.connection === "sim" ? "The SIM's country could not be read" : "There is no proxy country to compare it with"}.`,
        }
      : !zoneCountry
        ? {
            key: "timezone",
            label: "Clock matches the country",
            verdict: "unknown",
            text: `The clock is on ${facts.timezone || "no zone"}, which the rack could not place in a country.`,
          }
        : zoneCountry === expected.country
          ? {
              key: "timezone",
              label: "Clock matches the country",
              verdict: "passes",
              text: `The clock is on ${facts.timezone}, in ${zoneCountry}, ${expected.whose} country.`,
            }
          : {
              key: "timezone",
              label: "Clock matches the country",
              verdict: "fails",
              text: `The clock is on ${facts.timezone}, in ${zoneCountry}, but ${expected.whose} country is ${expected.country}. Set the time zone on the phone.`,
            }
  )

  const languageCountry = localeCountry(facts.locale)
  lines.push(
    !facts.locale
      ? { key: "language", label: "Language matches the country", verdict: "unknown", text: "The phone's language could not be read." }
      : !expected.country || !languageCountry
        ? {
            key: "language",
            label: "Language matches the country",
            verdict: "unknown",
            text: `The phone's language is ${facts.locale}${languageCountry ? "" : ", which names no country"}${expected.country ? "" : ", and there is no country to compare it with"}.`,
          }
        : languageCountry === expected.country
          ? {
              key: "language",
              label: "Language matches the country",
              verdict: "passes",
              text: `The phone's language is ${facts.locale}, for ${expected.country}.`,
            }
          : {
              key: "language",
              label: "Language matches the country",
              verdict: "fails",
              text: `The phone's language is ${facts.locale}, for ${languageCountry}, but ${expected.whose} country is ${expected.country}. Change the language's region on the phone.`,
            }
  )

  // Automatic updates, which would bring a new app version without the
  // one-phone-first rollout (part 21).
  lines.push(
    facts.autoUpdate === "off"
      ? {
          key: "auto_update",
          label: "Automatic app updates off",
          verdict: "passes",
          text:
            kind === "iphone"
              ? "The App Store's App Updates switch is off, so a new version only arrives through Update on the Self-test window."
              : "The Play Store is set to Don't auto-update apps, so a new version only arrives through Update on the Self-test window.",
        }
      : facts.autoUpdate
        ? {
            key: "auto_update",
            label: "Automatic app updates off",
            verdict: "fails",
            text:
              kind === "iphone"
                ? "The App Store updates apps by itself, so a new version can break the rack overnight. Turn it off in Settings, App Store, App Updates."
                : `The Play Store updates apps by itself ${facts.autoUpdate === "wifi" ? "over Wi-Fi" : "over any network"}, so a new version can break the rack overnight. In the Play Store: your picture, Settings, Network preferences, Auto-update apps, Don't auto-update apps.`,
          }
        : {
            key: "auto_update",
            label: "Automatic app updates off",
            verdict: "unknown",
            text: `${Store}'s setting could not be read${facts.autoUpdateError ? `: ${facts.autoUpdateError.replace(/\.$/, "")}` : ""}.`,
          }
  )
  return lines
}

/** The reading of what the platform sees: the outside address and what goes with it. */
function seenLines(facts: SetupFacts, context: Pick<SetupContext, "connection" | "proxy">): SeenLine[] {
  const lines: SeenLine[] = []
  const outside = facts.outside
  const address = addressVerdict(outside.ip, facts.home.ip, context)
  lines.push({
    label: "Outside address",
    verdict: address.ok === null ? "noted" : address.ok ? "matches" : "differs",
    text: address.words,
  })

  const expected = expectedCountry(facts, context)
  if (outside.ip) {
    lines.push(
      !expected.country || !outside.country
        ? {
            label: "Country",
            verdict: "noted",
            text: `Apps place the phone in ${outside.country || "no country"}.`,
          }
        : outside.country.toUpperCase() === expected.country
          ? {
              label: "Country",
              verdict: "matches",
              text: `Apps place the phone in ${expected.country}, ${expected.whose} country.`,
            }
          : {
              label: "Country",
              verdict: "differs",
              text: `Apps place the phone in ${outside.country.toUpperCase()}, but ${expected.whose} country is ${expected.country}.`,
            }
    )
  }

  const carrier = facts.sim.carrier || facts.network.carrier
  lines.push({
    label: "Carrier",
    verdict: "noted",
    text: [
      context.connection === "sim" ? (carrier ? `The SIM is ${carrier}.` : "The SIM's carrier could not be read.") : "It has no SIM in use.",
      outside.org ? `The address belongs to ${outside.org}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  })

  if (outside.timezone && facts.timezone) {
    lines.push(
      outside.timezone === facts.timezone
        ? { label: "Clock", verdict: "matches", text: `The phone's clock is on ${facts.timezone}, where its address is.` }
        : facts.timezoneCountry && outside.country && facts.timezoneCountry.toUpperCase() === outside.country.toUpperCase()
          ? {
              label: "Clock",
              verdict: "noted",
              text: `The phone's clock is on ${facts.timezone}; its address is on ${outside.timezone}, in the same country.`,
            }
          : {
              label: "Clock",
              verdict: "differs",
              text: `The phone's clock is on ${facts.timezone}; its address is on ${outside.timezone}.`,
            }
    )
  } else {
    lines.push({ label: "Clock", verdict: "noted", text: `The phone's clock is on ${facts.timezone || "no zone"}.` })
  }
  lines.push({ label: "Language", verdict: "noted", text: facts.locale ? `The phone's language is ${facts.locale}.` : "The phone's language could not be read." })
  return lines
}

/**
 * Whether the address apps see is the right one. `ok` is null when there is
 * nothing to compare it with. The house's address is always wrong: the
 * whole point of a SIM or a proxy is that it never shows.
 */
export function addressVerdict(
  phoneIp: string,
  homeIp: string,
  context: Pick<SetupContext, "connection" | "proxy">
): { ok: boolean | null; home: boolean; words: string } {
  if (!phoneIp) return { ok: null, home: false, words: "The phone's outside address could not be read." }
  if (homeIp && phoneIp === homeIp) {
    return {
      ok: false,
      home: true,
      words:
        context.connection === "sim"
          ? `Apps see ${phoneIp}, the house's own address. It is going out over the house Wi-Fi, not its SIM.`
          : `Apps see ${phoneIp}, the house's own address, not ${context.proxy ? `the proxy's` : "a proxy's"}. The proxy app on the phone is off or not routing everything.`,
    }
  }
  if (context.connection === "wifi" && context.proxy) {
    if (!context.proxy.ip) {
      return { ok: null, home: false, words: `Apps see ${phoneIp}. The proxy did not answer its own test, so there is nothing to compare it with.` }
    }
    return phoneIp === context.proxy.ip
      ? { ok: true, home: false, words: `Apps see ${phoneIp}, the address of ${context.proxy.name}.` }
      : { ok: false, home: false, words: `Apps see ${phoneIp}, not ${context.proxy.name}'s ${context.proxy.ip}.` }
  }
  if (context.connection === "wifi") {
    return { ok: false, home: false, words: `Apps see ${phoneIp}. It is on the house Wi-Fi with no proxy picked.` }
  }
  // A SIM phone is right as long as it is not the house: its address is its carrier's.
  return homeIp
    ? { ok: true, home: false, words: `Apps see ${phoneIp}, not the house's address.` }
    : { ok: null, home: false, words: `Apps see ${phoneIp}. The house's own address could not be read to compare it with.` }
}

/** Builds the stored check from the rack's facts. */
export function buildSetupCheck(facts: SetupFacts, context: SetupContext, now: Date): SetupCheck {
  const lines = setupLines(facts, context)
  return {
    checkedAt: now.toISOString(),
    passed:
      lines.every((line) => line.verdict !== "fails") &&
      !lines.some((line) => (line.key === "address" || (line.key === "wifi" && context.connection === "sim")) && line.verdict === "unknown"),
    lines,
    seen: seenLines(facts, context),
    figures: {
      address: facts.outside.ip,
      country: facts.outside.country.toUpperCase(),
      simCarrier: facts.sim.carrier || facts.network.carrier,
      addressOwner: facts.outside.org,
      timezone: facts.timezone,
      language: facts.locale,
    },
  }
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/** Reads the rack's answer, filling anything missing, so an older rack's answer is still read. */
export function readSetupFacts(raw: Record<string, unknown> | null | undefined): SetupFacts {
  const value = (raw ?? {}) as Record<string, unknown>
  const text = (input: unknown, length = 200) => (typeof input === "string" ? input.trim().slice(0, length) : "")
  const object = (input: unknown) => (input && typeof input === "object" ? (input as Record<string, unknown>) : {})
  const outside = (input: unknown): OutsideReading => {
    const read = object(input)
    return {
      ip: text(read.ip, 64),
      country: text(read.country, 2).toUpperCase(),
      timezone: text(read.timezone, 64),
      org: text(read.org, 160),
      error: text(read.error, 300),
    }
  }
  const locationApps: Partial<Record<TrackedApp, boolean>> = {}
  const apps = object(value.locationApps)
  for (const app of TRACKED_APPS) {
    if (typeof apps[app] === "boolean") locationApps[app] = apps[app] as boolean
  }
  const update = text(value.autoUpdate, 10)
  const battery = object(value.battery)
  const sim = object(value.sim)
  return {
    wifiOn: typeof value.wifiOn === "boolean" ? value.wifiOn : null,
    locationApps,
    timezone: text(value.timezone, 64),
    timezoneCountry: text(value.timezoneCountry, 2).toUpperCase(),
    locale: text(value.locale, 40),
    sim: { country: text(sim.country, 2).toUpperCase(), carrier: text(sim.carrier, 120) },
    network: { carrier: text(object(value.network).carrier, 120) },
    autoUpdate: update === "off" || update === "wifi" || update === "any" ? update : "",
    autoUpdateError: text(value.autoUpdateError, 300),
    battery: {
      percent: typeof battery.percent === "number" ? battery.percent : null,
      charging: battery.charging === true,
    },
    outside: outside(value.outside),
    home: outside(value.home),
  }
}
