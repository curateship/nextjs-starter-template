import { lookup } from "node:dns/promises"
import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"

import { isPrivateWebhookHostname } from "@/lib/automations/nodes/webhook"
import { eventSourceUrlError } from "@/lib/events/draft-events-step"

/**
 * Reads the page the Draft events step was pointed at, as plain text for the
 * AI.
 *
 * The address is typed by an admin, so the server must not become a way to
 * reach inside its own network. Every DNS answer is checked and the connection
 * goes to the checked IP, so a second lookup cannot swap it. A redirect is
 * followed only after the same checks on its new address.
 */

const TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 3
/** Bigger than any events page; a page past this is cut off, not refused. */
const MAX_BYTES = 3_000_000
/** What the AI is given at most. About 30,000 words. */
const MAX_SOURCE_TEXT = 120_000

const READABLE_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
  "text/plain",
  "application/json",
  "application/ld+json",
]

type Resolve = (
  hostname: string
) => Promise<Array<{ address: string; family: number }>>

type Target = { url: URL; address: string; family: 4 | 6 }

type Response = {
  status: number
  location: string | null
  contentType: string
  body: string
}

export type SourcePageDependencies = {
  resolve: Resolve
  get: (target: Target, signal: AbortSignal) => Promise<Response>
  timeoutMs: number
}

const defaultDependencies: SourcePageDependencies = {
  resolve: (hostname) => lookup(hostname, { all: true }),
  get: getOnce,
  timeoutMs: TIMEOUT_MS,
}

/** The page's words, or a throw that says in plain words what went wrong. */
export async function readSourcePage(
  address: string,
  dependencies: SourcePageDependencies = defaultDependencies
): Promise<{ url: string; text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), dependencies.timeoutMs)
  try {
    let current = address
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let target: Target
      try {
        target = await checkedTarget(current, dependencies.resolve)
      } catch (error) {
        // Said out loud, or a refused redirect reads as a problem with the
        // address the admin typed.
        if (hop === 0) throw error
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`The page sent the step on to ${current}. ${reason}`)
      }
      let response: Response
      try {
        response = await dependencies.get(target, controller.signal)
      } catch {
        if (controller.signal.aborted) {
          throw new Error(
            `${target.url.hostname} took longer than ${dependencies.timeoutMs / 1000} seconds to answer.`
          )
        }
        throw new Error(`${target.url.hostname} could not be reached.`)
      }

      if (response.status >= 300 && response.status < 400) {
        if (!response.location) {
          throw new Error(`${target.url.hostname} sent a redirect with no address.`)
        }
        try {
          current = new URL(response.location, target.url).toString()
        } catch {
          throw new Error(
            `${target.url.hostname} sent a redirect to an address that is not one.`
          )
        }
        continue
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `${target.url.hostname} answered with HTTP ${response.status}, so the page could not be read.`
        )
      }
      const type = response.contentType.split(";")[0]?.trim().toLowerCase()
      if (type && !READABLE_TYPES.includes(type)) {
        throw new Error(
          `The address is a ${type} file, not a web page or feed.`
        )
      }
      return { url: target.url.toString(), text: pageText(response.body) }
    }
    throw new Error(
      `The page redirected more than ${MAX_REDIRECTS} times, so it was not read.`
    )
  } finally {
    clearTimeout(timer)
  }
}

async function checkedTarget(value: string, resolve: Resolve): Promise<Target> {
  const problem = eventSourceUrlError(value)
  if (problem) throw new Error(problem)

  const url = new URL(value)
  url.hash = ""
  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  const literal = isIP(hostname)
  let answers: Array<{ address: string; family: number }>
  if (literal === 4 || literal === 6) {
    answers = [{ address: hostname, family: literal }]
  } else {
    try {
      answers = await resolve(hostname)
    } catch {
      throw new Error(`${hostname} could not be found.`)
    }
  }
  if (answers.length === 0) throw new Error(`${hostname} could not be found.`)
  if (
    answers.some(
      ({ address, family }) =>
        (family !== 4 && family !== 6) ||
        isIP(address) !== family ||
        isPrivateWebhookHostname(address)
    )
  ) {
    throw new Error(
      `${hostname} points to a private or internal address, which this step cannot read.`
    )
  }
  const [first] = answers
  return { url, address: first.address, family: first.family as 4 | 6 }
}

/**
 * One GET to the checked IP, keeping the real hostname for the certificate
 * check and the Host header. Redirects come back to the caller unfollowed.
 */
function getOnce(target: Target, signal: AbortSignal): Promise<Response> {
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
          accept:
            "text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5",
          "user-agent": "Mozilla/5.0 (compatible; EventDrafts/1.0)",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0
        const location = response.headers.location ?? null
        const contentType = String(response.headers["content-type"] ?? "")
        if (status >= 300 && status < 400) {
          response.destroy()
          resolve({ status, location, contentType, body: "" })
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        response.on("data", (chunk: Buffer) => {
          if (size >= MAX_BYTES) return
          chunks.push(chunk)
          size += chunk.length
          if (size >= MAX_BYTES) response.destroy()
        })
        const finish = () =>
          resolve({
            status,
            location,
            contentType,
            body: Buffer.concat(chunks).subarray(0, MAX_BYTES).toString("utf8"),
          })
        response.on("end", finish)
        response.on("close", finish)
        response.on("error", reject)
      }
    )
    request.on("error", reject)
    request.end()
  })
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X"
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : ""
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

function stripTags(text: string): string {
  return text
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/item|\/entry|\/article|\/section)\b[^>]*>/gi, "\n")
    .replace(/<[a-z/!?][^>]*>/gi, " ")
}

/**
 * A page or feed as the words a person would read, plus its event markup for
 * Google. Other scripts, styles and drawings go; block ends become line
 * breaks so one event stays on its own lines. A feed's descriptions are often
 * HTML written as text, so the tags are taken out a second time after the
 * entities are turned back into characters.
 */
export function pageText(body: string): string {
  const cleaned = body
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // A venue's own event markup for Google is the most exact copy of its
    // dates on the page, so it is kept while every other script goes.
    .replace(
      /<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
      "\n$1\n"
    )
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
  return stripTags(decodeEntities(stripTags(cleaned)))
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim()
    .slice(0, MAX_SOURCE_TEXT)
}
