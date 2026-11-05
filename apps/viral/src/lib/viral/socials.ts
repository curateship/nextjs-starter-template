import {
  PROMO_READ_KINDS_BY_NETWORK,
  type PromoReadKind,
  type PromoReadNetwork,
  type SocialPost,
} from "@/lib/viral/promo-link"

/**
 * The socials a Viral project can use, each one a module on the project's
 * dashboard: a row in its left panel that fills the middle panel with what
 * that social found (`workspace/docs/projects-and-socials.md`). Copied from
 * Promo's networks list (Tyler, 4 Nov 2026: "add socials (like modules see
 * promo app)").
 *
 * Only socials Viral has built are listed, so "+ Add social" never offers one
 * that does nothing. YouTube is searched by keyword and its creators are
 * followed; TikTok has creators only ("Creators only for TikTok"). X, Reddit
 * and LinkedIn are read by Promo ("Ask Promo to read them"); Threads is not a
 * social because Promo can't read it. The server reads this same list to
 * refuse anything else.
 */
export const SOCIALS = ["youtube", "tiktok", "x", "reddit", "linkedin"] as const

export type Social = (typeof SOCIALS)[number]

export const SOCIAL_NAMES: Record<Social, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
  reddit: "Reddit",
  linkedin: "LinkedIn",
}

/** The socials Viral reads itself, whose finds are videos. A new project ticks both. */
export const VIDEO_SOCIALS = ["youtube", "tiktok"] as const satisfies readonly Social[]
export type VideoSocial = (typeof VIDEO_SOCIALS)[number]

/** The socials Promo reads for Viral, whose finds are posts that open as a thread. */
export const TEXT_SOCIALS = ["x", "reddit", "linkedin"] as const satisfies readonly (Social & PromoReadNetwork)[]
export type TextSocial = (typeof TEXT_SOCIALS)[number]

/** The socials whose keywords are searched through YouTube's keyword list. */
export const KEYWORD_SOCIALS: readonly Social[] = ["youtube"]

export function isSocial(value: unknown): value is Social {
  return typeof value === "string" && (SOCIALS as readonly string[]).includes(value)
}

export function isTextSocial(value: unknown): value is TextSocial {
  return typeof value === "string" && (TEXT_SOCIALS as readonly string[]).includes(value)
}

export function isVideoSocial(value: unknown): value is VideoSocial {
  return typeof value === "string" && (VIDEO_SOCIALS as readonly string[]).includes(value)
}

export function socialHasKeywords(social: Social): boolean {
  return KEYWORD_SOCIALS.includes(social)
}

/** A project's socials as saved, in the order added, with anything unknown dropped. */
export function readSocials(value: unknown): Social[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isSocial))]
}

/**
 * What a text social keeps reading: everything Promo reads for it except
 * one post, which is only ever read for the thread view.
 */
export type WatchKind = Exclude<PromoReadKind, "post">

export function watchKinds(social: TextSocial): WatchKind[] {
  return PROMO_READ_KINDS_BY_NETWORK[social].filter((kind): kind is WatchKind => kind !== "post")
}

/**
 * Searches are read again once a day, like YouTube keywords; people, pages
 * and accounts every 6 hours, like followed creators. A subreddit's top posts
 * of the week change daily, so it goes with searches.
 */
export const WATCH_READ_EVERY_MS: Record<WatchKind, number> = {
  search: 24 * 60 * 60 * 1000,
  hashtag: 24 * 60 * 60 * 1000,
  subreddit: 24 * 60 * 60 * 1000,
  account: 6 * 60 * 60 * 1000,
  person: 6 * 60 * 60 * 1000,
  company: 6 * 60 * 60 * 1000,
}

/** The words for each kind, as a card title, the add field's hint, and one row's line. */
export const WATCH_KIND_WORDS: Record<WatchKind, { title: string; add: string; placeholder: string; one: string }> = {
  search: { title: "Searches", add: "Add a search", placeholder: "meal prep", one: "search" },
  hashtag: { title: "Hashtags", add: "Add a hashtag", placeholder: "#mealprep", one: "hashtag" },
  account: { title: "Accounts", add: "Follow an account", placeholder: "@handle", one: "account" },
  person: { title: "People", add: "Follow a person", placeholder: "linkedin.com/in/name", one: "person" },
  company: { title: "Companies", add: "Follow a company", placeholder: "linkedin.com/company/name", one: "company" },
  subreddit: { title: "Subreddits", add: "Follow a subreddit", placeholder: "r/MealPrepSunday", one: "subreddit" },
}

/** The most a watched value can be, the same as a Promo read's. */
export const WATCH_VALUE_MAX = 300

/**
 * A watched value as it is kept: trimmed, with a subreddit's "r/" and an
 * account's "@" left off so "r/Fitness" and "Fitness" are one subreddit.
 * Null when nothing is left.
 */
export function cleanWatchValue(kind: WatchKind, value: string): string | null {
  let cleaned = value.trim().slice(0, WATCH_VALUE_MAX)
  if (kind === "subreddit") cleaned = cleaned.replace(/^\/?r\//i, "")
  if (kind === "account") cleaned = cleaned.replace(/^@/, "")
  if (kind === "hashtag") cleaned = cleaned.replace(/^#/, "")
  cleaned = cleaned.trim()
  return cleaned ? cleaned : null
}

/** A watched value as a row shows it: "r/Fitness", "@handle", "#mealprep". */
export function watchLabel(kind: WatchKind, value: string): string {
  if (kind === "subreddit") return `r/${value}`
  if (kind === "account") return `@${value}`
  if (kind === "hashtag") return `#${value}`
  return value
}

/** How a watch's newest read stands. "never" is a watch nothing has read yet. */
export type SocialWatchStatus = "never" | "waiting" | "done" | "failed"

/** One thing a project keeps reading on X, Reddit or LinkedIn, as the left panel shows it. */
export type SocialWatch = {
  id: string
  network: TextSocial
  kind: WatchKind
  value: string
  status: SocialWatchStatus
  /** Why the newest read failed, in Promo's words. */
  error: string
  /** How many posts the newest finished read brought. */
  found: number
  /** The newest read's id, for asking how it stands while it waits. */
  readId: string | null
  /** When the newest read was asked for. */
  readAt: string | null
}

/** A project's X, Reddit and LinkedIn side: whether Promo is set up, what it watches, and the posts found. */
export type TextSocialsScreen = {
  /** Promo's address and key are both saved on Settings → Promo connection. */
  connected: boolean
  watches: SocialWatch[]
  posts: SocialPost[]
}
