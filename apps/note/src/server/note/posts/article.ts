import { checkLinkHost, parseVideoLink, type ResolveHost } from "@/server/note/links"
import { BROWSER_AGENT, readCapped } from "@/server/note/posts/reader"
import { SayableError } from "@/server/note/sayable"
import { POST_SAYS } from "@/lib/note/posts/posts"

/**
 * Bringing in the article a post links to, only when "Bring in the article"
 * is pressed (Tyler, 19 Oct 2026: "Only when I press a button").
 *
 * The address came from a stranger's post, so the server opens it with the
 * same guard video links get (`src/server/note/links.ts`): https only, a
 * public name, and every address that name answers with a public one. Unlike
 * a video download, the redirects are followed here one at a time and each
 * new address is checked again, so a public page that sends the server on to
 * an inside address is refused too.
 */

const MAX_REDIRECTS = 5
const MAX_PAGE_BYTES = 2_000_000
const FETCH_TIMEOUT_MS = 15_000
/** The most of an article kept, the same cap Suggest fields reads a note to. */
const ARTICLE_TEXT_MAX = 40_000

export type Article = { title: string | null; text: string }

export async function fetchArticle(link: string, resolve?: ResolveHost): Promise<Article> {
  // A post's plain http:// link is asked for over https, the only kind the guard opens.
  let address = link.replace(/^http:\/\//i, "https://")
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await guard(address, resolve)
    let answer: Response
    try {
      answer = await fetch(address, {
        headers: { "user-agent": BROWSER_AGENT, accept: "text/html", "accept-language": "en-US,en;q=0.9" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch {
      throw new SayableError("The article's site didn't answer. Try again later.")
    }
    if (answer.status >= 300 && answer.status < 400) {
      const next = answer.headers.get("location")
      await answer.body?.cancel().catch(() => undefined)
      if (!next) break
      address = new URL(next, address).toString()
      continue
    }
    if (!answer.ok) {
      await answer.body?.cancel().catch(() => undefined)
      throw new SayableError(`The article's site refused the request (HTTP ${answer.status}).`)
    }
    if (!(answer.headers.get("content-type") ?? "").includes("text/html")) {
      await answer.body?.cancel().catch(() => undefined)
      throw new SayableError(POST_SAYS.notAnArticle)
    }
    const html = await readCapped(answer, MAX_PAGE_BYTES)
    const text = articleText(html)
    if (text.length < 200) throw new SayableError(POST_SAYS.notAnArticle)
    return { title: articleTitle(html), text }
  }
  throw new SayableError(POST_SAYS.notAnArticle)
}

async function guard(address: string, resolve?: ResolveHost) {
  try {
    const link = parseVideoLink(address)
    // A YouTube, TikTok or Instagram address is a video, not an article.
    if (link.source !== null) throw new Error(POST_SAYS.notAnArticle)
    await checkLinkHost(link, resolve)
  } catch {
    throw new SayableError(POST_SAYS.notAnArticle)
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
}

function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : ""
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

/** The title sits in the page's head, so only the start of the page is read for it. */
const HEAD_CHARS = 64_000

export function articleTitle(html: string): string | null {
  const head = html.slice(0, HEAD_CHARS)
  let title: string | null = null
  // Each tag is found by one pass that stops at the next "<", so a page built
  // to slow the search down cannot.
  for (const match of head.matchAll(/<meta\b[^<>]*>/gi)) {
    const tag = match[0]
    if (!/\bproperty\s*=\s*["']og:title["']/i.test(tag)) continue
    title = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i)?.slice(1).find(Boolean) ?? null
    if (title) break
  }
  title ??= between(head, "title")
  const clean = title ? decodeEntities(title).replace(/\s+/g, " ").trim() : ""
  return clean ? clean.slice(0, 300) : null
}

/** What sits inside the first `<tag …>…</tag>`, found by searching forward only. */
function between(html: string, tag: string): string | null {
  const open = new RegExp(`<${tag}\\b[^<>]*>`, "i").exec(html)
  if (!open) return null
  const from = open.index + open[0].length
  const close = new RegExp(`</${tag}\\s*>`, "i")
  const rest = html.slice(from)
  const end = close.exec(rest)
  return end ? rest.slice(0, end.index) : null
}

const DROPPED_TAGS = /<(script|style|noscript|svg|template|iframe|form|nav|header|footer|aside)\b/gi

/**
 * The page without comments, scripts, menus, headers and footers. Each one is
 * cut by searching forward from where the last one ended, so the work grows in
 * step with the page, never with its square.
 */
function withoutClutter(html: string): string {
  let out = ""
  let at = 0
  while (at < html.length) {
    const comment = html.indexOf("<!--", at)
    DROPPED_TAGS.lastIndex = at
    const tag = DROPPED_TAGS.exec(html)
    const next = Math.min(comment < 0 ? Infinity : comment, tag ? tag.index : Infinity)
    if (next === Infinity) {
      out += html.slice(at)
      break
    }
    out += html.slice(at, next) + " "
    if (next === comment) {
      const end = html.indexOf("-->", comment + 4)
      at = end < 0 ? html.length : end + 3
    } else if (tag) {
      const close = new RegExp(`</${tag[1]}\\s*>`, "gi")
      close.lastIndex = next
      const end = close.exec(html)
      at = end ? end.index + end[0].length : html.length
    }
  }
  return out
}

/**
 * The readable words of a page: the `<article>` when there is one, else
 * `<main>`, else the body, without scripts, menus, headers and footers, one
 * paragraph per line.
 */
export function articleText(html: string): string {
  const stripped = withoutClutter(html)
  const part = between(stripped, "article") ?? between(stripped, "main") ?? between(stripped, "body") ?? stripped
  const text = decodeEntities(
    part
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/blockquote|\/section)\b[^<>]*>/gi, "\n")
      .replace(/<li\b[^<>]*>/gi, "\n• ")
      .replace(/<[^<>]*>/g, " ")
  )
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, ARTICLE_TEXT_MAX)
}
