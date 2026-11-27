import { NETWORK_NAMES, isNetwork } from "@/lib/social/networks"

/**
 * Bans (workspace/tasks/Bans/01-ban-features.md), the parts a page and the
 * server both read. Tyler's answers of 2 and 3 Nov 2026 are the numbers.
 */

/**
 * What stopped the account. The first four are the screens an app shows;
 * `suspended_reading` is Reddit reading the account as suspended to a
 * stranger (part 8), which counts as a ban everywhere.
 */
export const BAN_KINDS = ["suspended", "locked", "confirm", "restricted", "suspended_reading"] as const
export type BanKind = (typeof BAN_KINDS)[number]

export const BAN_KIND_LABELS: Record<BanKind, string> = {
  suspended: "Suspended",
  locked: "Locked",
  confirm: "Confirm it's you",
  restricted: "Restricted",
  suspended_reading: "Read as suspended",
}

export function isBanKind(value: unknown): value is BanKind {
  return typeof value === "string" && (BAN_KINDS as readonly string[]).includes(value)
}

/**
 * The kinds that count toward a phone kept off an app (part 3), a proxy
 * refused (part 5) and the app-wide brake (part 11). Tyler's open question:
 * whether locked and "confirm it's you" screens count too. Until he answers,
 * they are recorded in the Anti Detect dashboard's Bans and not counted. Changing this
 * list is the whole change.
 */
export const COUNTED_BAN_KINDS: readonly BanKind[] = ["suspended", "restricted", "suspended_reading"]

export function countsAsBan(kind: string): boolean {
  return (COUNTED_BAN_KINDS as readonly string[]).includes(kind)
}

/** After this many counted bans of one app, a phone is kept off that app (part 3). The first only warns. */
export const PHONE_KEPT_OFF_AFTER = 2

/** Two counted bans of one app inside this long pause every account on it (part 11). */
export const BRAKE_WINDOW_MS = 24 * 3_600_000
export const BRAKE_BANS = 2

/** Every other account on a banned account's phone, proxy or SIM goes at half pace this long (part 24). */
export const NEIGHBOUR_SLOW_MS = 2 * 24 * 3_600_000

/** "Let it run again" holds the account to half pace this long (part 23). */
export const SLOW_RESTART_MS = 7 * 24 * 3_600_000

/** A "confirm it's you" or locked screen this recent makes an account At risk (part 21). */
export const AT_RISK_SCREEN_MS = 7 * 24 * 3_600_000

/** The bell reminds about an appeal with no answer after this long (part 25). */
export const APPEAL_REMINDER_MS = 7 * 24 * 3_600_000

/** The weekly look at a banned app (part 26). */
export const BAN_LOOK_GAP_MS = 7 * 24 * 3_600_000

/** A throwaway's post has to stay up this long before an important account follows (part 22). */
export const THROWAWAY_FIRST_MS = 24 * 3_600_000

/**
 * Half of a limit, never under one, so a slowed account can still do
 * something. "Half pace" is half of every hourly and daily limit in Settings
 * → Behaviour, and half the automatic actions a day.
 */
export function halfOf(limit: number): number {
  return Math.max(1, Math.floor(limit / 2))
}

/** Why an account's work waits while the app-wide brake is on (part 11). */
export function brakeWords(app: string): string {
  const name = appName(app)
  return `Two ${name} bans in a day paused every ${name} account. Release ${name} in Waiting on you, on the Anti Detect dashboard's Overview, once you have looked.`
}

/** Why an account was retired (part 15). */
export const RETIRED_REASONS = ["banned", "sold", "given_up", "other"] as const
export type RetiredReason = (typeof RETIRED_REASONS)[number]

export const RETIRED_REASON_LABELS: Record<RetiredReason, string> = {
  banned: "Banned",
  sold: "Sold",
  given_up: "Given up",
  other: "Other",
}

export function isRetiredReason(value: unknown): value is RetiredReason {
  return typeof value === "string" && (RETIRED_REASONS as readonly string[]).includes(value)
}

/** The words for a retired account's reason, or "Not recorded" for one retired before reasons were kept. */
export function retiredReasonWords(reason: string, note: string): string {
  if (!isRetiredReason(reason)) return "Not recorded"
  if (reason === "other" && note.trim()) return `Other: ${note.trim()}`
  return RETIRED_REASON_LABELS[reason]
}

/** Where an account came from (part 16). */
export const ACCOUNT_SOURCES = ["made", "bought"] as const
export type AccountSource = (typeof ACCOUNT_SOURCES)[number]

export const ACCOUNT_SOURCE_LABELS: Record<AccountSource, string> = { made: "Made", bought: "Bought" }

export function isAccountSource(value: unknown): value is AccountSource {
  return typeof value === "string" && (ACCOUNT_SOURCES as readonly string[]).includes(value)
}

/** A price box's dollars as cents, null for an empty box, or undefined when it is not a price. */
export function priceCents(price: string): number | null | undefined {
  const plain = price.trim().replace(/^\$/, "")
  if (!plain) return null
  if (!/^\d+(\.\d{1,2})?$/.test(plain)) return undefined
  return Math.round(Number(plain) * 100)
}

/** Cents as a price box shows them: "40" or "12.50". */
export function priceWords(cents: number | null): string {
  if (cents === null) return ""
  return cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100)
}

/** The appeal's answer (part 25). */
export type AppealAnswer = "won" | "lost"

/** The lines of an account's own history (part 14). */
export const ACCOUNT_EVENT_KINDS = [
  "added",
  "moved",
  "banned",
  "appealed",
  "appeal_answered",
  "let_run",
  "retired",
  "cleaned_up",
] as const
export type AccountEventKind = (typeof ACCOUNT_EVENT_KINDS)[number]

export const ACCOUNT_EVENT_WORDS: Record<AccountEventKind, string> = {
  added: "Added",
  moved: "Moved",
  banned: "Banned",
  appealed: "Appealed",
  appeal_answered: "Appeal answered",
  let_run: "Let run again",
  retired: "Retired",
  cleaned_up: "Cleaned up",
}

/**
 * How an account left a phone (part 2). The task also named "deleted", but
 * Promo never deletes an account, so nothing could write it.
 */
export const TENANCY_ENDS = ["moved", "banned", "retired"] as const
export type TenancyEnd = (typeof TENANCY_ENDS)[number]

export const TENANCY_END_WORDS: Record<TenancyEnd, string> = {
  moved: "Moved",
  banned: "Banned",
  retired: "Retired",
}

/** An app's name for people: "Instagram", or the stored word when Promo does not know it. */
export function appName(app: string): string {
  return isNetwork(app) ? NETWORK_NAMES[app] : app
}

/** "once", "twice", "3 times". */
export function timesWords(count: number): string {
  if (count === 1) return "once"
  if (count === 2) return "twice"
  return `${count} times`
}

/**
 * A phone's banned apps in words, the busiest first: "Instagram twice,
 * TikTok once". Empty when there are none. The word "burned" is never used
 * on screen (Tyler, 3 Nov 2026).
 */
export function bannedOnWords(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || appName(a[0]).localeCompare(appName(b[0])))
    .map(([app, count]) => `${appName(app)} ${timesWords(count)}`)
    .join(", ")
}

/**
 * The kind of ban a browser page's words name, for the networks whose
 * browser routine hands back the words only (X, LinkedIn, Reddit and
 * Medium in a browser). A word Promo does not know reads as suspended.
 */
export function banKindFromWords(words: string, app: string): BanKind {
  const plain = words.toLowerCase()
  if (plain.includes("restrict") || plain.includes("temporarily limited")) return app === "linkedin" || app === "x" ? "restricted" : "suspended"
  if (plain.includes("suspend") || plain.includes("banned") || plain.includes("disabled") || plain.includes("violation")) return "suspended"
  if (plain.includes("lock")) return "locked"
  if (plain.includes("confirm") || plain.includes("verify") || plain.includes("security check")) return "confirm"
  return "suspended"
}
