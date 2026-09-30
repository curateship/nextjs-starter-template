import {
  readXProfilePage,
  type ParsedSocialCreator,
  type ParsedSocialPost,
} from "@/lib/trade/social/x-profile"
import { isRationed, startRationing } from "@/server/protocols/rationing"

/**
 * The slot a reader of somebody's posts drops into.
 *
 * One reader today, reading the public profile page. A paid service drops in
 * behind the same door later without a single screen changing. This is the
 * same move `src/server/protocols/registry.ts` makes for exchanges: nothing
 * above the registry knows which reader answered.
 *
 * **A reader that says it is being rationed is believed at once.** It goes on
 * the hold list, every call for the next twenty seconds answers "busy"
 * instantly, and the screen keeps what it already has. Waiting and retrying
 * inside the request is the mistake that froze the trading screens, and
 * `src/server/protocols/rationing.ts` tells that story in full.
 */

/** Every reader there is. One today. */
export type SocialReaderId = "x-profile"

export type SocialReadRequest = {
  handle: string
}

export type SocialReadResult =
  | {
      ok: true
      posts: ParsedSocialPost[]
      /** The account's own details, when the reader knew them. */
      creator: ParsedSocialCreator
    }
  /**
   * The read did not happen: rationed, refused, timed out, or the account is
   * gone. One shape, because the caller does the same thing with all of them
   * — keeps what is already stored and says nothing.
   */
  | { ok: false }

export type SocialReader = {
  id: SocialReaderId
  read: (request: SocialReadRequest) => Promise<SocialReadResult>
}

/** How the hold list is keyed. Readers are rationed per reader, not per handle. */
const RATION_SCOPE = "social"

/**
 * The most of a page to read.
 *
 * A profile is about 250KB. This is an order of magnitude above that, so a
 * page that grows is still read while a redirect to something enormous is
 * cut off rather than pulled into memory whole.
 */
const MAX_PAGE_BYTES = 4_000_000

/**
 * How long to wait for X before giving up. Short on purpose: this runs while
 * somebody is looking at a screen that already has its answer, so a slow read
 * must fail quietly rather than hold the page.
 */
const FETCH_TIMEOUT_MS = 8_000

/** X serves a different page to something that does not look like a browser. */
const BROWSER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

/**
 * The public profile page.
 *
 * The address is built from a handle that has already been checked against
 * X's own rule (1 to 15 letters, digits or underscores) and the host is fixed,
 * so nothing a member types can send this request anywhere else.
 *
 * **A read that finds nothing is not a failure.** X changes its markup and
 * this stops finding things; when that happens the reader answers with what it
 * did find, which may be nothing, and the caller leaves what is already stored
 * alone. Being told to slow down is a failure, and it puts X on the hold list.
 */
const xProfileReader: SocialReader = {
  id: "x-profile",
  read: async ({ handle }) => {
    let html: string
    try {
      const answer = await fetch(
        `https://x.com/${encodeURIComponent(handle)}`,
        {
          headers: {
            "user-agent": BROWSER_AGENT,
            "accept-language": "en-US,en;q=0.9",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }
      )
      if (answer.status === 429 || answer.status === 403) {
        rationSocialReader("x-profile")
        return { ok: false }
      }
      if (!answer.ok) return { ok: false }
      // A redirect off X is not X answering. Following one and parsing what
      // came back would file somebody else's page under this creator.
      if (!isXAddress(answer.url)) return { ok: false }
      html = await readCapped(answer)
    } catch {
      return { ok: false }
    }

    const read = readXProfilePage(html, handle)
    if (!read.found) return { ok: false }

    return {
      ok: true,
      posts: read.posts,
      creator: {
        followers: read.followers,
        displayName: read.displayName,
        picture: read.picture,
        links: read.links,
      },
    }
  },
}

/** Where the answer came from, after any redirects. */
function isXAddress(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase()
    return host === "x.com" || host === "www.x.com" || host === "twitter.com"
  } catch {
    return false
  }
}

/** The body, up to the cap. Anything past it is not read at all. */
async function readCapped(answer: Response): Promise<string> {
  const body = answer.body
  if (!body) return answer.text()

  const decoder = new TextDecoder()
  const reader = body.getReader()
  let text = ""
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_PAGE_BYTES) {
        await reader.cancel()
        break
      }
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
  return text
}

const READERS: Record<SocialReaderId, SocialReader> = {
  "x-profile": xProfileReader,
}

/** What a sync uses. */
export const PROFILE_SOCIAL_READER: SocialReaderId = "x-profile"

function socialReader(id: SocialReaderId): SocialReader {
  return READERS[id]
}

/**
 * Ask a reader, honouring the hold list. Callers never see which reader
 * answered, only what it found or nothing at all.
 */
export async function readSocialPosts(
  id: SocialReaderId,
  request: SocialReadRequest
): Promise<SocialReadResult> {
  if (isRationed(id, RATION_SCOPE, "public")) return { ok: false }
  return socialReader(id).read(request)
}

/** A reader told us to slow down. Leave it alone for a while. */
export function rationSocialReader(id: SocialReaderId): void {
  startRationing(id, RATION_SCOPE, "public")
}
