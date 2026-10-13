import { z } from "zod"

/**
 * The typed way to talk to a running browser container.
 *
 * The container exposes a handful of named routines over HTTP on a port bound
 * to 127.0.0.1, each one belonging to a network: `reddit/search`,
 * `reddit/thread` and so on. This file is the only caller, and it parses every
 * answer before handing it on, so a redesign that changes the shape of what
 * comes back fails here with a sentence rather than three layers later with
 * `undefined is not an object`.
 *
 * The network is part of the address rather than assumed, so Instagram's own
 * routines slot in beside Reddit's with nothing here to change but the calls
 * at the bottom.
 */

/** Long enough for a slow page behind a residential proxy, short enough to give up. */
const DEFAULT_TIMEOUT_MS = 60_000

/** Starting a container and waiting for Reddit's first paint takes a while. */
const HEALTH_TIMEOUT_MS = 5_000

/**
 * A comment is a whole visit: a few minutes in the feed, the post read, the
 * comment typed at a person's pace (about two minutes for 900 characters),
 * then a little more feed. A warm-up is the same visit without the comment.
 * The launcher gives either 900 seconds and the visit plans to finish well
 * inside that; the app waits a little longer so it hears the launcher's own
 * answer rather than giving up first. Whatever happens, a comment job is
 * never tried twice.
 */
const VISIT_TIMEOUT_MS = 930_000

/**
 * A rules read or a comment check may have to load a Reddit page first, which
 * the browser gives 45 seconds, and then make its requests. On 11 Oct 2026 a
 * comment check in a browser just opened overran the default 60 seconds three
 * times in a row while a warm one answered in a few. The launcher allows any
 * routine 90 seconds, so waiting longer than that hears its own answer.
 */
const PAGE_THEN_READ_TIMEOUT_MS = 120_000

export class BrowserCommandError extends Error {
  readonly routine: string
  readonly status: number

  constructor(routine: string, status: number, message: string) {
    super(message)
    this.name = "BrowserCommandError"
    this.routine = routine
    this.status = status
  }
}

export type CommandTarget = {
  /** The published port on 127.0.0.1. */
  port: number
  /** The shared secret the container was started with. */
  token: string
}

async function call<T>(
  target: CommandTarget,
  routine: string,
  args: Record<string, unknown> | null,
  shape: z.ZodType<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(`http://127.0.0.1:${target.port}/${routine}`, {
      method: args === null ? "GET" : "POST",
      headers: {
        "x-promo-token": target.token,
        ...(args === null ? {} : { "content-type": "application/json" }),
      },
      body: args === null ? undefined : JSON.stringify(args),
      signal: controller.signal,
    })
  } catch (error) {
    // An abort and a refused connection are different problems and a person
    // can act on each: one means the page is stuck, the other means the
    // container is not there.
    const stuck = controller.signal.aborted
    throw new BrowserCommandError(
      routine,
      0,
      stuck
        ? `The browser did not answer ${routine} within ${Math.round(timeoutMs / 1000)} seconds.`
        : `The browser is not listening on port ${target.port}. ${
            error instanceof Error ? error.message : String(error)
          }`
    )
  } finally {
    clearTimeout(timer)
  }

  const text = await response.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    throw new BrowserCommandError(
      routine,
      response.status,
      `The browser answered ${routine} with something that is not JSON.`
    )
  }

  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : `status ${response.status}`
    throw new BrowserCommandError(routine, response.status, message)
  }

  const checked = shape.safeParse(parsed)
  if (!checked.success) {
    throw new BrowserCommandError(
      routine,
      response.status,
      `The browser answered ${routine} in a shape this app does not know: ${checked.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
        .join("; ")}`
    )
  }
  return checked.data
}

/** A post as the browser read it. Seconds, not a Date: JSON has no dates. */
const postShape = z.object({
  redditId: z.string(),
  permalink: z.string(),
  subreddit: z.string(),
  title: z.string(),
  body: z.string(),
  /**
   * Where a link post points, as Reddit gave it, or "". Defaults to "" so a
   * browser image built before link posts were read still answers.
   */
  linkUrl: z.string().default(""),
  author: z.string(),
  score: z.number(),
  commentCount: z.number(),
  postedAtSeconds: z.number().nullable(),
  /** Where Reddit put it in its own relevance order, 0 being first. */
  position: z.number().default(0),
})

export type BrowserPost = z.infer<typeof postShape>

const searchShape = z.object({
  /** "json" when Reddit's own data answered, "page" when it was scraped. */
  source: z.enum(["json", "page"]),
  posts: z.array(postShape),
  url: z.string(),
})

const replyShape = z.object({
  author: z.string(),
  text: z.string(),
  score: z.number(),
})

const threadShape = z.object({
  source: z.enum(["json", "page"]),
  post: postShape.nullable(),
  replies: z.array(replyShape),
})

/**
 * The account's karma and when it was made, read from the same "who am I"
 * answer as the handle. Null when signed out, and from an image built before
 * these were read, so an old browser answers rather than failing the shape.
 */
const accountFigures = {
  karma: z.number().nullable().default(null),
  /** Seconds since 1970, as Reddit gives it. */
  createdSeconds: z.number().nullable().default(null),
}

const stateShape = z.object({
  /** Null means signed out. */
  handle: z.string().nullable(),
  ...accountFigures,
  /** True when a challenge or captcha needs a person. */
  blocked: z.boolean(),
  reason: z.string().default(""),
  url: z.string().default(""),
})

export type BrowserState = z.infer<typeof stateShape>

const quickStateShape = z.object({
  /**
   * False when the page is not on the network's site, so a cookie read from
   * it would say "signed out" about an account that is signed in. Nothing is
   * written down from an answer that was not checked.
   */
  checked: z.boolean(),
  handle: z.string().nullable(),
  ...accountFigures,
  blocked: z.boolean(),
  reason: z.string().default(""),
})

/** One read of a profile's own data. Status 0 means the request never got an answer. */
const profileReadShape = z.object({
  status: z.number(),
  found: z.boolean(),
  suspended: z.boolean(),
})

/**
 * The account's half of a health reading. The profile as a stranger sees it
 * is the reader's half (`redditStrangerProfile`), never read in here.
 */
const accountHealthShape = z.object({
  handle: z.string().nullable(),
  ...accountFigures,
  blocked: z.boolean(),
  reason: z.string().default(""),
  /** Null when signed out, since there is no profile to ask about. */
  profile: z.object({ signedIn: profileReadShape }).nullable(),
})

export type AccountHealthReading = z.infer<typeof accountHealthShape>

/** The visit around a comment or a warm-up, as the browser reports it. */
const visitShape = z.object({
  beforeSeconds: z.number(),
  afterSeconds: z.number(),
  postsOpened: z.number(),
  reachedBy: z.enum(["subreddit", "address"]),
  scrolls: z.number(),
  problems: z.array(z.string()),
})

/**
 * The visit is optional on purpose. A comment answer that failed this shape
 * would be recorded as failed after Reddit took it, so an image built before
 * visits still answers with the address alone.
 */
const commentShape = z.object({
  commentUrl: z.string(),
  visit: visitShape.nullable().default(null),
})

/** What a day's warm-up did: its time in the feed, and the subreddits it joined. */
const warmUpShape = z.object({
  feedSeconds: z.number(),
  postsOpened: z.number(),
  scrolls: z.number(),
  /** Lower case, as asked. "Already" means Reddit showed it joined before the press. */
  joined: z.array(z.string()),
  alreadyJoined: z.array(z.string()),
  problems: z.array(z.string()),
})

export type BrowserWarmUp = z.infer<typeof warmUpShape>

/**
 * A subreddit's posted rules. `answered` false means Reddit would not say,
 * which is not the same answer as a subreddit with no rules.
 */
const rulesShape = z.object({
  answered: z.boolean(),
  /** Reddit's own status for the JSON request; 0 means no answer at all. */
  status: z.number(),
  source: z.enum(["json", "page"]),
  rules: z.array(z.object({ title: z.string(), description: z.string() })),
})

export type BrowserRules = z.infer<typeof rulesShape>

/**
 * One sent comment, read again. `seenAs` says whose view decided it: a
 * stranger's, which shows a moderator's removal, or the account's own when
 * Reddit refused the stranger, which may not.
 */
const commentCheckShape = z.object({
  seenAs: z.enum(["stranger", "you"]),
  visible: z.boolean(),
  /** Reddit's own words in place of the comment, "[removed]" or "[deleted]". */
  removedText: z.string().default(""),
  /** Null when Reddit hides the score for now. */
  upvotes: z.number().nullable(),
  replies: z.number(),
  /**
   * The replies directly under the comment, with their words. Empty from an
   * image built before replies were read, which the check then stores as
   * "not read" rather than "none".
   */
  incoming: z
    .array(
      z.object({
        id: z.string(),
        author: z.string(),
        text: z.string(),
        score: z.number(),
        url: z.string(),
        postedAtSeconds: z.number().nullable(),
      })
    )
    .optional(),
})

export type BrowserCommentCheck = z.infer<typeof commentCheckShape>

const healthShape = z.object({ ok: z.boolean() })

const identityIdShape = z.object({
  /** sha256 of the identity file in the profile's volume. */
  id: z.string(),
  /** True when this launch made it: the profile's first, or a renewal. */
  made: z.boolean(),
})

const identityReadingShape = z.object({
  userAgent: z.string(),
  platform: z.string(),
  oscpu: z.string().default(""),
  hardwareConcurrency: z.number(),
  screen: z.object({ width: z.number(), height: z.number(), colorDepth: z.number() }),
  devicePixelRatio: z.number(),
  gpuVendor: z.string(),
  gpuRenderer: z.string(),
  fonts: z.array(z.string()),
  timezone: z.string(),
  languages: z.array(z.string()),
})

const siteCheckShape = z.object({
  address: z.string(),
  country: z.string(),
  addressTimezone: z.string(),
  webrtc: z.object({
    available: z.boolean(),
    addresses: z.array(z.string()),
    error: z.string().optional(),
  }),
  identity: identityReadingShape,
})

export type BrowserSiteCheck = z.infer<typeof siteCheckShape>

/**
 * Is the container's command server up? Says nothing about any network.
 *
 * The one routine with no network in front of it, because "the container is
 * up" and "the browser can reach Reddit" are different questions and a person
 * needs to be told which one failed.
 */
export function browserHealth(target: CommandTarget) {
  return call(target, "health", null, healthShape, HEALTH_TIMEOUT_MS)
}

/** Which identity the browser launched with, and whether it made it just now. */
export function browserIdentityId(target: CommandTarget) {
  return call(target, "identity", null, identityIdShape, HEALTH_TIMEOUT_MS)
}

/** The machine a site believes it is talking to, read in a tab of its own. */
export function browserIdentity(target: CommandTarget) {
  return call(target, "browser/identity", {}, identityReadingShape)
}

/**
 * What a website sees through this browser: its outside address, country and
 * clock, every address offered for a video call, and the identity.
 */
export function browserSiteCheck(target: CommandTarget) {
  return call(target, "browser/site_check", {}, siteCheckShape)
}

/**
 * Who the browser is signed in to Reddit as, and whether anything is in the
 * way. Sends the page to Reddit's front page to find out, so it runs only for
 * a `check` job a person asked for. A sign-in form being typed into would be
 * replaced.
 */
export function redditState(target: CommandTarget) {
  return call(target, "reddit/state", null, stateShape)
}

/**
 * The same question without moving the page: Reddit's own "who am I" read
 * with the page's cookies, and the challenge signs on whatever is on screen.
 * The browser program asks this after every Reddit job.
 */
export function redditQuickState(target: CommandTarget) {
  return call(target, "reddit/quick_state", {}, quickStateShape)
}

/**
 * Karma, account age, and the profile read as the account, in a tab of its
 * own so the page a person may be using never moves. A read, so the ticker
 * may ask for it on a schedule.
 */
export function redditHealth(target: CommandTarget) {
  return call(target, "reddit/health", {}, accountHealthShape)
}

/**
 * A profile as a stranger sees it, asked from the reader browser, signed in
 * to nobody, in a tab of its own.
 */
export function redditStrangerProfile(target: CommandTarget, args: { handle: string }) {
  return call(target, "reddit/stranger_profile", { ...args }, profileReadShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/**
 * A keyword's search, or a watch's new posts: an empty query with one
 * subreddit reads that subreddit's newest posts instead.
 */
export function redditSearch(
  target: CommandTarget,
  args: { query: string; subreddit?: string; sort: string; window: string }
) {
  return call(target, "reddit/search", { ...args }, searchShape)
}

export function redditThread(
  target: CommandTarget,
  args: { permalink: string; replyLimit?: number }
) {
  return call(target, "reddit/thread", { ...args }, threadShape)
}

/**
 * Writes one Reddit comment, inside a visit: feed before, the post reached
 * through its subreddit where it can be, feed after. Only ever called after a
 * person pressed Post, which is enforced by the endpoint that calls it rather
 * than here.
 */
export function redditComment(
  target: CommandTarget,
  args: { permalink: string; text: string; subreddit: string }
) {
  return call(target, "reddit/comment", { ...args }, commentShape, VISIT_TIMEOUT_MS)
}

/** Where a reply landed, and the visit around it. */
const replySentShape = z.object({
  replyUrl: z.string(),
  visit: visitShape.nullable().default(null),
})

/**
 * Answers one reply under a comment the account sent, in that reply's own
 * box, inside the same visit a comment gets. Only ever called after a person
 * pressed Reply, which the endpoint that queues it enforces.
 */
export function redditReply(target: CommandTarget, args: { replyUrl: string; text: string }) {
  return call(target, "reddit/reply", { ...args }, replySentShape, VISIT_TIMEOUT_MS)
}

/**
 * A warming account's daily visit: the feed, a few posts, and joining the
 * subreddits named. Nothing is written and nothing is voted on.
 */
export function redditWarmUp(target: CommandTarget, args: { subreddits: string[] }) {
  return call(target, "reddit/warm_up", { ...args }, warmUpShape, VISIT_TIMEOUT_MS)
}

/**
 * The rules a subreddit has posted. Goes to the subreddit's rules page, so it
 * runs as a job of its own in the profile's lane, never during a comment.
 */
export function redditRules(target: CommandTarget, args: { subreddit: string }) {
  return call(target, "reddit/rules", { ...args }, rulesShape, PAGE_THEN_READ_TIMEOUT_MS)
}

/** A sent comment's upvotes, replies, and whether a stranger still sees it. */
export function redditCommentCheck(target: CommandTarget, args: { commentUrl: string }) {
  return call(target, "reddit/comment_check", { ...args }, commentCheckShape, PAGE_THEN_READ_TIMEOUT_MS)
}
