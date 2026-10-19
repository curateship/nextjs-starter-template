import { SayableError } from "@/server/note/sayable"
import { readXPostPage, type ReadPost } from "@/server/note/posts/x-page"
import { POST_SAYS } from "@/lib/note/posts/posts"

/**
 * Fetching one post's page from X, with the habits Trade's reader learned
 * (`apps/trade/src/server/trade/social-readers.ts`): a short wait, a cap on
 * how much is read, the look of an ordinary browser, and refusing an answer
 * that came from anywhere but X.
 *
 * The address is built from the post's number alone, and the host is fixed,
 * so nothing a member pastes can send this request anywhere else.
 */

/** A post page is about 200KB. This is far above that and still bounded. */
const MAX_PAGE_BYTES = 4_000_000
const FETCH_TIMEOUT_MS = 15_000
/** X serves a page with no post data to something that does not look like a browser. */
export const BROWSER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

export async function readXPost(postId: string): Promise<ReadPost> {
  if (!/^\d{1,25}$/.test(postId)) throw new SayableError(POST_SAYS.notALink)
  let answer: Response
  try {
    // x.com/i/status/<number> sends a browser on to the author's own address.
    answer = await fetch(`https://x.com/i/status/${postId}`, {
      headers: { "user-agent": BROWSER_AGENT, "accept-language": "en-US,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    throw new SayableError(POST_SAYS.xBusy)
  }
  if (answer.status === 429 || answer.status === 403 || answer.status >= 500) {
    throw new SayableError(POST_SAYS.xBusy)
  }
  if (!isXAddress(answer.url)) throw new SayableError(POST_SAYS.xChanged)

  const read = readXPostPage(await readCapped(answer), postId)
  if (read.found) return read.post
  throw new SayableError(
    read.why === "deleted" ? POST_SAYS.deleted : read.why === "private" ? POST_SAYS.private : POST_SAYS.xChanged
  )
}

function isXAddress(address: string) {
  try {
    const url = new URL(address)
    return url.protocol === "https:" && (url.hostname === "x.com" || url.hostname === "twitter.com")
  } catch {
    return false
  }
}

/** Reads at most `limit` bytes of the page, so a huge answer is cut off rather than held whole. */
export async function readCapped(answer: Response, limit = MAX_PAGE_BYTES): Promise<string> {
  const reader = answer.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < limit) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
  }
  await reader.cancel().catch(() => undefined)
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, limit))
}
