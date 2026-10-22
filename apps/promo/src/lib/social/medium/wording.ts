import type { PaceLimit } from "@/lib/social/pace"
import { whenText } from "@/lib/social/wording"

import { MEDIUM_WARM_UP_DAYS } from "./options"

/**
 * What Medium's composer and the server say about whether an account may
 * write now. The server refuses with these words and the screen explains
 * with the same ones, so they live where both can read them.
 */

/** Whether a Medium account may write now, and if not, when. The Medium twin of Reddit's `PostingState`. */
export type MediumPostingState = {
  /** What paused it, or null when it runs. */
  paused: "account" | "project" | "network" | null
  timeZone: string
  awake: boolean
  /** When it next wakes. Null while it is awake. */
  nextWakeAt: Date | null
  warmUp: {
    /** Null when the warm-up is over. */
    endsAt: Date | null
    /** True when Promo never read when Medium says the account joined. */
    ageUnknown: boolean
  }
  young: boolean
  /** Responses and articles that reached Medium in the last hour and the last 24 hours. */
  lastHour: number
  lastDay: number
  warnPerHour: number
  youngPerHour: number
  youngPerDay: number
  limit: PaceLimit | null
}

/** Why Post or Publish is refused now, or null when it may go. Waking hours never refuse: they hold it. */
export function mediumPostingRefusal(
  state: MediumPostingState,
  now: Date = new Date(),
  timeZone?: string
): string | null {
  if (state.paused === "account") return "This account is paused. Resume it on the Accounts dashboard to write from it again."
  if (state.paused === "project") return "This account's project is paused. Resume the project on its dashboard to write from it again."
  if (state.paused === "network") return "Medium is paused on this project. Resume Medium in the project's left column to write again."
  if (state.warmUp.ageUnknown) {
    return "Promo has not read when this account joined Medium, so it cannot tell when the warm-up ends. Press Check who is signed in on the Accounts dashboard, then try again."
  }
  if (state.warmUp.endsAt && state.warmUp.endsAt > now) {
    return `This account is in its first ${MEDIUM_WARM_UP_DAYS} days on Medium, warming up. It may write ${whenText(state.warmUp.endsAt, now, timeZone)}.`
  }
  const limit = state.limit
  if (!limit) return null
  const allowed = limit.limit === "hour" ? state.youngPerHour : state.youngPerDay
  const span = limit.limit === "hour" ? "an hour" : "a day"
  if (!limit.nextAllowedAt) {
    return `A young account may send ${allowed} ${allowed === 1 ? "response or article" : "responses and articles"} ${span}, and that many are sent or waiting to go. Try again once the waiting ones have gone.`
  }
  if (limit.nextAllowedAt <= now) return null
  return `A young account may send ${allowed} ${allowed === 1 ? "response or article" : "responses and articles"} ${span}, and this one has. The next is allowed ${whenText(limit.nextAllowedAt, now, timeZone)}.`
}

/** "2 in the last hour, 5 today." */
export function mediumPaceLine(state: Pick<MediumPostingState, "lastHour" | "lastDay">): string {
  return `${state.lastHour} in the last hour, ${state.lastDay} today.`
}

/** The warning past the per-hour number. It warns and never refuses. */
export function mediumPaceWarning(state: Pick<MediumPostingState, "lastHour" | "warnPerHour">): string | null {
  if (state.lastHour < state.warnPerHour) return null
  return `That would make ${state.lastHour + 1} this hour. New accounts get banned for less.`
}

/** What a response held for the account's morning says. */
export function mediumWaitingText(runAfter: Date, handle: string | null, now: Date = new Date()): string {
  const who = handle ? `@${handle}'s` : "the account's"
  return `Waiting for ${who} waking hours. It goes ${whenText(runAfter, now)}.`
}

/** Followers in a few characters: 950, 12.4K, 1.2M. */
export function followersText(followers: number | null): string {
  if (followers === null) return "followers not known"
  const short =
    followers >= 1_000_000
      ? `${(followers / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
      : followers >= 1_000
        ? `${(followers / 1_000).toFixed(1).replace(/\.0$/, "")}K`
        : String(followers)
  return `${short} ${followers === 1 ? "follower" : "followers"}`
}
