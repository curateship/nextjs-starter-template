import { SayableError } from "@/server/note/sayable"
import { readCapped } from "@/server/note/library/x-reader"
import type { ReadPost } from "@/server/note/library/x-page"
import { LIBRARY_SAYS } from "@/lib/note/library/notes"

/**
 * Reading one Threads post (Tyler, 20 Oct 2026: "build page reader for threads
 * too"). yt-dlp has no reader for Threads, and a Threads page fetched as a
 * browser is an empty shell that a script fills in. Fetched the way a link
 * preview is (Facebook's own preview fetcher), the page carries the post in its
 * preview tags: "Adam Mosseri (@mosseri) on Threads" and the post's words, in
 * full. That is all a signed-out reader gets: no pictures (the preview picture
 * is a card Threads draws of the words), no video, no replies and no likes.
 *
 * The address is built from the handle and the post's code alone, and the host
 * is fixed, so nothing a member pastes can send this request anywhere else.
 */

const FETCH_TIMEOUT_MS = 15_000
/** A post page is about 550KB. This is far above that and still bounded. */
const MAX_PAGE_BYTES = 4_000_000
/** Threads answers a link preview fetcher with the post's tags, and anything else with a log-in shell. */
const PREVIEW_AGENT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"

export const THREADS_HANDLE = /^[A-Za-z0-9._]{1,30}$/
export const THREADS_CODE = /^[A-Za-z0-9_-]{5,20}$/

/** The post's own address, the one the note keeps. */
export function threadsPostUrl(handle: string, code: string) {
  return `https://www.threads.com/@${handle}/post/${code}`
}

export type ThreadsPage = { found: true; post: ReadPost } | { found: false }

function unescapeHtml(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

function metaTag(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const found = new RegExp(`<meta[^>]+property="${escaped}"[^>]+content="([^"]*)"`, "i").exec(html)
  return found ? unescapeHtml(found[1]) : null
}

/**
 * The post in a page Threads sent a preview fetcher, or not found when the
 * page is anything but that post: the log-in page a private or deleted post
 * gets, whose address is Threads' front page.
 */
export function readThreadsPage(html: string, code: string): ThreadsPage {
  const address = metaTag(html, "og:url")
  if (!address || !address.includes(`/post/${code}`)) return { found: false }
  const title = metaTag(html, "og:title") ?? ""
  // "Adam Mosseri (@mosseri) on Threads"
  const who = /^(.*?)\s*\(@([A-Za-z0-9._]{1,30})\)\s+on Threads$/.exec(title.trim())
  const handle = who?.[2] ?? /\/@([A-Za-z0-9._]{1,30})\/post\//.exec(address)?.[1] ?? null
  const name = who?.[1]?.trim() || null
  const text = (metaTag(html, "og:description") ?? "").replace(/\r\n?/g, "\n").trim()
  return {
    found: true,
    post: {
      postId: code,
      url: handle ? threadsPostUrl(handle, code) : address,
      authorName: name,
      authorHandle: handle,
      authorPictureUrl: null,
      postedAt: null,
      text,
      pictures: [],
      likes: null,
      reposts: null,
      quoted: null,
      thread: [],
      threadStatus: "none",
      articleUrl: null,
      video: null,
    },
  }
}

function isThreadsAddress(address: string) {
  try {
    const url = new URL(address)
    return url.protocol === "https:" && /^(?:www\.)?threads\.(?:com|net)$/i.test(url.hostname)
  } catch {
    return false
  }
}

/** Reads one post from its saved address, `https://www.threads.com/@<handle>/post/<code>`. */
export async function readThreadsPost(sourceUrl: string): Promise<ReadPost> {
  const found = /^https:\/\/www\.threads\.com\/@([^/]+)\/post\/([^/?#]+)$/.exec(sourceUrl)
  const handle = found?.[1] ?? ""
  const code = found?.[2] ?? ""
  if (!THREADS_HANDLE.test(handle) || !THREADS_CODE.test(code)) throw new SayableError(LIBRARY_SAYS.notALink)
  let answer: Response
  try {
    answer = await fetch(threadsPostUrl(handle, code), {
      headers: { "user-agent": PREVIEW_AGENT, "accept-language": "en-US,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    throw new SayableError(LIBRARY_SAYS.threadsBusy)
  }
  if (answer.status === 429 || answer.status === 403 || answer.status >= 500) throw new SayableError(LIBRARY_SAYS.threadsBusy)
  if (!isThreadsAddress(answer.url)) throw new SayableError(LIBRARY_SAYS.threadsUnreadable)
  const read = readThreadsPage(await readCapped(answer, MAX_PAGE_BYTES), code)
  if (!read.found) throw new SayableError(LIBRARY_SAYS.threadsUnreadable)
  return read.post
}
