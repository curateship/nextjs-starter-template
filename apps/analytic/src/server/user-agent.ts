// Server-side user-agent classification for audience breakdowns. Deliberately
// tiny: we only need device class and browser family, so a few substring
// checks beat a parser dependency. Match order matters — Edge/Opera/Samsung
// user agents all contain "Chrome", and Chrome user agents contain "Safari".

export type DeviceClass = "phone" | "tablet" | "computer"

// Real user agents stay under ~400 chars; the cap keeps the regexes (one has
// a `.*` lookahead) from scanning an attacker-sized header on the public
// ingest endpoint.
const MAX_UA_LENGTH = 512

export function parseUserAgent(userAgent: string | null | undefined): {
  device: DeviceClass
  browser: string
} {
  const ua = (userAgent ?? "").slice(0, MAX_UA_LENGTH)

  // Tablets first: iPad UAs also say "Mobile", and Android tablets are the
  // Android UAs that do NOT say "Mobile".
  const device: DeviceClass = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua)
    ? "tablet"
    : /Mobi|iPhone|iPod/i.test(ua)
      ? "phone"
      : "computer"

  const browser = /Edg(?:e|A|iOS)?\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /SamsungBrowser/i.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/i.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/i.test(ua)
            ? "Chrome"
            : /Safari\//i.test(ua)
              ? "Safari"
              : "Other"

  return { device, browser }
}

// Cloudflare stamps every proxied request with the visitor's country code.
// "XX" (unknown) and "T1" (Tor) are not real countries; T1 already fails the
// two-letter check.
export function readCountryCode(headers: Headers): string | null {
  const value = headers.get("cf-ipcountry")?.trim().toUpperCase()
  if (!value || !/^[A-Z]{2}$/.test(value) || value === "XX") return null
  return value
}
