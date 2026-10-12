import type { ProfileCheck } from "@/lib/social/options"
import { profileCheckWords } from "@/lib/social/wording"
import type { PostingState } from "@/server/social/posting"

/**
 * Where a Reddit account stands, in Tyler's four words of 12 Oct 2026.
 *
 * Warming up lasts the warm-up setting in Settings → Behaviour, counted from
 * the day Reddit made the account. After it, an account is Working if Promo
 * sent a comment from it in the last 7 days, and Ready otherwise. Banned is
 * Reddit marking it suspended, and is only shown: nothing is paused.
 *
 * A person can set a different status by hand. It is a label and nothing
 * more. Post and the warm-up go by the account's age, so a hand-set Ready
 * never lets a warming account comment.
 *
 * Pure, and the server passes in when the warm-up ends from the same
 * `warmUpEndsAt` that Post uses, so the dashboard and Post never disagree
 * about whether an account is warming up.
 */

export const ACCOUNT_STATUSES = ["warming_up", "ready", "working", "banned"] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  warming_up: "Warming up",
  ready: "Ready",
  working: "Working",
  banned: "Banned",
}

/** How recent a Promo comment has to be for the account to count as Working. */
export const WORKING_DAYS = 7

const DAY_MS = 86_400_000

export type AccountStatusView = {
  /** Null when the account's age was never read, so the app cannot tell. */
  status: AccountStatus | null
  /** True when a person chose it on the Reddit accounts dashboard. */
  byHand: boolean
  /**
   * What a profile check saw that is worth a second look but is not Banned,
   * such as a profile a stranger cannot load. Never calls a shadowban certain.
   */
  warning: string | null
}

export function accountStatus(input: {
  statusOverride: AccountStatus | null
  profileCheck: ProfileCheck | null
  /** From `warmUpEndsAt`: a date while warming, null when over, undefined when the age is unknown. */
  warmUpEndsAt: Date | null | undefined
  /** The newest comment Promo sent from it that reached Reddit, or null. */
  lastPromoCommentAt: Date | null
  now?: Date
}): AccountStatusView {
  const now = input.now ?? new Date()
  const check = input.profileCheck
  const words = check && !check.suspended ? profileCheckWords(check) : null
  const warning = words?.concern ? words.text : null

  if (input.statusOverride && ACCOUNT_STATUSES.includes(input.statusOverride)) {
    return { status: input.statusOverride, byHand: true, warning }
  }
  if (check?.suspended) return { status: "banned", byHand: false, warning: null }
  if (input.warmUpEndsAt === undefined) return { status: null, byHand: false, warning }
  if (input.warmUpEndsAt && input.warmUpEndsAt > now) {
    return { status: "warming_up", byHand: false, warning }
  }
  const working =
    input.lastPromoCommentAt !== null &&
    now.getTime() - input.lastPromoCommentAt.getTime() < WORKING_DAYS * DAY_MS
  return { status: working ? "working" : "ready", byHand: false, warning }
}

/** The status in words, or "Not read yet" when the app cannot tell. */
export function accountStatusText(view: Pick<AccountStatusView, "status">): string {
  return view.status ? ACCOUNT_STATUS_LABELS[view.status] : "Not read yet"
}

/**
 * How soon an account may comment, as a place in the Projects dashboard's
 * list: 0 awake with room left in today's pace, 1 awake with none, 2 asleep,
 * 3 warming up or its age never read, 4 banned. Only an order. Nothing is
 * picked for the person and nothing posts.
 */
export function commentReadiness(
  status: Pick<AccountStatusView, "status">,
  posting: Pick<PostingState, "awake" | "warmUp" | "limit">,
  now: Date = new Date()
): number {
  if (status.status === "banned") return 4
  if (posting.warmUp.ageUnknown || (posting.warmUp.endsAt && posting.warmUp.endsAt > now)) return 3
  if (!posting.awake) return 2
  if (posting.limit && (!posting.limit.nextAllowedAt || posting.limit.nextAllowedAt > now)) return 1
  return 0
}
