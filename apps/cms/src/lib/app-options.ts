import type { ComponentType } from "react"

import { appOptions } from "@/app/options"
import type { AutomationNodeDescriptor } from "@/lib/automations/node-descriptor"

/**
 * Everything an app built from this shell is allowed to change about it.
 *
 * Apps are made by copying this whole folder, and shell improvements reach them
 * later by merging. A merge only has something to argue about when both sides
 * edited the same file — so an app must never edit a shell file, not even by a
 * line. This type is the way out: the shell owns the list of what can change,
 * and the app writes its answers in `src/app/options.ts`, a file the shell
 * creates once and never touches again. Neither side is ever in the other's
 * file, so the merge has nothing to reconcile.
 *
 * Which makes this type the complete list of ways an app can deviate. Nothing
 * reaches into the shell from outside, and anything not offered here is a
 * compile error rather than a quiet fork. Adding an option is a change made
 * *here*, in custom-shell, with its default equal to today's behaviour; only
 * then can an app use it.
 *
 * Not everything belongs here. If an admin could plausibly change it on a
 * Settings screen it is `ShellConfig` instead, and if it differs between
 * staging and production of one app it is an environment variable. An app
 * option is decided once by whoever builds the app, is the same on every
 * install of it, and changing it means a deploy.
 */
export type AppOptions = {
  landing?: LandingOptions
  pages?: PagesOptions
  automations?: AutomationOptions
  workspaces?: WorkspaceOptions
}

/** Who, if anyone, may have a workspace of their own on this app. */
export type WhoMayHaveWorkspaces = "off" | "admins" | "everyone"

type WorkspaceOptions = {
  /**
   * Who may have a workspace at all.
   *
   * - **`"off"`** — nobody. No switcher is drawn and a second workspace is
   *   refused. For an app that is one site and always will be, like Trade and
   *   Video. Hiding the control while leaving the door open is worse than
   *   either, which is why this closes the door too.
   * - **`"admins"`** — the default. Admins have and switch sites; members have
   *   none and reach none. What this shell and cms want.
   * - **`"everyone"`** — an app that genuinely gives each member a workspace of
   *   their own says so deliberately.
   *
   * **This is the one option whose default is not today's behaviour, and that
   * is a decision rather than an oversight.** Today every signed-in person was
   * given a workspace on sign-in and every workspace endpoint was open to any
   * member, so a member could make and delete workspaces on any app built on
   * this shell. Nobody noticed because members are never shown the switcher.
   * Defaulting to `"everyone"` would keep that door open to satisfy a
   * convention about defaults, and no app can tell the difference because no
   * app ever showed members the control.
   */
  whoMayHave?: WhoMayHaveWorkspaces
}

type PagesOptions = {
  /**
   * Lets the app answer an address before the shell's own pages do.
   *
   * `src/routes/$.tsx` is where every address without a route of its own ends
   * up, and today that means one thing: a page an admin wrote. An app whose
   * pages live in a table of its own — a docs tree, a knowledge base, one site
   * out of many — has nowhere to put them without editing that route.
   *
   * So the route asks here first. Returning `null` means "not mine", and the
   * written-page path runs exactly as it did before; anything else is rendered
   * as the app's page. That is deliberately a hook and not a replacement: an
   * app claims the addresses it knows and leaves every other one alone, so
   * admin-written pages keep working underneath it.
   *
   * **`/` is asked too**, with `path` as `"/"`, before the front page renders —
   * an app serving different pages to different domains has to be able to
   * answer the front page as well, and `landing.page` cannot: it is chosen once
   * when the app boots, long before there is a request to look at. Saying "not
   * mine" there leaves the front page exactly as it was.
   *
   * The loader may throw `notFound()` or `redirect()` itself when the app wants
   * to answer an address *and* refuse it — a page that exists but is not for
   * this reader. Falling through to the written pages would say "no such
   * address", which is a different answer.
   *
   * Two things come with going first.
   *
   * **The app owns who may read what it claims.** The written-page path decides
   * that for itself — a page switched off comes back as "missing", a members-only
   * one as a sign-in — and an address the app answers never reaches it. Decide it
   * inside the loader, and answer a page somebody may not see the same way as one
   * that does not exist, or the difference tells them it is there.
   *
   * **An address the app claims hides an admin-written one at the same address.**
   * Claim narrowly — a prefix the app owns, or a lookup that only answers for
   * addresses actually in its own table — so an admin writing `/about` is not
   * quietly overruled by a page nobody remembers claiming.
   */
  catchAll?: CatchAllPage
}

type AutomationOptions = {
  /**
   * Extra steps this app adds to the automation palette.
   *
   * The shell's own steps are always there; these are added to them. Each one
   * is an ordinary node descriptor, written in the app's own folder, carrying
   * its own icon and its own settings panel — everything the canvas, the
   * inspector and the compiler need, so none of them has to be told about it
   * separately.
   *
   * What a step *does* is the other half, and it is server-side: the executor
   * goes in `src/app/server-options.ts`, under the same `kind`.
   *
   * A step is only ever added, never replaced. A `kind` or a palette key that
   * the shell already uses is refused out loud rather than quietly winning,
   * because the shell's own flows are built on those names.
   *
   * The settings panel is the one part that goes in a file of its own, and the
   * descriptor points at it — `fields: () => import("./send-sms-panel")`. The
   * reason is on `fields` in `node-descriptor.ts`; the short version is that
   * the engine reads these descriptors, and a panel with a dropdown in it
   * reaches the database. Nothing to remember: that pointer is the only thing
   * the type will accept.
   */
  nodes?: readonly AutomationNodeDescriptor[]
}

type LandingOptions = {
  /**
   * Replaces `/` outright.
   *
   * The whole page, not just the component: the shell's own front page fetches
   * the public plans in its loader, and an app that sells nothing should never
   * make that call at all, let alone throw the answer away.
   */
  page?: PublicPage
}

/** The `<head>` bits a page contributes — the same shape TanStack's `head` wants. */
type PageHead = { meta?: Array<Record<string, string>> }

/**
 * A whole public page: how it loads, what it puts in `<head>`, and what it
 * draws. Kept together because a route needs all three to come from the same
 * place — a replacement that only swapped the component would still be running
 * the shell's loader behind it.
 *
 * `head` is handed what the loader returned, so a title can be part of the
 * page rather than a second fetch. It is an argument the function may simply
 * not take: a head that ignores its data is written `() => ({ ... })` and is
 * still a valid one, which is why every head that existed before this argument
 * did keeps working untouched.
 */
export type PublicPage = {
  head?: (context: { loaderData: unknown }) => PageHead
  loader?: () => Promise<unknown>
  Component: ComponentType<{ data: unknown }>
}

/**
 * A page the app answers arbitrary addresses with — the `pages.catchAll`
 * option above.
 *
 * Unlike `PublicPage` the loader is compulsory and takes the address being
 * asked for, because the whole job here is deciding whether this address is
 * the app's at all. `null` is that answer, and it is the only way to give it.
 */
export type CatchAllPage = {
  loader: (context: { path: string }) => Promise<unknown | null>
  head?: (context: { data: unknown }) => PageHead
  Component: ComponentType<{ data: unknown }>
}

/**
 * Ties a page's loader to its own component so each page keeps its real types
 * while it is being written.
 *
 * The cast is the one place those types are dropped, and it is deliberate: the
 * route file has to render whichever page is in use, so it needs a single shape
 * to render. A page's own `Component` still sees exactly what its own `loader`
 * returns.
 */
export function definePublicPage<TData = undefined>(page: {
  head?: (context: { loaderData: TData }) => PageHead
  loader?: () => Promise<TData>
  Component: ComponentType<{ data: TData }>
}): PublicPage {
  return page as PublicPage
}

/**
 * The same idea as `definePublicPage`, for the catch-all page, and for the same
 * reason: the route renders whichever page is in use and needs one shape, while
 * the app's own component keeps the type its own loader returns.
 *
 * `TData` is what the app answers *with*; the `null` that means "not mine" is
 * added here, so the app writes its real type and still returns null freely.
 */
export function defineCatchAllPage<TData>(page: {
  loader: (context: { path: string }) => Promise<TData | null>
  head?: (context: { data: TData }) => PageHead
  Component: ComponentType<{ data: TData }>
}): CatchAllPage {
  return page as CatchAllPage
}

/*
 * The readers below are the only place an option's default is written, which is
 * what keeps app options from becoming a fourth place `ShellConfig` gets
 * defaulted. Call sites read through these; they never reach into `appOptions`
 * and write their own `?? something`.
 *
 * Two rules keep them safe, and both exist because an app's options file will
 * import an app component, which imports shell components, which can import
 * this file — a genuine circle:
 *
 *   1. Every reader is a `function`, never a `const`. Function declarations are
 *      hoisted, so a module caught mid-circle still gets a working one; a const
 *      read during boot throws.
 *   2. Shell code calls these inside a component or a loader, never at the top
 *      level of a module. Route files are the exception — nothing imports them
 *      back, so the circle cannot reach them.
 */

/**
 * The app's replacement front page, or null to keep the shell's.
 *
 * Deliberately not "the landing page with a default" — a default here would
 * pull every page module into this file and rebuild the very circle the rules
 * above are about. Page defaults live at the route, as one `??`.
 *
 * The argument is only ever passed by the tests, which check that an unset
 * option still means today's behaviour. Written this way so that check keeps
 * working inside an app that has set the option — a test reading that app's own
 * answers could only ever assert what the app already says.
 */
export function landingPageOverride(
  options: AppOptions = appOptions
): PublicPage | null {
  return options.landing?.page ?? null
}

/**
 * The app's page for addresses nothing else claims, or null to leave the
 * catch-all exactly as the shell wrote it.
 *
 * Null rather than a default page, for the same reason as the front page above:
 * a default here would pull a page module into this file and rebuild the import
 * circle the rules above exist to avoid.
 *
 * The argument is only ever passed by the tests, which check that an unset
 * option still means today's behaviour — written this way so that check keeps
 * working inside an app that has set the option.
 */
export function catchAllOverride(
  options: AppOptions = appOptions
): CatchAllPage | null {
  return options.pages?.catchAll ?? null
}

/**
 * The steps this app adds to the automation palette, or none.
 *
 * Read by `node-registry.ts`, which adds them to the shell's own list the first
 * time anything asks for it — never while modules are still loading, because
 * an app's node imports app components which import shell components which
 * import this file.
 */
export function appAutomationNodes(
  options: AppOptions = appOptions
): readonly AutomationNodeDescriptor[] {
  return options.automations?.nodes ?? []
}

/**
 * Who may have a workspace on this app — see `workspaces.whoMayHave` above.
 *
 * Defaults to admins only, which is deliberately *not* what the shell did
 * before this option existed. The reason is written on the option itself.
 *
 * The argument is only ever passed by the tests, so the check that an unset
 * option still means "admins" keeps working inside an app that has set it.
 */
export function whoMayHaveWorkspaces(
  options: AppOptions = appOptions
): WhoMayHaveWorkspaces {
  return options.workspaces?.whoMayHave ?? "admins"
}

/** Whether this person may have a workspace at all, on this app. */
export function mayHaveWorkspace(
  user: { role: string } | null | undefined,
  options: AppOptions = appOptions
): boolean {
  if (!user) return false

  const who = whoMayHaveWorkspaces(options)
  if (who === "off") return false
  if (who === "everyone") return true
  return user.role === "admin"
}
