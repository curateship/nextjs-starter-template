import type { PaceLimit } from "@/lib/social/pace"
import { whenText } from "@/lib/social/wording"

import { X_WARM_UP_DAYS } from "./options"

/**
 * What X's composer and the server say about whether an account may post
 * now. The server refuses with these words and the screen explains with the
 * same ones, so they live where both can read them.
 */

/**
 * Whether a failed X write may have gone out anyway: the browser or phone
 * says so, or a phone went quiet after it started (`waitForAnswer` in
 * `src/server/phones/dispatch.ts`), which may be after it pressed send.
 */
export function xMayHaveLanded(lastError: string): boolean {
  return /may already be on X|seconds of starting it/i.test(lastError)
}

/** Whether an X account may post now, and if not, when. The X twin of Medium's `MediumPostingState`. */
export type XPostingState = {
  /** What paused it, or null when it runs. */
  paused: "account" | "project" | "network" | null
  timeZone: string
  awake: boolean
  /** When it next wakes. Null while it is awake. */
  nextWakeAt: Date | null
  warmUp: {
    /** Null when the warm-up is over. */
    endsAt: Date | null
    /** True when Promo has neither read when X says it joined nor seen it signed in. */
    ageUnknown: boolean
  }
  young: boolean
  /** Replies, quotes, answers and posts of its own that reached X in the last hour and the last 24 hours. */
  lastHour: number
  lastDay: number
  warnPerHour: number
  perHour: number
  perDay: number
  limit: PaceLimit | null
}

/** Why Post is refused now, or null when it may go. Waking hours never refuse: they hold it. */
export function xPostingRefusal(state: XPostingState, now: Date = new Date(), timeZone?: string): string | null {
  if (state.paused === "account") return "This account is paused. Resume it on the Accounts dashboard to post from it again."
  if (state.paused === "project") return "This account's project is paused. Resume the project on its dashboard to post from it again."
  if (state.paused === "network") return "X is paused on this project. Resume X in the project's left column to post again."
  if (state.warmUp.ageUnknown) {
    return "Promo has not seen this account signed in to X, so it can't tell when the warm-up ends. Press Check now on the Accounts dashboard, then try again."
  }
  if (state.warmUp.endsAt && state.warmUp.endsAt > now) {
    return `This account is in its first ${X_WARM_UP_DAYS} days on X, warming up. It may post ${whenText(state.warmUp.endsAt, now, timeZone)}.`
  }
  const limit = state.limit
  if (!limit) return null
  const allowed = limit.limit === "hour" ? state.perHour : state.perDay
  const span = limit.limit === "hour" ? "an hour" : "a day"
  if (!limit.nextAllowedAt) {
    return `A young X account may send ${allowed} ${allowed === 1 ? "post" : "posts"} ${span}, and that many are sent or waiting to go. Try again once the waiting ones have gone.`
  }
  if (limit.nextAllowedAt <= now) return null
  return `A young X account may send ${allowed} ${allowed === 1 ? "post" : "posts"} ${span}, and this one has. The next is allowed ${whenText(limit.nextAllowedAt, now, timeZone)}.`
}

/** "2 in the last hour, 5 today." */
export function xPaceLine(state: Pick<XPostingState, "lastHour" | "lastDay">): string {
  return `${state.lastHour} in the last hour, ${state.lastDay} today.`
}

/** The warning past the per-hour number. It warns and never refuses. */
export function xPaceWarning(state: Pick<XPostingState, "lastHour" | "warnPerHour">): string | null {
  if (state.lastHour < state.warnPerHour) return null
  return `That would make ${state.lastHour + 1} this hour. New accounts get locked for less.`
}

/** What a reply held for the account's morning says. */
export function xWaitingText(runAfter: Date, handle: string | null, now: Date = new Date()): string {
  const who = handle ? `@${handle}'s` : "the account's"
  return `Waiting for ${who} waking hours. It goes ${whenText(runAfter, now)}.`
}

/** A count in a few characters, the way X writes it: 950, 12.4K, 1.2M. */
export function shortCount(value: number | null): string {
  if (value === null) return "not read"
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return String(value)
}
