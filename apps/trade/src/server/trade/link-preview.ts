import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"

import { NOTE_ERRORS } from "@/lib/trade/note-errors"
import { cleanLinkPreview, type NoteLinkAttrs } from "@/lib/trade/note-blocks"
import { resolvePublicWebhookTarget, type PublicWebhookTarget } from "@/server/automations/net-guard"

/**
 * The Link block's card (Travel features 4, part 5; Tyler, 6 Nov 2026:
 * "Title, picture, site"): a pasted web page's title, picture and site name,
 * read once on the server and kept in the note, so opening the note never
 * fetches the page again.
 *
 * The server fetches an address a person typed, so it is checked the way the
 * shell's webhooks are (`src/server/automations/net-guard.ts`): https only (an
 * `http://` address is read as `https://`, since nearly every site answers
 * both), no name and password in it, and every address its name looks up to must be
 * public. The connection then goes to the address that was checked, so a
 * second lookup can't point it somewhere else. Redirects are followed one at a
 * time, each checked again, at most 3. Only the first 256 KB of the page is
 * read, and the whole thing gives up after 5 seconds.
 *
 * A page that can't be read still makes a card, with the site's name and the
 * address. Only an address that may not be fetched at all is refused.
 */

const TIMEOUT_MS = 5000
const MAX_REDIRECTS = 3
const MAX_BYTES = 256 * 1024

type Answer = { status: number; location: string | null; type: string; body: string }
export type FetchPage = (target: PublicWebhookTarget, signal: AbortSignal) => Promise<Answer>
type Resolve = typeof resolvePublicWebhookTarget

/** One GET to the checked address, reading at most 256 KB of the answer. */
const fetchPage: FetchPage = (target, signal) => {
  const hostname = target.url.hostname.replace(/^\[|\]$/g, "")
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: target.address,
        family: target.family,
        port: target.url.port || 443,
        path: `${target.url.pathname}${target.url.search}`,
        method: "GET",
        servername: isIP(hostname) ? undefined : hostname,
        signal,
        headers: {
          host: target.url.host,
          accept: "text/html,application/xhtml+xml",
          "accept-encoding": "identity",
          "user-agent": "Mozilla/5.0 (compatible; TradeLinkPreview/1.0)",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0
        const location = typeof response.headers.location === "string" ? response.headers.location : null
        const type = String(response.headers["content-type"] ?? "")
        if (status >= 300 && status < 400) {
          response.destroy()
          resolve({ status, location, type, body: "" })
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        const finish = () => resolve({ status, location, type, body: Buffer.concat(chunks).toString("utf8") })
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk)
          size += chunk.length
          if (size >= MAX_BYTES) {
            response.destroy()
            finish()
          }
        })
        response.on("end", finish)
        response.on("error", reject)
      }
    )
    request.on("error", reject)
    request.end()
  })
}

/**
 * The address a person pasted, as a URL to fetch, or a refusal saying what's
 * wrong with it. A bare "whatever.com" gets `https://` put in front (Tyler,
 * 6 Nov 2026: "I shouldnt need to type https:// to enter a link").
 */
function readAddress(value: string) {
  const typed = value.trim()
  let url: URL
  try {
    const bare = !/^[a-z][a-z\d+.-]*:\/\//i.test(typed)
    url = new URL(bare ? `https://${typed}` : typed)
    // A bare word such as "ramen" isn't a site: one typed without https:// needs a dot in its name.
    if (bare && !url.hostname.includes(".")) throw new Error("no dot")
  } catch {
    throw new Error(NOTE_ERRORS.linkNotAddress)
  }
  if (url.protocol === "http:") url.protocol = "https:"
  if (url.protocol !== "https:") throw new Error(NOTE_ERRORS.linkNotHttps)
  url.hash = ""
  return url
}

/** The checked target, or a refusal: the shell's check names webhooks, so its reasons are put in Travel's words. */
async function checked(url: URL, resolve: Resolve) {
  try {
    return await resolve(url.toString())
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("private")) throw new Error(NOTE_ERRORS.linkPrivate)
    if (message.includes("could not be found")) throw new Error(NOTE_ERRORS.linkNotFound)
    throw new Error(NOTE_ERRORS.linkNotAddress)
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

function decode(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Math.min(Number(code), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Math.min(Number.parseInt(code, 16), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, " ")
    .trim()
}

/** The page's `<meta>` values by their property or name, lower case, the first of each kept. */
function metaValues(html: string) {
  const values = new Map<string, string>()
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map<string, string>()
    for (const match of tag.matchAll(/([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "")
    }
    const key = (attrs.get("property") ?? attrs.get("name"))?.toLowerCase()
    const content = attrs.get("content")
    if (key && content && !values.has(key)) values.set(key, decode(content))
  }
  return values
}

/** The title, picture and site name a page gives about itself, with the address it was read at. */
export function readPagePreview(html: string, at: URL): NoteLinkAttrs {
  const meta = metaValues(html)
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const imageValue = meta.get("og:image") ?? meta.get("og:image:url") ?? meta.get("twitter:image") ?? null
  let image: string | null = null
  if (imageValue) {
    try {
      image = new URL(imageValue, at).toString()
    } catch {
      image = null
    }
  }
  const read = cleanLinkPreview({
    url: at.toString(),
    title: meta.get("og:title") ?? meta.get("twitter:title") ?? (titleTag ? decode(titleTag) : null),
    image,
    site: meta.get("og:site_name") ?? siteOf(at),
  })
  return read ?? bareCard(at)
}

/** "example.com" for https://www.example.com/a. */
function siteOf(url: URL) {
  return url.hostname.replace(/^www\./, "")
}

/** The card for a page that said nothing about itself: the site's name and the address. */
function bareCard(url: URL): NoteLinkAttrs {
  return { url: url.toString(), title: null, image: null, site: siteOf(url) }
}

/**
 * The Link block's card for a pasted address. Throws only for an address that
 * may not be fetched; a page that doesn't answer, isn't a page or says nothing
 * about itself gives the site's name and the address alone.
 */
export async function loadLinkPreview(
  address: string,
  { resolve = resolvePublicWebhookTarget, fetch = fetchPage }: { resolve?: Resolve; fetch?: FetchPage } = {}
): Promise<NoteLinkAttrs> {
  const pasted = readAddress(address)
  const bare = bareCard(pasted)
  let target = await checked(pasted, resolve)
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const answer = await fetch(target, signal)
      if (answer.status >= 300 && answer.status < 400 && answer.location) {
        if (hop === MAX_REDIRECTS) return bare
        const next = new URL(answer.location, target.url)
        next.hash = ""
        // A redirect is checked like a pasted address; one that may not be fetched leaves the card as pasted.
        target = await checked(next, resolve)
        continue
      }
      if (answer.status < 200 || answer.status >= 300 || !/html/i.test(answer.type)) return bare
      return readPagePreview(answer.body, target.url)
    }
  } catch {
    // No answer in time, a refused redirect or a broken page: the card as pasted.
  }
  return bare
}
