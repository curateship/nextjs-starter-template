import { FACEBOOK_PACKAGE } from "@/lib/dating/options"
import { allWords, findNode, type ScreenRead } from "@/server/tinder/screen"
import type { StopScreen } from "@/server/tinder/stop-screens"

/**
 * Facebook's screens that stop the profile until Tyler presses Resume (part
 * 4 of "facebook/01-facebook-dating"): Facebook asking to confirm it's you,
 * an account restricted, disabled or under review, a Dating profile that is
 * not available, an update Facebook insists on, being signed out, and out of
 * likes. A ban here loses the whole Facebook account, so any of these stops
 * everything rather than trying again.
 *
 * Read from the words on the screen and written before a real phone was
 * read, like `../tinder/stop-screens.ts`. Only a screen Facebook itself is
 * showing counts.
 */

const r = (pattern: string) => new RegExp(pattern, "im")

const STOP_WORDS: Array<{ reason: Exclude<StopScreen["reason"], "tinder_missing" | "not_signed_in" | "left_dating" | "app_changed">; patterns: RegExp[] }> = [
  {
    reason: "banned",
    patterns: [r("your account (has been|was|is) (disabled|suspended)"), r("^account disabled$"), r("we suspended your account"), r("your account has been locked")],
  },
  {
    reason: "dating_unavailable",
    patterns: [
      r("dating (profile )?(isn'?t|is not|not) available"),
      r("your dating profile (was|has been|is) (removed|disabled|suspended|restricted)"),
      r("you can'?t use dating"),
      r("dating isn'?t available (to you|for you|on this account)"),
    ],
  },
  {
    reason: "restricted",
    patterns: [
      r("your account (is|has been) restricted"),
      r("you('?re| are) temporarily (blocked|restricted)"),
      r("you can'?t use this feature right now"),
      r("^action blocked$"),
      r("you'?re going too fast"),
      r("this feature is temporarily unavailable"),
    ],
  },
  { reason: "under_review", patterns: [r("(account|profile) is (under|being) review"), r("we'?re reviewing (your account|your profile)")] },
  {
    reason: "verification",
    patterns: [
      r("confirm (it'?s you|your identity)"),
      r("help us confirm (it'?s you|you own this account)"),
      r("we need to confirm"),
      r("security check"),
      r("enter the (security |login )?code"),
      r("upload a (photo|video selfie) of yourself"),
    ],
  },
  {
    reason: "update_required",
    patterns: [r("update (facebook|the app) to (continue|keep)"), r("this version of facebook (is )?no longer supported"), r("^update facebook$")],
  },
  { reason: "out_of_likes", patterns: [r("you'?re out of likes"), r("no likes left"), r("you'?ve used all your likes")] },
]

/** Facebook's sign-in screen: its buttons, at least two of them. */
const SIGNED_OUT_BUTTONS = [r("^log in$"), r("^create new account$"), r("^forgot password\\?$"), r("^log into another account$")]

/** The stop screen this is, with the words on it, or null when it is none of them. */
export function facebookStopScreen(screen: ScreenRead): StopScreen | null {
  if (screen.package !== FACEBOOK_PACKAGE) return null
  const words = allWords(screen)
  for (const { reason, patterns } of STOP_WORDS) {
    if (patterns.some((pattern) => pattern.test(words))) return { reason, words: words.slice(0, 1_000) }
  }
  const signedOut = SIGNED_OUT_BUTTONS.filter((pattern) => findNode(screen, { text: [pattern], desc: [pattern] }))
  if (signedOut.length >= 2) return { reason: "not_signed_in", words: words.slice(0, 1_000) }
  return null
}
