import type { IncomingMessage } from "node:http"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import type { LookupFunction } from "node:net"
import { isIP } from "node:net"

import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { publicAddresses } from "@/server/browser/proxy-probe"
import type { LinkPage } from "@/lib/social/options"

import { promoFinds } from "./schema"

/**
 * Reading the page a link post points to, so a post with no words of its own
 * still has something to write a comment about.
 *
 * This is the one place the server fetches an address somebody else chose: a
 * stranger on Reddit wrote it. So the guard is the main piece of work. Every
 * address, and every address a redirect sends it on to, must resolve to the
 * public internet, by the same rule a proxy host is held to
 * (`publicAddresses` in `src/server/browser/proxy-probe.ts`). Otherwise a
 * Reddit post linking to http://169.254.169.254/ would make the server read
 * its own cloud metadata. The connection then goes to the address that was
 * checked, never to a second lookup of the name, so a name cannot answer
 * public for the check and private for the connection.
 *
 * Only the title and the opening paragraph are kept, because the point is
 * context for a comment and not the article.
 */

/** How many redirects a link may take before it is given up on. */
const MAX_REDIRECTS = 3

/** The whole read, every redirect included. */
const READ_TIMEOUT_MS = 8_000

/** The most of a page read. The title and first paragraph sit well inside it. */
const MAX_BYTES = 512 * 1024

const MAX_TITLE_CHARS = 300
const MAX_TEXT_CHARS = 1_000

/** A paragraph shorter than this is a caption, a byline or a cookie line. */
const MIN_PARAGRAPH_CHARS = 60

/** The most of one tag read for its name and attributes. */
const MAX_TAG_CHARS = 2_000

/** Parts of a page that are never its opening paragraph, skipped whole. */
const SKIPPED_BLOCKS = new Set([
  "script",
  "style",
  "noscript",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "svg",
  "sup",
])

/** How many links one pass of the ticker reads, side by side. */
const BATCH = 4

/**
 * Addresses that are never worth reading: Reddit itself (a crosspost, a
 * gallery, a picture or a video it hosts) and the places that only hold a
 * picture or a video. Pictures and video are out of scope.
 */
const SKIPPED_HOSTS = [
  "reddit.com",
  "redd.it",
  "redditmedia.com",
  "imgur.com",
  "giphy.com",
  "gfycat.com",
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "streamable.com",
]

const MEDIA_PATH = /\.(jpe?g|png|gif|gifv|webp|avif|svg|bmp|mp4|webm|mov|m4v|mp3|wav|pdf)$/i

/**
 * Why a link was not read, in words for the answer panel. `insideNetwork` is
 * the refusal that matters, and is logged as well as stored.
 */
export class LinkReadError extends Error {
  readonly insideNetwork: boolean

  constructor(message: string, insideNetwork = false) {
    super(message)
    this.insideNetwork = insideNetwork
  }
}

/**
 * The outbound address worth reading, cleaned, or "" for anything that is not
 * a web page outside Reddit. The browser passes on whatever Reddit said the
 * post links to; this decides.
 */
export function cleanLinkUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return ""
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return ""
  if (url.username || url.password) return ""
  const host = url.hostname.toLowerCase()
  if (SKIPPED_HOSTS.some((name) => host === name || host.endsWith(`.${name}`))) return ""
  if (MEDIA_PATH.test(url.pathname)) return ""
  url.hash = ""
  const href = url.toString()
  return href.length <= 2_000 ? href : ""
}

type Answer = { status: number; headers: IncomingMessage["headers"]; body: Buffer }

/** One request, to an address already checked. Exported for the tests' fake. */
export type FetchOnce = (url: URL, address: string, deadline: number) => Promise<Answer>

/**
 * Reads the page, following at most three redirects, and returns its title
 * and opening paragraph. Every refusal and failure throws a `LinkReadError`
 * whose words say what happened.
 */
export async function fetchLinkPage(
  address: string,
  fetchOnce: FetchOnce = requestPinned,
  now: () => number = Date.now
): Promise<LinkPage> {
  const deadline = now() + READ_TIMEOUT_MS
  let url = new URL(address)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertReadable(url)
    const addresses = await checkedAddresses(url.hostname)

    const answer = await fetchOnce(url, addresses[0], deadline)

    if (answer.status >= 300 && answer.status < 400) {
      const location = answer.headers.location
      if (!location) throw new LinkReadError(`The page answered ${answer.status} and said nowhere to go.`)
      url = new URL(location, url)
      continue
    }
    if (answer.status < 200 || answer.status >= 300) {
      throw new LinkReadError(`The page answered ${answer.status}.`)
    }

    const type = String(answer.headers["content-type"] ?? "").toLowerCase()
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      throw new LinkReadError(
        `The link is not a web page${type ? ` (${type.split(";")[0]})` : ""}.`
      )
    }

    const page = summarisePage(decodeBody(answer.body, type), url.toString())
    if (!page) {
      throw new LinkReadError(
        "The page had no title or text to read. It may only draw itself with JavaScript."
      )
    }
    return page
  }

  throw new LinkReadError(`The link redirected more than ${MAX_REDIRECTS} times.`)
}

/** The rules every hop is held to before its name is even looked up. */
function assertReadable(url: URL): void {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new LinkReadError("The link is not a web address.")
  }
  if (url.username || url.password) {
    throw new LinkReadError("The link carries a name and password, so it was not read.")
  }
  // Only the web's own ports. A public address answering on some other port
  // is not a page a person would be sent to from Reddit.
  if (url.port) {
    throw new LinkReadError(`The link names port ${url.port}, so it was not read.`)
  }
}

/** The checked addresses for a host, or a refusal that says it was inside. */
async function checkedAddresses(host: string): Promise<string[]> {
  let addresses: string[] | null
  try {
    addresses = await publicAddresses(host)
  } catch {
    throw new LinkReadError(`${host} could not be found.`)
  }
  if (!addresses) {
    throw new LinkReadError(
      `The link points inside the network (${host}), so it was refused and not read.`,
      true
    )
  }
  return addresses
}

/**
 * One GET, connecting to `address` whatever the name says now. HTTPS still
 * checks the certificate against the name, because the URL keeps it.
 */
function requestPinned(url: URL, address: string, deadline: number): Promise<Answer> {
  const family = isIP(address) === 6 ? 6 : 4
  const lookup: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null, [{ address, family }])
    else callback(null, address, family)
  }
  const send = url.protocol === "https:" ? httpsRequest : httpRequest

  return new Promise((resolvePromise, reject) => {
    const left = deadline - Date.now()
    if (left <= 0) {
      reject(new LinkReadError("The page took too long to answer."))
      return
    }
    const req = send(
      url,
      {
        method: "GET",
        lookup,
        // No shared pool of open connections, so this request's socket is the
        // one made to the checked address and no other.
        agent: false,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-encoding": "identity",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
      },
      (res) => {
        // A redirect's body is not needed, only where it points.
        if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400) {
          res.resume()
          finish({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.alloc(0) })
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk)
          size += chunk.length
          // Enough read. The rest of the page is not wanted.
          if (size >= MAX_BYTES) {
            finish({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
            req.destroy()
          }
        })
        res.on("end", () =>
          finish({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
        )
        res.on("error", fail)
      }
    )
    const timer = setTimeout(() => {
      fail(new LinkReadError("The page took too long to answer."))
      req.destroy()
    }, left)
    let settled = false
    function finish(answer: Answer) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(answer)
    }
    function fail(error: unknown) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(
        error instanceof LinkReadError
          ? error
          : new LinkReadError("The page could not be reached.")
      )
    }
    req.on("error", fail)
    req.end()
  })
}

/** The page's bytes as text, in the character set it named, UTF-8 otherwise. */
function decodeBody(body: Buffer, contentType: string): string {
  const charset = contentType.match(/charset=["']?([\w-]+)/)?.[1] ?? "utf-8"
  try {
    return new TextDecoder(charset).decode(body)
  } catch {
    return new TextDecoder("utf-8").decode(body)
  }
}

/**
 * The title and the opening paragraph of a page, or null when it has neither.
 *
 * The title is the page's own share title when it has one, which is the
 * headline without the site name tacked on. The paragraph is the first one
 * long enough to be prose, skipping navigation, headers, footers and asides,
 * and falls back to the page's own description.
 *
 * Read in one walk from the start of the page to the end. A pattern that
 * searches the rest of the page again for every unclosed tag took minutes on
 * 512 KB of them, and held the whole server while it ran.
 */
export function summarisePage(html: string, url: string): LinkPage | null {
  const lower = html.toLowerCase()
  const meta = new Map<string, string>()
  let rawTitle = ""
  let paragraph: string[] | null = null
  let text = ""

  let at = 0
  while (at < html.length && !text) {
    const open = html.indexOf("<", at)
    if (open === -1) break
    if (paragraph) paragraph.push(html.slice(at, open))

    if (html.startsWith("<!--", open)) {
      const close = html.indexOf("-->", open + 4)
      if (close === -1) break
      at = close + 3
      continue
    }
    const end = html.indexOf(">", open)
    if (end === -1) break
    at = end + 1

    const tag = html.slice(open, Math.min(end + 1, open + MAX_TAG_CHARS))
    const closing = tag[1] === "/"
    const name = tag.match(/^<\/?([a-z][a-z0-9]*)/i)?.[1]?.toLowerCase() ?? ""

    if (SKIPPED_BLOCKS.has(name)) {
      // Footnote marks such as Wikipedia's [1] go too, so they do not land in
      // the middle of a sentence. A block left open runs to the end.
      if (closing || tag.endsWith("/>")) continue
      const close = lower.indexOf(`</${name}`, at)
      if (close === -1) break
      at = close
    } else if (name === "p") {
      if (paragraph) {
        const words = plainText(paragraph.join(" "))
        if (words.length >= MIN_PARAGRAPH_CHARS) text = words
      }
      paragraph = closing ? null : []
    } else if (name === "title" && !closing && !rawTitle) {
      const close = lower.indexOf("</title", at)
      if (close === -1) break
      rawTitle = html.slice(at, Math.min(close, at + MAX_TITLE_CHARS * 4))
      at = close
    } else if (name === "meta") {
      const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()
      const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1]
      if (key && content !== undefined && !meta.has(key)) meta.set(key, content)
    }
  }

  const title = cap(plainText(meta.get("og:title") || rawTitle), MAX_TITLE_CHARS)
  text = cap(text || plainText(meta.get("og:description") || meta.get("description") || ""), MAX_TEXT_CHARS)

  if (!title && !text) return null
  return { url, title, text }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
}

/** Entities undone, runs of white space made one space. The tags are already gone. */
function plainText(fragment: string): string {
  return fragment
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === "#") {
        const value = code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1))
        return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole
      }
      return ENTITIES[code.toLowerCase()] ?? whole
    })
    .replace(/\s+/g, " ")
    // A tag gone leaves a space before the full stop after a link.
    .replace(/ ([.,;:!?])/g, "$1")
    .trim()
}

/** Cut at a word with an ellipsis, so a capped line does not end mid-word. */
function cap(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * One pass of the ticker: reads the linked page of a few link posts that have
 * not been tried yet, newest first, and stores what came back or why not.
 *
 * Only posts still waiting to be looked at, because a skipped post will never
 * be answered and a commented one already has been. Each post is claimed
 * before its page is fetched, by stamping when it was tried, so two passes
 * never read the same page and a page that hangs is never retried forever.
 */
export async function readDueLinkPages(
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  read: (url: string) => Promise<LinkPage> = (url) => fetchLinkPage(url)
): Promise<{ read: number; failed: number; refused: number }> {
  const due = await db
    .select({ id: promoFinds.id })
    .from(promoFinds)
    .where(
      and(
        ne(promoFinds.linkUrl, ""),
        eq(promoFinds.body, ""),
        isNull(promoFinds.linkReadAt),
        inArray(promoFinds.status, ["new", "shortlisted"])
      )
    )
    .orderBy(desc(promoFinds.firstSeenAt))
    .limit(BATCH)
  if (!due.length) return { read: 0, failed: 0, refused: 0 }

  const claimed = await db
    .update(promoFinds)
    .set({ linkReadAt: now })
    .where(
      and(
        inArray(
          promoFinds.id,
          due.map((row) => row.id)
        ),
        isNull(promoFinds.linkReadAt)
      )
    )
    .returning({ id: promoFinds.id, linkUrl: promoFinds.linkUrl })

  const outcomes = await Promise.all(
    claimed.map(async (find) => {
      try {
        const page = await read(find.linkUrl)
        await db
          .update(promoFinds)
          .set({ linkPage: page, linkError: "" })
          .where(eq(promoFinds.id, find.id))
        return "read" as const
      } catch (error) {
        const refused = error instanceof LinkReadError && error.insideNetwork
        const message =
          error instanceof LinkReadError ? error.message : "The page could not be read."
        if (refused) {
          // Recorded on the post as well, but worth a line in the log: a link
          // into the network is somebody probing, or a mistake worth seeing.
          console.warn(`Refused to read a Reddit link pointing inside the network: find ${find.id}, ${find.linkUrl}`)
        }
        await db
          .update(promoFinds)
          .set({ linkPage: null, linkError: message })
          .where(eq(promoFinds.id, find.id))
        return refused ? ("refused" as const) : ("failed" as const)
      }
    })
  )

  return {
    read: outcomes.filter((outcome) => outcome === "read").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    refused: outcomes.filter((outcome) => outcome === "refused").length,
  }
}
