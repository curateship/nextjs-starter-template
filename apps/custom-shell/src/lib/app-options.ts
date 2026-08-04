import type { ComponentType } from "react"

import { appOptions } from "@/app/options"

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
 */
export type PublicPage = {
  head?: () => PageHead
  loader?: () => Promise<unknown>
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
  head?: () => PageHead
  loader?: () => Promise<TData>
  Component: ComponentType<{ data: TData }>
}): PublicPage {
  return page as PublicPage
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
