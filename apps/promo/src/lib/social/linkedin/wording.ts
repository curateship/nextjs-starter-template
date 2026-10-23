import type { PaceLimit } from "@/lib/social/pace"
import { whenText } from "@/lib/social/wording"

import { LINKEDIN_WARM_UP_DAYS } from "./options"

/**
 * What LinkedIn's composer and the server say about whether an account may
 * comment or post now. The server refuses with these words and the screen
 * explains with the same ones, so they live where both can read them.
 */

/**
 * Whether a failed LinkedIn write may have gone out anyway: the browser or
 * phone says so, or a phone went quiet after it started (`waitForAnswer` in
 * `src/server/phones/dispatch.ts`), which may be after it pressed Post.
 */
export function linkedinMayHaveLanded(lastError: string): boolean {
  return /may already be on LinkedIn|seconds of starting it/i.test(lastError)
}

/** Whether a LinkedIn account may comment or post now, and if not, when. The LinkedIn twin of X's `XPostingState`. */
export type LinkedinPostingState = {
  /** What paused it, or null when it runs. */
  paused: "account" | "project" | "network" | null
  timeZone: string
  /** Inside the workday: a weekday, 8:00 to 18:00 on its own clock (part 7). */
  working: boolean
  /** When the next workday starts. Null while it is inside one. */
  nextWorkAt: Date | null
  warmUp: {
    /** Null when the warm-up is over. */
    endsAt: Date | null
    /** True when Promo has never seen it signed in, so the warm-up has no start. */
    ageUnknown: boolean
  }
  young: boolean
  /** Comments and posts that reached LinkedIn in the last hour and the last 24 hours. */
  lastHour: number
  lastDay: number
  warnPerHour: number
  perDay: number
  limit: PaceLimit | null
}

/** Why Post is refused now, or null when it may go. Workday hours never refuse: they hold it. */
export function linkedinPostingRefusal(state: LinkedinPostingState, now: Date = new Date(), timeZone?: string): string | null {
  if (state.paused === "account") return "This account is paused. Resume it on the Accounts dashboard to post from it again."
  if (state.paused === "project") return "This account's project is paused. Resume the project on its dashboard to post from it again."
  if (state.paused === "network") return "LinkedIn is paused on this project. Resume LinkedIn in the project's left column to post again."
  if (state.warmUp.ageUnknown) {
    return "Promo has not seen this account signed in to LinkedIn, so its warm-up has not started. Press Check now on the Accounts dashboard, then try again."
  }
  if (state.warmUp.endsAt && state.warmUp.endsAt > now) {
    return `This account is in its first ${LINKEDIN_WARM_UP_DAYS} days on LinkedIn, only reading and reacting. It may comment ${whenText(state.warmUp.endsAt, now, timeZone)}.`
  }
  const limit = state.limit
  if (!limit) return null
  if (!limit.nextAllowedAt) {
    return `A young LinkedIn account may send ${state.perDay} ${state.perDay === 1 ? "comment or post" : "comments and posts"} a day, and that many are sent or waiting to go. Try again once the waiting ones have gone.`
  }
  if (limit.nextAllowedAt <= now) return null
  return `A young LinkedIn account may send ${state.perDay} ${state.perDay === 1 ? "comment or post" : "comments and posts"} a day, and this one has. The next is allowed ${whenText(limit.nextAllowedAt, now, timeZone)}.`
}

/** "2 in the last hour, 5 today." */
export function linkedinPaceLine(state: Pick<LinkedinPostingState, "lastHour" | "lastDay">): string {
  return `${state.lastHour} in the last hour, ${state.lastDay} today.`
}

/** The warning past the per-hour number in Settings → Behaviour. It warns and never refuses. */
export function linkedinPaceWarning(state: Pick<LinkedinPostingState, "lastHour" | "warnPerHour">): string | null {
  if (state.lastHour < state.warnPerHour) return null
  return `That would make ${state.lastHour + 1} this hour. LinkedIn restricts new accounts for less.`
}

/** What a comment held for the next workday says. */
export function linkedinWaitingText(runAfter: Date, name: string | null, now: Date = new Date()): string {
  const who = name ? `${name}'s` : "the account's"
  return `Waiting for ${who} workday. It goes ${whenText(runAfter, now)}.`
}
