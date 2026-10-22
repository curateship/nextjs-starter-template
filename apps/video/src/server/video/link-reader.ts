import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"

import {
  LINK_REFUSED_MESSAGE,
  LINK_UNREADABLE_MESSAGE,
} from "@/lib/video/carousel-writing"
import {
  resolvePublicWebhookTarget,
  type PublicWebhookTarget,
} from "@/server/automations/net-guard"

/**
 * The words on a web page, for the carousel writer to work from
 * (workspace/docs/carousel-writing.md). The address is looked up once and
 * refused when any answer points at this machine or a private network; the
 * request then goes to the address that was checked, so a second look-up
 * cannot swap it for another. That is the guard the shell's webhooks use.
 * Only https pages are read, at most three redirects are followed, each
 * checked again, and at most 2MB is read, within ten seconds a request.
 */

const MAX_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 3
const MAX_WORDS_CHARS = 20_000
const TIMEOUT_MS = 10_000

type Answer = { status: number; location: string | null; type: string; body: string }

type Resolve = (address: string) => Promise<PublicWebhookTarget>

/** One GET to the checked address, the page's own name kept for TLS. */
function getOnce(target: PublicWebhookTarget): Promise<Answer> {
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
        timeout: TIMEOUT_MS,
        headers: {
          host: target.url.host,
          accept: "text/html,text/plain;q=0.9",
          "user-agent": "Mozilla/5.0 (compatible; CarouselWriter/1.0)",
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        let total = 0
        response.on("data", (chunk: Buffer) => {
          total += chunk.byteLength
          if (total > MAX_BYTES) {
            response.destroy()
            reject(new Error(LINK_UNREADABLE_MESSAGE))
            return
          }
          chunks.push(chunk)
        })
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            location: response.headers.location ?? null,
            type: String(response.headers["content-type"] ?? ""),
            body: Buffer.concat(chunks).toString("utf8"),
          })
        )
        response.on("error", () => reject(new Error(LINK_UNREADABLE_MESSAGE)))
      }
    )
    // `timeout` above only notices a quiet connection; this ends one that
    // trickles a byte at a time.
    const whole = setTimeout(
      () => request.destroy(new Error(LINK_UNREADABLE_MESSAGE)),
      TIMEOUT_MS
    )
    request.on("close", () => clearTimeout(whole))
    request.on("timeout", () => request.destroy(new Error(LINK_UNREADABLE_MESSAGE)))
    request.on("error", () => reject(new Error(LINK_UNREADABLE_MESSAGE)))
    request.end()
  })
}

async function checked(address: string, resolve: Resolve) {
  try {
    // The part after # is never sent, and the guard refuses an address that
    // carries one.
    const url = new URL(address)
    url.hash = ""
    return await resolve(url.toString())
  } catch {
    throw new Error(LINK_REFUSED_MESSAGE)
  }
}

export async function readLinkText(
  address: string,
  {
    resolve = resolvePublicWebhookTarget,
    get = getOnce,
  }: { resolve?: Resolve; get?: (target: PublicWebhookTarget) => Promise<Answer> } = {}
): Promise<string> {
  let target = await checked(address.trim(), resolve)
  for (let hop = 0; ; hop += 1) {
    const answer = await get(target)
    if (answer.status >= 300 && answer.status < 400 && answer.location) {
      if (hop >= MAX_REDIRECTS) throw new Error(LINK_UNREADABLE_MESSAGE)
      target = await checked(
        new URL(answer.location, target.url).toString(),
        resolve
      )
      continue
    }
    if (answer.status !== 200) throw new Error(LINK_UNREADABLE_MESSAGE)
    const words = answer.type.includes("html")
      ? pageWords(answer.body)
      : answer.type.includes("text/plain")
        ? answer.body
        : ""
    const cleaned = words.replace(/\s+/g, " ").trim().slice(0, MAX_WORDS_CHARS)
    if (cleaned.length < 40) throw new Error(LINK_UNREADABLE_MESSAGE)
    return cleaned
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

// Left out whole, with everything inside them.
const SKIPPED_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "nav",
  "header",
  "footer",
  "form",
])
// Their end starts a new line.
const LINE_TAGS = new Set([
  ..."p div li br tr section h1 h2 h3 h4 h5 h6".split(" "),
])

/** Only A to Z are lowered, so every place in it matches the original. */
function lowered(text: string) {
  return text.replace(/[A-Z]+/g, (letters) => letters.toLowerCase())
}

/** The words between the first `<name …>` and its `</name>`, or null. */
function insideTag(html: string, lower: string, name: string) {
  let at = 0
  for (;;) {
    const open = lower.indexOf(`<${name}`, at)
    if (open < 0) return null
    const after = lower[open + name.length + 1]
    if (after && /[a-z0-9-]/.test(after)) {
      at = open + 1
      continue
    }
    const openEnd = lower.indexOf(">", open)
    if (openEnd < 0) return null
    const close = lower.indexOf(`</${name}`, openEnd)
    return html.slice(openEnd + 1, close < 0 ? html.length : close)
  }
}

/**
 * A page's readable words: its title and text, scripts and menus left out.
 * One pass from start to end, with no pattern that backtracks, so a page of
 * tags that are never closed reads as fast as any other.
 */
export function pageWords(html: string) {
  const lowerAll = lowered(html)
  const title = insideTag(html, lowerAll, "title") ?? ""
  const main =
    insideTag(html, lowerAll, "article") ??
    insideTag(html, lowerAll, "main") ??
    html
  const lower = main === html ? lowerAll : lowered(main)

  const parts: string[] = []
  // Where each skipped tag's next close was last found, so a page of tags
  // never closed looks for the close once, not once per tag.
  const nextClose = new Map<string, number>()
  let at = 0
  while (at < main.length) {
    const open = main.indexOf("<", at)
    if (open < 0) {
      parts.push(main.slice(at))
      break
    }
    parts.push(main.slice(at, open))
    // As in a browser, a < not followed by a letter, / or ! is just text.
    if (!/[a-z/!?]/.test(lower[open + 1] ?? "")) {
      parts.push("<")
      at = open + 1
      continue
    }
    const end = main.indexOf(">", open)
    if (end < 0) {
      parts.push(main.slice(open))
      break
    }
    const closing = lower[open + 1] === "/"
    const name =
      /^[a-z][a-z0-9]*/.exec(
        lower.slice(open + (closing ? 2 : 1), open + 14)
      )?.[0] ?? ""
    at = end + 1
    if (!closing && SKIPPED_TAGS.has(name)) {
      let close = nextClose.get(name)
      if (close === undefined || (close >= 0 && close < at)) {
        close = lower.indexOf(`</${name}`, at)
        nextClose.set(name, close)
      }
      if (close >= 0) {
        const closeEnd = lower.indexOf(">", close)
        at = closeEnd < 0 ? main.length : closeEnd + 1
      }
      parts.push(" ")
      continue
    }
    parts.push(name === "br" || (closing && LINE_TAGS.has(name)) ? "\n" : " ")
  }
  const text = parts.join("")
  return `${title}\n${text}`.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      const point = code.startsWith("#x")
        ? Number.parseInt(code.slice(2), 16)
        : code.startsWith("#")
          ? Number(code.slice(1))
          : null
      if (point === null) return ENTITIES[code.toLowerCase()] ?? entity
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : " "
    }
  )
}
