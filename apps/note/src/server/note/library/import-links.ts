import { parseVideoLink, type VideoLink } from "@/server/note/links"
import { THREADS_CODE, THREADS_HANDLE, threadsPostUrl } from "@/server/note/library/threads-reader"
import { parsePostLink } from "@/lib/note/library/x-links"
import { LIBRARY_SAYS, type ImportSource } from "@/lib/note/library/notes"

/**
 * Which Import source a pasted link is. Only YouTube, Instagram, TikTok, X,
 * Threads, LinkedIn, Facebook and Reddit links are taken; anything else is refused
 * with one sentence (`LIBRARY_SAYS.notALink`), because the Import menu offers
 * those and nothing else (Tyler, 20 Oct 2026: "Drop it", about uploads; he
 * added Threads, LinkedIn, Facebook and Reddit the same day). Only a post or a
 * video's own address is taken, never a profile or a page.
 *
 * A YouTube link is "YouTube short" when it is a /shorts/ address and "YouTube
 * long" otherwise. The site's own id comes off the link where it can, so the
 * same link imported twice into one library is caught before anything is
 * fetched. A shortened TikTok link only says which video it is once followed,
 * so its id waits for the download.
 */

type ImportLink = {
  source: ImportSource
  /** The tidied address the worker reads. */
  url: string
  platformId: string | null
}

const X_HOSTS = /^(www\.|mobile\.)?(x|twitter)\.com$/i
const THREADS_HOSTS = /^(www\.)?threads\.(com|net)$/i

function withScheme(raw: string) {
  const trimmed = raw.trim()
  return /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function readImportLink(raw: string): ImportLink {
  let host: string
  try {
    host = new URL(withScheme(raw)).hostname
  } catch {
    throw new Error(LIBRARY_SAYS.notALink)
  }
  if (X_HOSTS.test(host)) {
    const post = parsePostLink(raw)
    return { source: "x", url: post.url, platformId: post.postId }
  }
  if (THREADS_HOSTS.test(host)) return readThreadsLink(withScheme(raw))
  const other = readOtherSite(withScheme(raw))
  if (other) return other

  let link: VideoLink
  try {
    link = parseVideoLink(withScheme(raw))
  } catch {
    throw new Error(LIBRARY_SAYS.notALink)
  }
  if (link.source === null) throw new Error(LIBRARY_SAYS.notALink)
  if (link.source === "youtube") {
    const shorts = new URL(link.url).pathname.split("/").filter(Boolean)[0]?.toLowerCase() === "shorts"
    return { source: shorts ? "youtube_short" : "youtube_long", url: link.url, platformId: link.platformVideoId }
  }
  return { source: link.source, url: link.url, platformId: link.platformVideoId }
}

const LINKEDIN_HOSTS = /^(www\.)?linkedin\.com$/i
const FACEBOOK_HOSTS = /^(www\.|m\.|web\.)?facebook\.com$/i
const REDDIT_HOSTS = /^(www\.|old\.|new\.|m\.)?reddit\.com$/i
const NUMBER_ID = /^\d{5,25}$/
const REDDIT_ID = /^[a-z0-9]{3,12}$/i
const SHARE_CODE = /^[\w-]{3,40}$/

/**
 * A LinkedIn, Facebook or Reddit post's own address, or null when the host is
 * none of the three. A page of the three that is not one post is refused.
 * The id comes off the address where it says one; a share link's only shows
 * once yt-dlp has followed it.
 */
function readOtherSite(raw: string): ImportLink | null {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    throw new Error(LIBRARY_SAYS.notALink)
  }
  const host = parsed.hostname.toLowerCase()
  const known =
    LINKEDIN_HOSTS.test(host) || FACEBOOK_HOSTS.test(host) || host === "fb.watch" || REDDIT_HOSTS.test(host) || host === "redd.it"
  if (!known) return null
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(LIBRARY_SAYS.notALink)
  parsed.hash = ""
  const url = parsed.toString()
  const segments = parsed.pathname.split("/").filter(Boolean)
  const first = segments[0]?.toLowerCase()
  const refuse = (): never => {
    throw new Error(LIBRARY_SAYS.notALink)
  }

  if (LINKEDIN_HOSTS.test(host)) {
    // linkedin.com/posts/<name>-activity-<id>-<code> and /feed/update/urn:li:activity:<id>
    if (first !== "posts" && first !== "feed") refuse()
    const id = /activity[-:](\d{10,25})/.exec(decodeURIComponent(parsed.pathname))?.[1] ?? null
    if (first === "feed" && !id) refuse()
    return { source: "linkedin", url, platformId: id }
  }

  if (FACEBOOK_HOSTS.test(host) || host === "fb.watch") {
    if (host === "fb.watch") {
      if (!SHARE_CODE.test(segments[0] ?? "")) refuse()
      return { source: "facebook", url, platformId: null }
    }
    // /watch?v=<id>, /reel/<id>, /<page>/videos/<id>, /share/v/<code>, /share/r/<code>
    if (first === "watch") {
      const id = parsed.searchParams.get("v") ?? ""
      return NUMBER_ID.test(id) ? { source: "facebook", url, platformId: id } : refuse()
    }
    if (first === "reel") {
      return NUMBER_ID.test(segments[1] ?? "") ? { source: "facebook", url, platformId: segments[1] } : refuse()
    }
    if (first === "share" && (segments[1] === "v" || segments[1] === "r") && SHARE_CODE.test(segments[2] ?? "")) {
      return { source: "facebook", url, platformId: null }
    }
    const videosAt = segments.indexOf("videos")
    const id = videosAt >= 0 ? [...segments.slice(videosAt + 1)].reverse().find((each) => NUMBER_ID.test(each)) : undefined
    return id ? { source: "facebook", url, platformId: id } : refuse()
  }

  // reddit.com/r/<community>/comments/<id>/..., /r/<community>/s/<code>, redd.it/<id>
  if (host === "redd.it") {
    return REDDIT_ID.test(segments[0] ?? "") ? { source: "reddit", url, platformId: segments[0].toLowerCase() } : refuse()
  }
  if (first === "r" && segments[2] === "comments" && REDDIT_ID.test(segments[3] ?? "")) {
    return { source: "reddit", url, platformId: segments[3].toLowerCase() }
  }
  if (first === "r" && segments[2] === "s" && SHARE_CODE.test(segments[3] ?? "")) {
    return { source: "reddit", url, platformId: null }
  }
  return refuse()
}

/**
 * A Threads post: `threads.com/@<handle>/post/<code>`, or the older
 * `threads.net` address, kept as the one `threads.com` address so the same
 * post is one note. A profile or anything else on Threads is refused.
 */
function readThreadsLink(raw: string): ImportLink {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    throw new Error(LIBRARY_SAYS.notALink)
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(LIBRARY_SAYS.notALink)
  const [who, kind, code] = parsed.pathname.split("/").filter(Boolean)
  const handle = who?.startsWith("@") ? who.slice(1) : ""
  if (kind !== "post" || !THREADS_HANDLE.test(handle) || !THREADS_CODE.test(code ?? "")) {
    throw new Error(LIBRARY_SAYS.notALink)
  }
  return { source: "threads", url: threadsPostUrl(handle, code), platformId: code }
}
