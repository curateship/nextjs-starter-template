/**
 * The socials a Viral project can use, each one a module on the project's
 * dashboard: a row in its left panel that fills the middle panel with what
 * that social found (`workspace/docs/projects-and-socials.md`). Copied from
 * Promo's networks list (Tyler, 4 Nov 2026: "add socials (like modules see
 * promo app)").
 *
 * Only socials Viral has built are listed, so "+ Add social" never offers one
 * that does nothing. YouTube is searched by keyword and its creators are
 * followed; TikTok has creators only ("Creators only for TikTok"). X, Threads
 * and Instagram wait for a later task. The server reads this same list to
 * refuse anything else.
 */
export const SOCIALS = ["youtube", "tiktok"] as const

export type Social = (typeof SOCIALS)[number]

export const SOCIAL_NAMES: Record<Social, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
}

/** The socials whose keywords are searched. The rest follow creators only. */
export const KEYWORD_SOCIALS: readonly Social[] = ["youtube"]

export function isSocial(value: unknown): value is Social {
  return typeof value === "string" && (SOCIALS as readonly string[]).includes(value)
}

export function socialHasKeywords(social: Social): boolean {
  return KEYWORD_SOCIALS.includes(social)
}

/** A project's socials as saved, in the order added, with anything unknown dropped. */
export function readSocials(value: unknown): Social[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isSocial))]
}
