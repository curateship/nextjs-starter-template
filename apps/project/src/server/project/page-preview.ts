import { lookup as dnsLookup, type LookupAddress } from "node:dns"
import https from "node:https"
import { BlockList, isIP } from "node:net"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { httpsAddress } from "@/lib/project/note-blocks"

/**
 * The Web page card in notes (Project note blocks task, part 11; Tyler, 5 Nov
 * 2026: "Any https page"). Project's server reads the top of a public page for
 * its title, site icon and picture. This is the one place Project's server
 * visits an address someone typed, so the refusals come first:
 *
 * - Only `https://` on the usual port, with no name or password in it.
 * - Every address a name points at is checked when the connection is made
 *   (`safeLookup`), not only before, so a name can't answer "public" to the
 *   check and "private" to the connection. Private, local and cloud-metadata
 *   addresses are refused, IPv4 written as IPv6 included.
 * - Redirects are followed by hand, at most three, each checked the same way.
 * - At most 256 KB is read, only from an HTML page, within 5 seconds.
 *
 * A preview is kept in memory for 10 minutes, and never saved: the note keeps
 * only the address, so the card is read again when the note opens later.
 */

const TIMEOUT_MS = 5_000
const MAX_BYTES = 256 * 1024
const MAX_REDIRECTS = 3
const KEEP_MS = 10 * 60 * 1000
const MAX_KEPT = 500
const MAX_TEXT = 300
const MAX_ADDRESS = 2000

export type PagePreview = {
  url: string
  /** The page's own name for itself, or null when it gave none. */
  title: string | null
  /** The site's name: its own, or the address's host. */
  siteName: string
  imageUrl: string | null
  iconUrl: string | null
}

const REFUSED = new BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) {
  REFUSED.addSubnet(network, prefix, "ipv4")
}
for (const [network, prefix] of [
  // The old IPv4-compatible form, ::127.0.0.1 written as ::7f00:1, with :: and ::1 inside it.
  ["::", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  // 6to4, which carries an IPv4 address inside it.
  ["2002::", 16],
  ["fc00::", 7],
  ["fec0::", 10],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  REFUSED.addSubnet(network, prefix, "ipv6")
}

/** Whether an IP address is one Project's server must never be sent to. */
export function isRefusedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return REFUSED.check(address, "ipv4")
  if (family !== 6) return true
  const lower = address.toLowerCase()
  // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is checked as the IPv4 address it is.
  const mapped = /^::ffff:(?:0:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower)
  if (mapped) return isRefusedAddress(mapped[1])
  const mappedHex = /^::ffff:(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower)
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16)
    const low = parseInt(mappedHex[2], 16)
    return isRefusedAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
  }
  return REFUSED.check(address, "ipv6")
}

/** The page's address when it is one Project's server may visit, or null. */
export function visitableAddress(text: string): URL | null {
  const address = httpsAddress(text, MAX_ADDRESS)
  if (!address) return null
  const url = new URL(address)
  if (url.port && url.port !== "443") return null
  // "localhost." is localhost: a name's last dot is dropped before it's judged.
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "")
  if (isIP(host)) return isRefusedAddress(host) ? null : url
  // A name with no dot (intranet, localhost) is never a public page.
  if (!host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null
  return url
}

type Lookup = typeof dnsLookup

/**
 * A lookup that refuses a name pointing at any private address. Node calls it
 * as it connects, so the address checked is the address used.
 */
export function safeLookup(resolve: Lookup = dnsLookup): Lookup {
  return ((hostname: string, options: unknown, callback: unknown) => {
    const done = (typeof options === "function" ? options : callback) as (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number
    ) => void
    const wantsAll = typeof options === "object" && options !== null && (options as { all?: boolean }).all === true
    resolve(hostname, { all: true }, (error, addresses) => {
      if (error) return done(error, wantsAll ? [] : "")
      const list = addresses as LookupAddress[]
      if (!list.length || list.some((entry) => isRefusedAddress(entry.address))) {
        return done(Object.assign(new Error(PROJECT_ERRORS.pageAddressRefused), { code: "EREFUSED" }), wantsAll ? [] : "")
      }
      if (wantsAll) return done(null, list)
      done(null, list[0].address, list[0].family)
    })
  }) as Lookup
}

/** One answer from a page: its status, where it redirects, its type and up to 256 KB of it. */
export type PageAnswer = { status: number; location: string | null; contentType: string; body: string }

export type GetPage = (url: URL) => Promise<PageAnswer>

/** One request, over https only, through `safeLookup`, cut off at 256 KB and 5 seconds. */
export const getPage: GetPage = (url) =>
  new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        lookup: safeLookup(),
        timeout: TIMEOUT_MS,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en",
          "user-agent": "Mozilla/5.0 (compatible; ProjectLinkPreview/1.0)",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0
        const location = typeof response.headers.location === "string" ? response.headers.location : null
        const contentType = String(response.headers["content-type"] ?? "")
        if (status >= 300 || !contentType.includes("html")) {
          response.destroy()
          return resolve({ status, location, contentType, body: "" })
        }
        const chunks: Buffer[] = []
        let size = 0
        response.on("data", (chunk: Buffer) => {
          size += chunk.length
          chunks.push(chunk)
          // The title and pictures are near the top; the rest is never needed.
          if (size >= MAX_BYTES) response.destroy()
        })
        const finish = () => resolve({ status, location, contentType, body: Buffer.concat(chunks).subarray(0, MAX_BYTES).toString("utf8") })
        response.on("end", finish)
        response.on("close", finish)
        response.on("error", reject)
      }
    )
    // The whole request, however slowly the page trickles in, gets 5 seconds.
    const timer = setTimeout(() => request.destroy(new Error("timeout")), TIMEOUT_MS)
    request.on("close", () => clearTimeout(timer))
    request.on("timeout", () => request.destroy(new Error("timeout")))
    request.on("error", reject)
  })

/** The page at the end of at most three redirects, each one checked as the first was. */
export async function fetchPage(start: URL, get: GetPage = getPage): Promise<{ url: URL; answer: PageAnswer }> {
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const answer = await get(url)
    if (answer.status < 300 || answer.status >= 400) return { url, answer }
    if (!answer.location || hop === MAX_REDIRECTS) break
    let next: URL | null
    try {
      next = visitableAddress(new URL(answer.location, url).toString())
    } catch {
      next = null
    }
    if (!next) throw new Error(PROJECT_ERRORS.pageAddressRefused)
    url = next
  }
  throw new Error(PROJECT_ERRORS.pageAddressRefused)
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

function decode(text: string) {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] === "#") {
        const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ""
      }
      return ENTITIES[name.toLowerCase()] ?? whole
    })
    .replace(/\s+/g, " ")
    .trim()
}

function attribute(tag: string, name: string) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null
}

/** An address the page names for a picture or icon: https only, made whole against the page's own. */
function pictureAddress(value: string | null, base: URL) {
  if (!value) return null
  try {
    return httpsAddress(new URL(decode(value), base).toString(), MAX_ADDRESS)
  } catch {
    return null
  }
}

/** What the card shows, read from the top of a page's HTML. Nothing in it is ever drawn as markup. */
export function readPreview(html: string, url: URL): PagePreview {
  const head = html.slice(0, MAX_BYTES)
  const meta = new Map<string, string>()
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attribute(tag, "property") ?? attribute(tag, "name"))?.toLowerCase()
    const content = attribute(tag, "content")
    if (key && content !== null && !meta.has(key)) meta.set(key, content)
  }
  let icon: string | null = null
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attribute(tag, "rel")?.toLowerCase() ?? ""
    if (/\b(icon|apple-touch-icon)\b/.test(rel)) {
      icon = attribute(tag, "href")
      if (rel.includes("apple-touch-icon")) break
    }
  }
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? null
  const title = decode(meta.get("og:title") ?? meta.get("twitter:title") ?? titleTag ?? "").slice(0, MAX_TEXT)
  const siteName = decode(meta.get("og:site_name") ?? "").slice(0, MAX_TEXT) || url.hostname.replace(/^www\./, "")
  return {
    url: url.toString(),
    title: title || null,
    siteName,
    imageUrl: pictureAddress(meta.get("og:image") ?? meta.get("twitter:image") ?? null, url),
    iconUrl: pictureAddress(icon ?? "/favicon.ico", url),
  }
}

/** What the card shows when the page can't be read: the site's name and the address. */
export function plainPreview(url: URL): PagePreview {
  return { url: url.toString(), title: null, siteName: url.hostname.replace(/^www\./, ""), imageUrl: null, iconUrl: null }
}

const kept = new Map<string, { at: number; preview: PagePreview }>()

/**
 * The card for one pasted address. An address Project's server may not visit
 * is refused in words; a page that is slow, missing or not HTML still gets a
 * card with its site's name.
 */
export async function previewPage(text: string, { get = getPage, at = Date.now() }: { get?: GetPage; at?: number } = {}) {
  const url = visitableAddress(text)
  if (!url) throw new Error(PROJECT_ERRORS.pageAddressRefused)
  const key = url.toString()
  const hit = kept.get(key)
  if (hit && at - hit.at < KEEP_MS) return hit.preview
  let preview: PagePreview
  try {
    const { url: landed, answer } = await fetchPage(url, get)
    preview = answer.status === 200 && answer.body ? { ...readPreview(answer.body, landed), url: key } : plainPreview(url)
  } catch (error) {
    if (error instanceof Error && error.message === PROJECT_ERRORS.pageAddressRefused) throw error
    preview = plainPreview(url)
  }
  if (kept.size >= MAX_KEPT) kept.delete(kept.keys().next().value as string)
  kept.set(key, { at, preview })
  return preview
}
