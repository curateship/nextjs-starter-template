import { appServerOptions } from "@/app/server-options"
import type { AutomationExecutor } from "@/server/automations/executors"

/**
 * The same idea as `src/lib/app-options.ts`, for the answers that can only run
 * on the server.
 *
 * Most of what an app changes about the shell is drawing and wording, and that
 * belongs in the other file, which the browser is allowed to see. Some of it
 * is work — reaching the database, sending something, calling somebody's API —
 * and that must never cross into the browser bundle. So it gets its own pair of
 * files on this side of the line, read only by `src/lib/api/*`,
 * `src/routes/api/**` and `src/server/*`.
 *
 * Everything the other file says still holds: the shell owns the list, the app
 * writes its answers in `src/app/server-options.ts`, neither side is ever in
 * the other's file, and anything not offered here is a compile error rather
 * than a quiet fork.
 */
export type AppServerOptions = {
  automations?: AutomationServerOptions
  background?: BackgroundServerOptions
  security?: SecurityServerOptions
  auth?: AuthServerOptions
  sitemap?: SitemapServerOptions
}

export type SitemapEntry = {
  path: string
  updatedAt?: Date
}

type SitemapServerOptions = {
  /**
   * Public addresses this app adds to a site's sitemap.
   *
   * The shell contributes its declared and admin-written pages. An app whose
   * public content lives in its own tables contributes those rows here. The
   * workspace id comes from the request's Host header, never from the browser,
   * and the app must return only public rows belonging to that workspace.
   */
  extraEntries?: (workspaceId: string) => Promise<readonly SitemapEntry[]>
}

type SecurityServerOptions = {
  /**
   * Extra addresses this app answers form posts from.
   *
   * Every write checks that the browser sending it was on a page of this app,
   * and the list of what counts is `CUSTOM_SHELL_APP_ORIGINS` — one flat set of
   * exact addresses, decided before the app starts. That is right for an app
   * with one address and impossible for an app whose addresses live in a table:
   * one deployment answering on many domains cannot name them in an
   * environment variable that a deploy would have to change.
   *
   * So the check asks here when its own list misses. Answer `true` only for an
   * address this app really does serve — saying yes to a stranger's domain
   * hands them the right to make writes from their own pages using a signed-in
   * visitor's session, which is the whole attack the check exists to stop.
   *
   * **This has to be synchronous.** The check that calls it is not awaited
   * anywhere, so a promise would be truthy on arrival and every origin would
   * pass. Look the answer up in memory — a cache the app fills when it saves,
   * never a database read from here.
   */
  isTrustedOrigin?: (origin: string) => boolean
}

/** Somebody made an account, or somebody signed in. */
export type AppAuthEvent = {
  kind: "register" | "signin"
  userId: string
}

type AuthServerOptions = {
  /**
   * Called when an account is made and every time one is signed in to.
   *
   * The shell owns signing in and is not open to being changed; this is the
   * app being *told*, after the fact, so it can do its own work — greet
   * somebody, give them starter content, record which of the app's own areas
   * they arrived through. The request is still in hand, so anything about it
   * that matters has to be read now.
   *
   * Both moments fire, because they are genuinely different and neither
   * implies the other: making an account starts no session (a verification
   * email has to be answered first), and most sign-ins are by people whose
   * account was made long ago.
   *
   * It runs on **every** sign-in, so make it safe to run again — the second
   * time and the hundredth should change nothing the first did not.
   *
   * A failure is logged and swallowed, never passed on. By the time this runs
   * the account exists or the session does, and neither can be taken back: a
   * throw here would show an error to somebody whose sign-in actually worked,
   * or fail a registration that already made the account and cannot be retried.
   * The shell holds the same line for its own security emails — see
   * `src/server/auth/security-alerts.ts`.
   */
  onAuthEvent?: (event: AppAuthEvent) => Promise<void>
}

/**
 * A background job the app rides on the shell's fifteen-second loop.
 *
 * `tick` is called on every pass and must claim its own work — two overlapping
 * passes have to be harmless, exactly as they are for the shell's own jobs. A
 * thrown tick is logged under `name` and never stops the loop or the other
 * workers.
 */
export type AppBackgroundWorker = {
  name: string
  tick: () => Promise<void>
}

type BackgroundServerOptions = {
  /**
   * The app's own background workers, run by the shell's one ticker.
   *
   * The shell has no boot hook — its loop starts on the first request and
   * fires every fifteen seconds — so an app that needs ongoing background
   * work (building previews, watching a feed) lists it here instead of
   * starting timers of its own. One loop means one place to look when
   * something ticks.
   */
  workers?: readonly AppBackgroundWorker[]
}

type AutomationServerOptions = {
  /**
   * What this app's own automation steps actually do, keyed by the same `kind`
   * the descriptor in `src/app/options.ts` uses.
   *
   * The two halves are deliberately apart. The descriptor draws the step and
   * says what a valid setting looks like, and the canvas needs that in the
   * browser; the executor reaches the database and must not go there.
   *
   * A `kind` the shell already runs is refused out loud. An app adds steps of
   * its own; it never quietly changes what one of the shell's does.
   */
  executors?: Record<string, AutomationExecutor>
}

/*
 * Readers, under the same two rules as the ones in `src/lib/app-options.ts`,
 * and for the same reason: an app's answers import app code, which imports
 * shell code, which can import this file.
 *
 *   1. Every reader is a `function`, never a `const`.
 *   2. Shell code calls them inside a request or a handler, never at the top
 *      level of a module.
 *
 * A default is written once, here, and call sites read through the reader
 * rather than reaching into `appServerOptions` with their own `??`.
 */

/**
 * What this app's own automation steps do, or nothing.
 *
 * The argument is only ever passed by the tests, which check that an unset
 * option still means today's behaviour — written this way so that check keeps
 * working inside an app that has set the option.
 */
export function appAutomationExecutors(
  options: AppServerOptions = appServerOptions
): Record<string, AutomationExecutor> {
  return options.automations?.executors ?? {}
}

/**
 * The app's own background workers, or none.
 *
 * The argument is only ever passed by the tests, which check that an unset
 * option still means today's behaviour — written this way so that check keeps
 * working inside an app that has set the option.
 */
export function appBackgroundWorkers(
  options: AppServerOptions = appServerOptions
): readonly AppBackgroundWorker[] {
  return options.background?.workers ?? []
}

/**
 * Whether the app vouches for an address the origin check did not recognise.
 *
 * No by default, which is the shell's own answer today: only the configured
 * addresses pass. Deliberately not awaited — see the option's own note.
 *
 * The argument is only ever passed by the tests, which check that an unset
 * option still means today's behaviour — written this way so that check keeps
 * working inside an app that has set the option.
 */
export function appTrustsOrigin(
  origin: string,
  options: AppServerOptions = appServerOptions
): boolean {
  return options.security?.isTrustedOrigin?.(origin) ?? false
}

/** The app's public sitemap rows, or none when it has not added any. */
export async function appSitemapEntries(
  workspaceId: string,
  options: AppServerOptions = appServerOptions
): Promise<readonly SitemapEntry[]> {
  return (await options.sitemap?.extraEntries?.(workspaceId)) ?? []
}

/**
 * Tells the app somebody registered or signed in, and never lets it get in the
 * way of either.
 *
 * The swallow is here rather than at the two call sites so the rule is written
 * once: by the time this runs the account or the session already exists, and a
 * throw would break something that genuinely worked. Logged, because a hook
 * that quietly stops running is a bug nobody would find.
 *
 * The argument is only ever passed by the tests, which check that an unset
 * option still means today's behaviour — written this way so that check keeps
 * working inside an app that has set the option.
 */
export async function notifyAppAuthEvent(
  event: AppAuthEvent,
  options: AppServerOptions = appServerOptions
): Promise<void> {
  const handler = options.auth?.onAuthEvent
  if (!handler) return

  try {
    await handler(event)
  } catch (error) {
    console.error(`app auth hook failed for ${event.kind}`, error)
  }
}
