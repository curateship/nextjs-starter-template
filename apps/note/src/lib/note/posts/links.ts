import { POST_SAYS } from "@/lib/note/posts/posts"

/**
 * Which pasted links are X posts. The post's number is read off the link at
 * once, so saving the same post twice is caught before anything is fetched.
 *
 * The address the app then reads is built from that number alone
 * (`x.com/i/status/<number>`), never from what was pasted, so nothing typed
 * into the box can send the server anywhere but X.
 */

export type PostLink = {
  postId: string
  /** The tidied address shown on the card: x.com, the handle, the number. */
  url: string
}

const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
])

/** X's numbers are up to 19 digits today; a little room is left above that. */
const POST_ID = /^\d{1,25}$/
/** X's own rule for a handle: 1 to 15 letters, digits or underscores. */
const HANDLE = /^[A-Za-z0-9_]{1,15}$/

/**
 * Reads a pasted link. Accepts `x.com/<handle>/status/<number>` and the same
 * on twitter.com and their mobile hosts, `x.com/i/web/status/<number>` and
 * `x.com/i/status/<number>`, with or without `?s=` and other junk on the end
 * or a `/photo/1` after the number. Anything else is "That is not a link to an
 * X post".
 */
export function parsePostLink(raw: string): PostLink {
  let parsed: URL
  try {
    const trimmed = raw.trim()
    // "x.com/naval/status/1" pasted without the https:// still means the post.
    parsed = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    throw new Error(POST_SAYS.notALink)
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password ||
    !X_HOSTS.has(parsed.hostname.toLowerCase())
  ) {
    throw new Error(POST_SAYS.notALink)
  }

  const segments = parsed.pathname.split("/").filter(Boolean)
  const at = segments.findIndex((segment) => segment.toLowerCase() === "status" || segment.toLowerCase() === "statuses")
  const postId = at >= 0 ? segments[at + 1] : undefined
  if (!postId || !POST_ID.test(postId)) throw new Error(POST_SAYS.notALink)

  const before = segments.slice(0, at)
  const handle = before.length === 1 && HANDLE.test(before[0]) && before[0].toLowerCase() !== "i" ? before[0] : null
  const fromI = before[0]?.toLowerCase() === "i"
  if (!handle && !fromI) throw new Error(POST_SAYS.notALink)

  return {
    postId,
    url: handle ? `https://x.com/${handle}/status/${postId}` : `https://x.com/i/status/${postId}`,
  }
}

/** The address of a post by its author, once the author is known. */
export function postUrl(handle: string | null, postId: string) {
  return handle && HANDLE.test(handle)
    ? `https://x.com/${handle}/status/${postId}`
    : `https://x.com/i/status/${postId}`
}
