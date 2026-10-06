import type { IdentityReading, ProxyKind, ProxyTestResult } from "@/lib/social/options"

/**
 * The sentences the Proxies and Browser profiles dashboards put in front of a
 * person. Their own file so they can be tested without drawing a component.
 */

/**
 * The heading every dead-proxy notice starts with, which is how the bell tells
 * one from any other notice. Written on the server, read in the browser.
 */
export const PROXY_NOTICE_PREFIX = "The proxy "

export const PROXY_KIND_LABELS: Record<ProxyKind, string> = {
  residential: "Residential",
  mobile: "Mobile",
  datacenter: "Datacenter",
}

/** A proxy's last test in a few words: "US · 412ms", "Failed", "Untested". */
export function proxyTestWords(result: ProxyTestResult | null): string {
  if (!result) return "Untested"
  if (!result.ok) return "Failed"
  const parts = [result.country || "Works"]
  if (typeof result.latencyMs === "number") parts.push(`${result.latencyMs}ms`)
  return parts.join(" · ")
}

const DAY_MS = 24 * 60 * 60_000

/**
 * What the record of a proxy's outside address says, on its row.
 *
 * "Same address for 12 days" against "Address changed 14 times today" is how
 * a rotating proxy sold as a fixed one gets spotted.
 */
export function addressWords(
  addresses: { total: number; changesToday: number; currentSince: Date | null },
  now: Date = new Date()
): string {
  if (!addresses.total || !addresses.currentSince) return "Not seen yet"
  if (addresses.changesToday >= 2) {
    return `Address changed ${addresses.changesToday} times today`
  }
  const days = Math.floor((now.getTime() - new Date(addresses.currentSince).getTime()) / DAY_MS)
  if (days < 1) {
    return addresses.changesToday === 1 ? "Address changed once today" : "Same address since today"
  }
  return `Same address for ${days} ${days === 1 ? "day" : "days"}`
}

/** "Main and Second", "Main, Second and 3 more". */
export function namesList(names: readonly string[], limit = 3): string {
  if (names.length <= 1) return names[0] ?? ""
  if (names.length <= limit) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  }
  return `${names.slice(0, limit).join(", ")} and ${names.length - limit} more`
}

/** A network's own name, as a person writes it. */
function networkName(platform: string): string {
  return platform === "reddit" ? "Reddit" : platform.charAt(0).toUpperCase() + platform.slice(1)
}

/** "Reddit: u/name", or "Reddit: signed out". */
export function signedInWords(account: { platform: string; handle: string; blocked: boolean }): string {
  const network = networkName(account.platform)
  if (account.blocked) return `${network}: needs a person`
  if (!account.handle) return `${network}: signed out`
  return account.platform === "reddit"
    ? `${network}: u/${account.handle}`
    : `${network}: ${account.handle}`
}

/**
 * The warning shown before saving a profile onto a proxy in another country.
 *
 * A profile's cookies carry over. The same signed-in account arriving from
 * Germany an hour after it was in Texas is the kind of jump a site notices.
 * A warning, never a block.
 */
export function countryJumpWarning(lastCountry: string, nextCountry: string): string | null {
  if (!lastCountry || !nextCountry || lastCountry === nextCountry) return null
  return `This profile last went out from ${lastCountry}. The new proxy goes out from ${nextCountry}, and the sites it is signed in to see the same account jump countries. Save anyway if that is what you want.`
}

/** How a browser run ended, in words, for the history in a profile's window. */
export const RUN_ENDINGS: Record<string, string> = {
  running: "Open now",
  opening: "Opening",
  closed: "Closed by a person",
  idle: "Shut after an hour unused",
  dead: "Died",
  failed: "Failed to start",
  replaced: "Closed when the browser program restarted",
  stopped: "Stopped",
}

/** What a history line that is not a run says. */
export const EVENT_WORDS: Record<string, string> = {
  proxy_changed: "Proxy changed",
  browser_dead: "Browser found dead",
  proxy_refused: "Open refused, the proxy was dead",
}

/**
 * What deleting profiles does to the accounts inside them, as one sentence,
 * or null when nothing is inside.
 */
export function deleteSignOutWords(
  accounts: ReadonlyArray<{ platform: string; handle: string }>
): string | null {
  if (!accounts.length) return null
  const names = accounts.map((account) =>
    account.handle
      ? `${networkName(account.platform)} account ${account.platform === "reddit" ? "u/" : ""}${account.handle}`
      : `${networkName(account.platform)} account`
  )
  const one = accounts.length === 1
  return `The ${namesList(names, 5)} inside ${one ? "is" : "are"} signed out, and kept with no profile until one is picked in Settings.`
}

/**
 * A profile's identity as rows a person can read: the operating system and
 * browser it claims, its screen, graphics card and fonts, and the clock and
 * language it last had, which follow its proxy's country.
 */
export function identityRows(seen: IdentityReading): Array<{ label: string; value: string }> {
  const firefox = seen.userAgent.match(/Firefox\/(\d+)/)?.[1]
  const system = /Windows/.test(seen.userAgent)
    ? "Windows"
    : /Mac OS X/.test(seen.userAgent)
      ? "macOS"
      : /Linux/.test(seen.userAgent)
        ? "Linux"
        : seen.platform
  return [
    { label: "Operating system", value: system },
    { label: "Browser", value: firefox ? `Firefox ${firefox}` : seen.userAgent },
    { label: "Screen", value: `${seen.screen.width} × ${seen.screen.height}` },
    { label: "Graphics card", value: graphicsCardName(seen.gpuRenderer) },
    { label: "Fonts", value: `${seen.fonts.length} of the common ones` },
    { label: "Clock", value: seen.timezone || "Not set" },
    { label: "Language", value: seen.languages.join(", ") || "Not set" },
  ]
}

/**
 * "ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar"
 * reads as "NVIDIA GeForce GTX 980".
 */
export function graphicsCardName(renderer: string): string {
  // Peeled from the outside in, not matched in one go: a card's own name can
  // hold brackets, as "Intel(R) HD Graphics" does, which cut a single pattern
  // off at "Intel(R".
  if (!renderer.startsWith("ANGLE (")) return renderer.trim() || "Not reported"
  const name = renderer
    .replace(/^ANGLE \([^,]+, /, "")
    .replace(/, or similar$/, "")
    .replace(/ Direct3D[^)]*\)$/, "")
    .replace(/\)$/, "")
  return name.trim() || "Not reported"
}
