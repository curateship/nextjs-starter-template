import type { SiteCheckLine } from "@/lib/social/options"

/**
 * "Check what a site sees": what the page read, against what it should have
 * read, line by line.
 *
 * Each line says what was seen. A verdict is given only when the comparison
 * is certain; otherwise the line is "noted" and the reader decides. "A second
 * address was offered: 203.0.113.9, which is not the proxy's" is a fact;
 * "your real address is leaking" would be a conclusion.
 */

export type PageReading = {
  address: string
  country: string
  webrtc: { available: boolean; addresses: string[] }
  timezone: string
  languages: string[]
}

/**
 * What the page is compared with: the proxy test taken at the same moment, or
 * this computer's own address when the profile has no proxy. `ip` is blank when
 * that reading failed, which leaves nothing to compare with.
 */
export type Reference =
  | { kind: "proxy"; name: string; ip: string; country: string; timezone: string; error?: string }
  | { kind: "own"; ip: string; country: string; timezone: string }

/** Addresses a video call offers that no outside site could reach. */
function isLocalAddress(address: string): boolean {
  const lower = address.toLowerCase()
  if (lower.endsWith(".local")) return true
  if (lower.includes(":")) {
    return lower === "::1" || lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")
  }
  const [a, b] = lower.split(".").map((part) => Number.parseInt(part, 10))
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

/** "en-US" reads as US; "en" names no country. */
function languageCountry(language: string): string {
  const parts = language.split("-")
  const region = parts.find((part, index) => index > 0 && /^[A-Za-z]{2}$/.test(part))
  return region ? region.toUpperCase() : ""
}

export function compareSiteCheck(seen: PageReading, reference: Reference): SiteCheckLine[] {
  const isProxy = reference.kind === "proxy"
  const whose = isProxy ? "the proxy's" : "this computer's"
  const known = Boolean(reference.ip)
  const lines: SiteCheckLine[] = []

  // The outside address.
  if (!known) {
    lines.push({
      label: "Outside address",
      verdict: "noted",
      text: isProxy
        ? `Sites see ${seen.address || "no address"}. The proxy did not answer its own test, so there is nothing to compare it with${reference.error ? `: ${reference.error.replace(/\.$/, "")}` : ""}.`
        : `Sites see ${seen.address || "no address"}. This computer's own address could not be read to compare it with.`,
    })
  } else if (seen.address === reference.ip) {
    lines.push({
      label: "Outside address",
      verdict: isProxy ? "matches" : "noted",
      text: isProxy
        ? `Sites see the proxy's address, ${seen.address}.`
        : `Sites see this computer's own address, ${seen.address}. The profile has no proxy.`,
    })
  } else {
    lines.push({
      label: "Outside address",
      verdict: "differs",
      text: `Sites see ${seen.address || "no address"}, not ${whose} ${reference.ip}.`,
    })
  }

  // The country that address is in.
  if (known && reference.country) {
    lines.push(
      seen.country === reference.country
        ? { label: "Country", verdict: "matches", text: `Sites place the browser in ${seen.country}, where ${whose} address is.` }
        : {
            label: "Country",
            verdict: "differs",
            text: `Sites place the browser in ${seen.country || "no country"}; ${whose} address is in ${reference.country}.`,
          }
    )
  }

  // The browser's clock.
  if (known && reference.timezone) {
    lines.push(
      seen.timezone === reference.timezone
        ? { label: "Clock", verdict: "matches", text: `The browser's clock is on ${seen.timezone}, the same as ${whose} address.` }
        : {
            label: "Clock",
            verdict: "differs",
            text: `The browser's clock is on ${seen.timezone || "no zone"}; ${whose} address is on ${reference.timezone}.`,
          }
    )
  } else {
    lines.push({ label: "Clock", verdict: "noted", text: `The browser's clock is on ${seen.timezone || "no zone"}.` })
  }

  // The browser's first language.
  const language = seen.languages[0] ?? ""
  const languageIn = languageCountry(language)
  if (!language) {
    lines.push({ label: "Language", verdict: "noted", text: "The browser offers no language." })
  } else if (!languageIn || !known || !reference.country) {
    lines.push({
      label: "Language",
      verdict: "noted",
      text: languageIn
        ? `The browser's language is ${language}, for ${languageIn}.`
        : `The browser's language is ${language}, which names no country.`,
    })
  } else {
    lines.push(
      languageIn === reference.country
        ? { label: "Language", verdict: "matches", text: `The browser's language is ${language}, for ${languageIn}, where ${whose} address is.` }
        : {
            label: "Language",
            verdict: "differs",
            text: `The browser's language is ${language}, for ${languageIn}; ${whose} address is in ${reference.country}.`,
          }
    )
  }

  // Addresses offered for a video call: the usual way a real address leaks
  // past a proxy.
  if (!seen.webrtc.available) {
    lines.push({
      label: "Video-call addresses",
      verdict: "noted",
      text: "Video calls are switched off in this browser, so no address can be offered.",
    })
  } else {
    const outside = Array.from(new Set(seen.webrtc.addresses.filter((address) => !isLocalAddress(address))))
    const others = outside.filter((address) => address !== reference.ip)
    if (!others.length) {
      lines.push({
        label: "Video-call addresses",
        verdict: known ? "matches" : "noted",
        text: outside.length
          ? `Only ${outside[0]} was offered, ${whose} address.`
          : "No outside address was offered.",
      })
    } else {
      lines.push({
        label: "Video-call addresses",
        verdict: "differs",
        text: `${others.length === 1 ? "A second address was" : "Other addresses were"} offered: ${others.join(", ")}, which ${others.length === 1 ? "is" : "are"} not ${whose}${known ? ` ${reference.ip}` : ""}.`,
      })
    }
  }

  return lines
}
