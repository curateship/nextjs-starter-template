/**
 * The public profile's rules, free of server imports so the Settings card and
 * the server check the same ones.
 *
 * A handle is a new public namespace in this app, and the two things that
 * keep it safe are both here: the shape check and the reserved list. The
 * shape check runs before the database is ever asked, the way
 * `isBadgeTokenShape` does for the streak badge, because a handle carrying a
 * NUL byte reached Postgres on that route once and threw a 500 at whoever
 * asked for it.
 */

import type { PublicSocialLink } from "@/lib/pages/public-social"

export const HANDLE_MAX_LENGTH = 30
export const BIO_MAX_LENGTH = 280
export const MAX_PINNED_BADGES = 3

/**
 * Letters, digits, hyphen and underscore, lowercase only, 3 to 30 long.
 *
 * Anchored and with no `.` or `\s` in it, so nothing with a newline, a slash
 * or a NUL byte in it can match, whatever the browser sent.
 */
const HANDLE_PATTERN = /^[a-z0-9_-]{3,30}$/

/**
 * Addresses the app owns, which nobody may take as a handle.
 *
 * `/u/<handle>` sits under its own `/u/` prefix, so none of these could
 * actually shadow a real page today. The list is here for the day a handle is
 * printed somewhere flatter: `focusapp.com/sarah` reads better on a business
 * card, and the moment anyone moves it there, a member holding `login` is a
 * problem that cannot be undone. Reserving them now costs nothing.
 *
 * `u` is on the list for the same reason, and so is every top-level route
 * this app already serves.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "about",
  "account",
  "admin",
  "api",
  "assets",
  "backgrounds",
  "badge",
  "billing",
  "blog",
  "changelog",
  "contact",
  "dashboard",
  "docs",
  "groups",
  "help",
  "history",
  "home",
  "leaderboard",
  "login",
  "logout",
  "maintenance",
  "me",
  "media",
  "people",
  "pricing",
  "privacy",
  "public",
  "register",
  "robots",
  "rooms",
  "root",
  "search",
  "settings",
  "signin",
  "signout",
  "signup",
  "sitemap",
  "sounds",
  "static",
  "support",
  "tasks",
  "team",
  "terms",
  "timer",
  "tools",
  "u",
  "user",
  "users",
  "workspaces",
])

/** Shaped like a handle. Says nothing about whether anybody holds it. */
export function isHandleShape(value: string) {
  return HANDLE_PATTERN.test(value)
}

/** Shaped like a handle and not an address the app keeps for itself. */
export function isHandleAvailableShape(value: string) {
  return isHandleShape(value) && !RESERVED_HANDLES.has(value)
}

export const HANDLE_SHAPE_MESSAGE =
  "A handle is 3 to 30 characters: lowercase letters, digits, hyphens and underscores."
export const HANDLE_RESERVED_MESSAGE =
  "That handle is kept for the app itself. Pick another one."
export const HANDLE_TAKEN_MESSAGE =
  "Somebody already has that handle. Pick another one."

/**
 * Lowercases and trims what somebody typed, so `Sarah` and ` sarah ` both
 * become the one handle that is actually stored. It does not validate:
 * whatever comes back still goes through `isHandleAvailableShape`.
 */
export function normalizeHandle(value: string) {
  return value.trim().toLowerCase()
}

/**
 * The sections of a profile that each have their own switch, and what each
 * switch's label says.
 *
 * Every one is off by default. The bio, the links and the picture are not
 * here: they ride on the one `profilePublic` switch, because they are the
 * profile rather than a record published on it.
 */
export const PROFILE_SECTIONS = [
  {
    key: "showFigures",
    label: "Hours and streaks",
    hint: "Total hours focused, sessions finished, and your current and best streaks.",
  },
  {
    key: "showBadges",
    label: "Badges you have earned",
    hint: "Only the badges on record, each with the day you earned it. Locked ones stay private.",
  },
  {
    key: "showHeatmap",
    label: "A year of squares",
    hint: "One square per day for the last 365 days. This says which days you worked and which you did not, including the days you were ill.",
  },
  {
    key: "showProjects",
    label: "What you worked on",
    hint: "The last seven days, by project, and only the projects you have ticked as public.",
  },
  {
    key: "showFocusingNow",
    label: "Focusing right now",
    hint: "A line while you are mid-session. It tells a reader when you are at your desk, and never what you are working on.",
  },
  {
    key: "showRoom",
    label: "The room you are hosting",
    hint: "A public room you host, with a Join button. An unlisted room never appears.",
  },
] as const

export type ProfileSectionKey = (typeof PROFILE_SECTIONS)[number]["key"]

/**
 * The banner is stored exactly the way a chosen background already is:
 * `scene:<key>` for one of the eight built-in scenes, `media:<uuid>` for the
 * person's own upload. `parseBackgroundReference` in
 * `@/lib/pomodoro/background-catalog` is the one parser for both, so a
 * banner can only ever be a scene that exists or a uuid, and never a URL
 * anybody typed.
 */
export const BANNER_UPLOAD_LOCKED_REASON =
  "Your own banner picture is a Pro perk. The eight scenes are free."

/**
 * What a public profile page is handed. Every field a switch controls is
 * null when that switch is off, because the server never read it.
 *
 * These live here rather than beside the queries so the page component can
 * name them without importing anything that touches the database.
 */
export type PublicProfileFigures = {
  focusHours: number
  focusSessions: number
  currentStreak: number
  bestStreak: number
}

export type PublicProfileBadge = {
  id: string
  name: string
  description: string
  earnedOn: string
}

export type PublicProfileView = {
  handle: string
  /** The display name, or the handle when they have not set one. */
  name: string
  bio: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  socialLinks: PublicSocialLink[]
  figures: PublicProfileFigures | null
  badges: PublicProfileBadge[] | null
  pinnedBadgeIds: string[]
  heatmap: {
    startDate: string
    endDate: string
    days: { localDate: string; focusSeconds: number }[]
  } | null
  projects: { name: string; focusSeconds: number }[] | null
  focusingNow: { mode: "focus" | "short" | "long"; endsAt: string } | null
  room: { slug: string; name: string; phase: string } | null
  /** Years with a recap page, newest first. Empty when the figures are off. */
  recapYears: number[]
  /** How many people follow them, and how many they follow. */
  followers: number
  following: number
  /**
   * True when the reader is looking at their own page. Nobody follows,
   * cheers, reports or blocks themselves, so the actions row is not drawn.
   */
  isOwner: boolean
}

export type YearInReviewView = {
  handle: string
  name: string
  year: number
  /** True when the year is too thin to print, and nothing below is filled. */
  tooEarly: boolean
  focusHours: number
  focusSessions: number
  tasksCompleted: number
  bestStreak: number
  busiestMonth: { month: string; focusHours: number } | null
  badges: PublicProfileBadge[]
}
