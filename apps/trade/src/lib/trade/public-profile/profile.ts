import type { ProtocolId } from "@/lib/protocols/contracts"
import type { DayResult } from "@/lib/trade/pnl/day-buckets"
import type { PublicFigures } from "@/lib/trade/public-profile/figures"

/**
 * Public trader profiles, in the app's own words. Browser-safe: the shapes,
 * the limits and the checks on what a member types. The server file
 * (`@/server/trade/public-profiles.ts`) stores them and works the figures out.
 */

/** Lowercase letters, digits and underscores, starting with a letter. */
export const HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,19}$/
export const HANDLE_MAX = 20
export const DISPLAY_NAME_MAX = 60
export const BIO_MAX = 280
export const LINKS_MAX = 3
/** The longest report a visitor can send about a profile. */
export const REPORT_REASON_MAX = 500
/** How long a handle somebody gave up is kept from everybody else. */
export const HANDLE_HOLD_DAYS = 90

/** A profile joins the leaderboard only past both of these. */
export const LEADERBOARD_MIN_DAYS = 30
export const LEADERBOARD_MIN_TRADES = 20

/**
 * Handles that would read as Trade speaking, or that name a page. Checked
 * when a handle is claimed, so nobody can be `@admin`.
 */
const RESERVED_HANDLES = new Set([
  "admin",
  "administrator",
  "help",
  "moderator",
  "official",
  "root",
  "staff",
  "support",
  "system",
  "trade",
  "traders",
])

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase()
}

/** What is wrong with a handle, in a sentence, or null when it is fine. */
export function handleProblem(handle: string): string | null {
  if (handle.length < 3) return "A handle needs at least 3 characters."
  if (handle.length > HANDLE_MAX) {
    return `A handle can be at most ${HANDLE_MAX} characters.`
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return "A handle starts with a letter and uses only lowercase letters, numbers and underscores."
  }
  if (RESERVED_HANDLES.has(handle)) return "That handle is kept for Trade."
  return null
}

/** What is wrong with a link, or null. Only web addresses are allowed. */
export function linkProblem(link: string): string | null {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return `"${link}" is not a web address. Start it with https://.`
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return `"${link}" is not a web address. Start it with https://.`
  }
  return null
}

/** What a member types in the Public profile window. */
export type PublicProfileInput = {
  handle: string
  displayName: string
  picture: string | null
  bio: string
  links: string[]
  searchable: boolean
}

/**
 * The typed fields, trimmed and checked. Throws `PROFILE_INPUT:<sentence>`
 * so the window can show the sentence as it is.
 */
export function readProfileInput(
  input: PublicProfileInput
): PublicProfileInput {
  const handle = normalizeHandle(input.handle)
  const handleIssue = handleProblem(handle)
  if (handleIssue) throw new Error(`PROFILE_INPUT:${handleIssue}`)
  const displayName = input.displayName.trim()
  if (!displayName) throw new Error("PROFILE_INPUT:Add a display name.")
  if (displayName.length > DISPLAY_NAME_MAX) {
    throw new Error(
      `PROFILE_INPUT:A display name can be at most ${DISPLAY_NAME_MAX} characters.`
    )
  }
  const bio = input.bio.trim()
  if (bio.length > BIO_MAX) {
    throw new Error(
      `PROFILE_INPUT:The bio can be at most ${BIO_MAX} characters.`
    )
  }
  const links = input.links.map((link) => link.trim()).filter(Boolean)
  if (links.length > LINKS_MAX) {
    throw new Error(
      `PROFILE_INPUT:A profile can have up to ${LINKS_MAX} links.`
    )
  }
  for (const link of links) {
    const issue = linkProblem(link)
    if (issue) throw new Error(`PROFILE_INPUT:${issue}`)
  }
  const picture = input.picture?.trim() || null
  if (picture && linkProblem(picture)) {
    throw new Error("PROFILE_INPUT:The picture must be an uploaded image.")
  }
  return {
    handle,
    displayName,
    picture,
    bio,
    links,
    searchable: input.searchable,
  }
}

/**
 * How a visitor can check one wallet.
 *
 * - `onchain`: the address is public on a chain with an explorer, linked.
 * - `checked`: an exchange account with no public address. Trade proved the
 *   key belongs to it, and that is all a visitor can be told.
 * - `failed`: the last ownership check did not pass, so it does not count.
 */
export type WalletCheck = "onchain" | "checked" | "failed"

export type PublicWallet = {
  id: string
  venue: string
  protocol: ProtocolId
  /** Shortened for display, full in `explorerUrl`. Null on exchange accounts. */
  address: string | null
  explorerUrl: string | null
  check: WalletCheck
  /** Why the last check failed, in a sentence. Null unless `failed`. */
  checkNote: string | null
  /** The earliest trade this wallet has in the record, or null for none. */
  recordStart: number | null
  /** When the member deleted it. Its trades still count. */
  removedAt: number | null
}

/** Everything `/t/<handle>` draws. Nothing in it names a coin or a price. */
export type PublicProfileView = {
  handle: string
  displayName: string
  picture: string | null
  bio: string
  links: string[]
  /** When the account was made: "on Trade since". */
  joinedAt: number
  /** The earliest trade in the whole record, or null for none yet. */
  recordStart: number | null
  wallets: PublicWallet[]
  figures: PublicFigures
  /**
   * The month grid, one row per Toronto day with a fill or a closed trade.
   * Summed on the server, so the page never carries each fill's time.
   */
  days: DayResult[]
  /** How many positions are open right now. Never which coins. */
  openPositions: number
  onLeaderboard: boolean
  /** "Let search engines list me". Off also asks search engines not to index. */
  searchable: boolean
  readAt: number
}

/** What the member's own Public profile window reads. */
export type MyPublicProfile = {
  /** Null until the member first saves one. */
  profile:
    | (PublicProfileInput & {
        enabled: boolean
        hiddenAt: number | null
        hiddenReason: string | null
      })
    | null
  /** Suggested when there is no profile yet. */
  suggested: { displayName: string; picture: string | null }
  wallets: PublicWallet[]
}

export const LEADERBOARD_PERIODS = ["7d", "30d", "all"] as const
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number]

export const LEADERBOARD_PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
}

export function isLeaderboardPeriod(
  value: unknown
): value is LeaderboardPeriod {
  return LEADERBOARD_PERIODS.includes(value as LeaderboardPeriod)
}

export type LeaderboardRow = {
  handle: string
  displayName: string
  picture: string | null
  made: { "7d": number; "30d": number; all: number }
  /** Trades that made money out of 100, or null with no closed trades. */
  wonPer100: number | null
  closedTrades: number
  venues: string[]
  protocols: ProtocolId[]
}

/** Shortens an address for a label: `0x3f…a91`. */
export function shortAddress(address: string): string {
  return address.length <= 12
    ? address
    : `${address.slice(0, 4)}…${address.slice(-3)}`
}
