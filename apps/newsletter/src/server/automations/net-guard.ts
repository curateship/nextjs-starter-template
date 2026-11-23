import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

// SSRF guard: the server fetches user-configured URLs, so refuse addresses
// only the server can reach — loopback, private LAN, link-local (cloud
// metadata), CGNAT, and unique-local IPv6.
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const ip = address.toLowerCase()
    // IPv4-mapped IPv6, dotted (::ffff:127.0.0.1) or hex (::ffff:7f00:1 —
    // the form WHATWG URLs normalize to): check the embedded IPv4 instead.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip)
    if (mapped) return isPrivateAddress(mapped[1])
    const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip)
    if (hexMapped) {
      const hi = Number.parseInt(hexMapped[1], 16)
      const lo = Number.parseInt(hexMapped[2], 16)
      return isPrivateAddress(
        `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
      )
    }
    return (
      ip === "::" ||
      ip === "::1" ||
      ip.startsWith("fe80:") ||
      ip.startsWith("fc") ||
      ip.startsWith("fd")
    )
  }
  const octets = address.split(".").map(Number)
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true // Unparseable — refuse rather than guess.
  }
  const [a, b] = octets
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

// Tests stub DNS so results don't depend on the machine's resolver
// (e.g. local dev resolvers map *.test to 127.0.0.1).
let dnsLookupOverride: ((hostname: string) => Promise<string[]>) | null = null

export function setDnsLookupForTests(
  fn: ((hostname: string) => Promise<string[]>) | null
) {
  dnsLookupOverride = fn
}

async function resolveHostname(hostname: string): Promise<string[]> {
  if (dnsLookupOverride) return dnsLookupOverride(hostname)
  return (await lookup(hostname, { all: true })).map((entry) => entry.address)
}

export async function assertPublicHttpUrl(parsed: URL) {
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "")
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("URL points to a private address")
  }
  let addresses: string[]
  if (isIP(hostname)) {
    addresses = [hostname]
  } else {
    try {
      addresses = await resolveHostname(hostname)
    } catch {
      // Unresolvable now means unresolvable for fetch too — let fetch report
      // the network error. (A DNS-rebinding race between this check and the
      // fetch's own lookup remains a known v1 limitation.)
      return
    }
  }
  if (addresses.some(isPrivateAddress)) {
    throw new Error("URL points to a private address")
  }
}
