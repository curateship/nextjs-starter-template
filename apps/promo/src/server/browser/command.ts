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

const stateShape = z.object({
  /** Null means signed out. */
  handle: z.string().nullable(),
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
  blocked: z.boolean(),
  reason: z.string().default(""),
})

const commentShape = z.object({ commentUrl: z.string() })

const healthShape = z.object({ ok: z.boolean() })

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
 * Writes one Reddit comment. Only ever called after a person pressed Post,
 * which is enforced by the endpoint that calls it rather than here.
 */
export function redditComment(
  target: CommandTarget,
  args: { permalink: string; text: string }
) {
  return call(target, "reddit/comment", { ...args }, commentShape)
}
