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
 * `health` reads an account's karma, age and how its profile looks to a
 * stranger, from the Check now button or the ticker once a day.
 * `rules` reads the posted rules of the subreddits a search brought in, once
 * each. `comment_check` reads one sent comment again; it is not `check`,
 * which already means a person's look at a profile's browser.
 * `profile_check` is the stranger's half of a health reading, and
 * `warm_up` is a new account's daily visit to Reddit. `reply` answers a
 * reply under a sent comment, from the account that sent the comment.
 * `submit` sends a post of your own, and `delete_comment` and `edit_comment`
 * change a sent comment, each from the account that sent it. `help_read`
 * reads the newest posts in one account's everyday subreddits, and
 * `promo_threads` looks for a subreddit's self-promotion thread.
 *
 * `READER_JOB_KINDS` run in the signed-out reader browser, never in the
 * account's own: the account Reddit sees commenting never searches.
 */
export type JobKind =
  | "search"
  | "thread"
  | "comment"
  | "reply"
  | "open"
  | "close"
  | "check"
  | "site_check"
  | "backup"
  | "restore"
  | "health"
  | "rules"
  | "comment_check"
  | "profile_check"
  | "warm_up"
  | "submit"
  | "delete_comment"
  | "edit_comment"
  | "help_read"
  | "promo_threads"

/** The kinds that run in the reader browser, signed in to nobody. */
export const READER_JOB_KINDS: readonly JobKind[] = [
  "search",
  "thread",
  "rules",
  "comment_check",
  "profile_check",
  "help_read",
  "promo_threads",
]

/**
 * The kinds that write to Reddit from an account's own browser, each because
 * a person pressed a button. Every one is tried once and never handed back
 * after its browser stopped part-way, because a second go could post twice.
 */
export const WRITE_JOB_KINDS: readonly JobKind[] = [
  "comment",
  "reply",
  "submit",
  "delete_comment",
  "edit_comment",
]

/**
 * The account's profile, asked for once signed in and once signed out, as it
 * is stored. Only what was seen: each answer's status, whether it carried a
 * profile, and whether Reddit marked it suspended. The words are worked out
 * when it is shown (`profileCheckWords`), never stored.
 */
export type ProfileCheck = {
  /** The handle that was asked about, which may not be the one signed in now. */
  handle: string
  /** Status 0 means the request got no answer at all. */
  signedInStatus: number
  signedInFound: boolean
  signedOutStatus: number
  signedOutFound: boolean
  suspended: boolean
  /** When it was read, as an ISO date, since this is stored as JSON. */
  readAt: string
}

/**
 * What every Reddit job and the settings tab say when the account's browser
 * profile is gone. Here rather than beside the code that throws it, because
 * the settings tab's error lookup needs the same words at runtime.
 */
export const NO_PROFILE_MESSAGE =
  "This Reddit account has no browser profile or phone, so it cannot post. Pick where it runs with its settings button on the Reddit accounts dashboard."

/**
 * Why Post is off on the Projects dashboard before an account is clicked. A
 * comment always goes out from the account clicked on the left, so there is
 * never a default one to fall back to.
 */
export const PICK_AN_ACCOUNT = "Pick an account on the left."

/**
 * What a search, a reply read or a stranger's check says when no reader
 * browser is picked. They are refused rather than run in the account's own
 * browser, because the account Reddit sees commenting never searches.
 */
export const NO_READER_MESSAGE =
  "There is no reader browser, so this is refused rather than run in your account's own browser. Pick a reader in Settings → Behaviour."

/**
 * The visit around one comment, as the browser reported it. Seconds are whole
 * seconds. `reachedBy` is how the browser got to the post: through the
 * subreddit's own listing, or straight to its address when the listing did not
 * show it. `problems` are steps of the visit that failed, which never stop the
 * comment.
 */
export type VisitRecord = {
  beforeSeconds: number
  afterSeconds: number
  postsOpened: number
  reachedBy: "subreddit" | "address"
  scrolls: number
  problems: string[]
}

/** The behaviour settings, and the bounds the tab and the server both check. */
export const BEHAVIOUR_DEFAULTS = {
  wakeFromMinute: 480,
  wakeUntilMinute: 1380,
  warmUpDays: 3,
  youngDays: 90,
  youngPerHour: 2,
  youngPerDay: 6,
  warnPerHour: 4,
  searchEveryHours: 4,
} as const

export const BEHAVIOUR_RANGES = {
  wakeFromMinute: { min: 0, max: 1439 },
  wakeUntilMinute: { min: 0, max: 1439 },
  warmUpDays: { min: 0, max: 60 },
  youngDays: { min: 0, max: 730 },
  youngPerHour: { min: 1, max: 30 },
  youngPerDay: { min: 1, max: 200 },
  warnPerHour: { min: 1, max: 60 },
  searchEveryHours: { min: 0, max: 48 },
} as const

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

/**
 * A profile's identity as the app keeps it. The identity itself, about 400KB,
 * lives in the profile's own volume beside its cookies; this is its short id
 * and what a page read through it. See `docker/browser/launch.py`.
 */
export type ProfileIdentity = {
  /** sha256 of the identity file. A different id is a different machine. */
  id?: string
  madeAt?: string
  /** What a page read the last time anyone looked. */
  seen?: IdentityReading
  seenAt?: string
  /** Set by "Make a new identity"; the next launch makes one and clears it. */
  renew?: boolean
}

/** What a page reads about the machine, as `routines/browser.py` returns it. */
export type IdentityReading = {
  userAgent: string
  platform: string
  oscpu: string
  hardwareConcurrency: number
  screen: { width: number; height: number; colorDepth: number }
  devicePixelRatio: number
  gpuVendor: string
  gpuRenderer: string
  fonts: string[]
  timezone: string
  languages: string[]
}

/** One line of "Check what a site sees". */
export type SiteCheckLine = {
  label: string
  verdict: "matches" | "differs" | "noted"
  text: string
}

/** The saved result of "Check what a site sees". */
export type SiteCheckResult = {
  checkedAt: string
  /** Null when the profile has no proxy. */
  proxy: { name: string; address: string; country: string; timezone: string } | null
  lines: SiteCheckLine[]
}

/** What the history in a profile's window records besides its runs. */
export type ProfileEventKind =
  | "proxy_changed"
  | "browser_dead"
  | "proxy_refused"
  | "backed_up"
  | "restored"
export type SearchStatus = "running" | "done" | "failed"
export type DraftStatus = "draft" | "sent" | "discarded"

/**
 * The three ways the words in the comment box can be rewritten, in the order
 * their buttons sit. A rewrite is stored as a draft so the record of what the
 * AI wrote stays honest.
 */
export const DRAFT_REWRITES = ["shorter", "plainer", "no_product"] as const
export type DraftRewrite = (typeof DRAFT_REWRITES)[number]
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

/** One rule a subreddit has posted, as its moderators wrote it. */
export type SubredditRule = { title: string; description: string }

/**
 * What reading a subreddit's rules found: its rules, an answer with none
 * posted, or no answer at all.
 */
export type SubredditRulesStatus = "read" | "none" | "failed"

/**
 * One reply directly under a sent comment, as a check read it. `url` is
 * Reddit's own address for it, and `id` its Reddit id without the "t1_".
 * `postedAt` is an ISO date, since this is stored as JSON.
 */
export type IncomingReply = {
  id: string
  author: string
  text: string
  score: number
  url: string
  postedAt: string | null
}

/** The post and its top replies, as the browser last read them. */
export type FindThread = {
  body: string
  replies: Array<{ author: string; text: string; score: number }>
}

/**
 * What the page a link post points to says: its title and opening paragraph,
 * both capped, because the point is context for a comment and not the
 * article. `url` is where the reading ended up after any redirects.
 */
export type LinkPage = {
  url: string
  title: string
  text: string
}

/**
 * The longest comment the app will send.
 *
 * A Reddit comment past this is a blog post nobody reads, and it is the same
 * number three places have to agree on: the prompt's instructions, the
 * endpoint's check, and the character count under the box.
 */
export const MAX_COMMENT_CHARS = 900

/**
 * A post of your own: Reddit's own limit on a title, and this app's on the
 * words, long enough for a real post and short enough to read on a phone. The
 * New post window and the server check the same two numbers.
 */
export const MAX_POST_TITLE_CHARS = 300
export const MAX_POST_BODY_CHARS = 10_000

/** How many drafts one press asks for. */
export const DRAFTS_PER_PRESS = 2

/**
 * Days a found post can go unseen by any search before the tidy-up deletes
 * it if skipped, or clears its stored replies if still open. 0 switches the
 * tidy-up off. Here because the settings card checks the same bounds.
 */
export const TIDY_DEFAULT_DAYS = 30

/**
 * One Check press on the Comments screen reads at most this many comments,
 * so a select-all across pages cannot fill the queue.
 */
export const MAX_CHECKS_PER_PRESS = 50
export const TIDY_DAYS_RANGE = { min: 0, max: 365 } as const
