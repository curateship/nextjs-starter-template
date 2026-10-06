/**
 * The social choices and shapes both halves of the app need, whatever the
 * network.
 *
 * **Why these are here and not in `src/server/social/schema.ts`.** A runtime
 * value imported out of a `@/server/*` module drags that module's whole import
 * graph into the browser's bundle: the database driver, the AI key store, and
 * eventually the cookie helpers, which the build then refuses outright with
 * "Import denied in client environment". It cost one failed build to find out.
 * The shell learned the same lesson with `AI_USAGE_RANGES`, and the note on it
 * in `src/lib/ai/ai-models.ts` says so.
 *
 * So anything a panel needs at runtime lives here, and the schema imports it
 * from this file rather than the other way round. Types alone are erased at
 * compile time and are safe to import from anywhere.
 *
 * What belongs here is what every network will share: an account, a proxy, a
 * found post, a draft, a job. What belongs to one network — Reddit's own sort
 * orders, for instance — goes in `reddit/options.ts` beside it.
 */

/** Where a found post has got to. Only a person moves it, except "commented". */
export const FIND_STATUSES = [
  "new",
  "shortlisted",
  "skipped",
  "commented",
] as const
export type FindStatus = (typeof FIND_STATUSES)[number]

/**
 * The kinds of work the browser process does.
 *
 * `open`, `close` and `check` exist because the browser program is the only
 * thing that ever starts, stops or drives a browser. A dashboard that wants a
 * browser open writes an `open` job and reads the session row, rather than
 * starting one itself and leaving the browser program without the key to it.
 */
export type JobKind = "search" | "thread" | "comment" | "open" | "close" | "check"

/**
 * What every Reddit job and the settings tab say when the account's browser
 * profile is gone. Here rather than beside the code that throws it, because
 * the settings tab's error lookup needs the same words at runtime.
 */
export const NO_PROFILE_MESSAGE =
  "This Reddit account has no browser profile. Pick one in Settings."

export const PROXY_PROTOCOLS = ["http", "https", "socks5"] as const
export type ProxyProtocol = (typeof PROXY_PROTOCOLS)[number]

/** What kind of line a proxy is. Residential is the default. */
export const PROXY_KINDS = ["residential", "mobile", "datacenter"] as const
export type ProxyKind = (typeof PROXY_KINDS)[number]

export type SessionStatus = "starting" | "running" | "stopped" | "error"

/**
 * How a browser's run ended: closed by a person, shut for being idle, found
 * dead, failed to start, or replaced after the browser program restarted.
 */
export type SessionEndedBy = "closed" | "idle" | "dead" | "failed" | "replaced"

/** What the history in a profile's window records besides its runs. */
export type ProfileEventKind = "proxy_changed" | "browser_dead" | "proxy_refused"
export type SearchStatus = "running" | "done" | "failed"
export type DraftStatus = "draft" | "sent" | "discarded"
export type JobStatus = "queued" | "running" | "done" | "failed"

/** What a proxy test found, or why it failed. */
export type ProxyTestResult = {
  ok: boolean
  ip?: string
  country?: string
  city?: string
  isp?: string
  /** The IANA zone of the exit IP, which the browser's clock copies. */
  timezone?: string
  latencyMs?: number
  error?: string
}

/** The post and its top replies, as the browser last read them. */
export type FindThread = {
  body: string
  replies: Array<{ author: string; text: string; score: number }>
}

/**
 * The longest comment the app will send.
 *
 * A Reddit comment past this is a blog post nobody reads, and it is the same
 * number three places have to agree on: the prompt's instructions, the
 * endpoint's check, and the character count under the box.
 */
export const MAX_COMMENT_CHARS = 900

/** How many drafts one press asks for. */
export const DRAFTS_PER_PRESS = 2

