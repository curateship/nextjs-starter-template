import type { PageDescriptor } from "./page-descriptor"

/**
 * Who may see a public page.
 *
 * This is the first per-page setting, and it sets the shape the rest of the
 * batch follows: **a page needs no saved row to work.** The default is
 * "everyone", and a page nobody has touched has nothing stored about it at
 * all — so an install that never opens this screen behaves exactly as it did
 * before the setting existed.
 */
/**
 * The choices, in the order they are offered — and the list the type is made
 * from, so the two can never drift and the endpoint can validate against this
 * list directly rather than restating it.
 */
export const PAGE_VISIBILITIES = ["everyone", "members", "off"] as const

export type PageVisibility = (typeof PAGE_VISIBILITIES)[number]

export const PAGE_VISIBILITY_LABELS: Record<PageVisibility, string> = {
  everyone: "Everyone",
  members: "Members only",
  off: "Switched off",
}

/** What is stored about one page. Only visibility today; later tasks add more. */
export type PageOverride = {
  visibility: PageVisibility
}

/** Address → what has been changed about that page. An absent page is default. */
export type ShellPageOverrides = Record<string, PageOverride>

/**
 * How many pages may carry an override. A generous ceiling on a hand-edited
 * settings row rather than a limit anybody could reach by using the screen —
 * the shell has eleven pages.
 */
export const MAX_PAGE_OVERRIDES = 500

export function createDefaultPageOverrides(): ShellPageOverrides {
  return {}
}

export function isPageVisibility(value: unknown): value is PageVisibility {
  return PAGE_VISIBILITIES.includes(value as PageVisibility)
}

/**
 * A saved value can predate this setting or have been hand-edited in the
 * database. Anything that is not clearly an address and one of the three
 * choices is dropped, which leaves that page on "everyone" — the same rule the
 * other app-wide settings follow, and the safe direction: a junk value
 * silently hiding a page is far worse than one that is ignored.
 */
export function normalizePageOverrides(value: unknown): ShellPageOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultPageOverrides()
  }

  const overrides: ShellPageOverrides = {}
  for (const [path, entry] of Object.entries(value).slice(
    0,
    MAX_PAGE_OVERRIDES
  )) {
    if (!path.startsWith("/")) continue
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue

    const visibility = (entry as Partial<PageOverride>).visibility
    if (!isPageVisibility(visibility)) continue
    // "everyone" is the default, so storing it would be a row that says
    // nothing. Dropping it here keeps "untouched" and "set back to normal"
    // the same state rather than two that behave alike but read differently.
    if (visibility === "everyone") continue

    overrides[path] = { visibility }
  }

  return overrides
}

/**
 * Who may see this page — **the one place the default is written**.
 *
 * A page the shell refuses to switch off always answers "everyone", whatever
 * the settings row says. That is deliberate and it is the whole lockout
 * defence: the screen greys the control out, but an override typed straight
 * into the database has to be ignored here too, or the sign-in page could be
 * switched off and nobody could get back in.
 */
export function pageVisibility(
  overrides: ShellPageOverrides,
  page: Pick<PageDescriptor, "path" | "canSwitchOff">
): PageVisibility {
  if (!page.canSwitchOff) return "everyone"
  return overrides[page.path]?.visibility ?? "everyone"
}
