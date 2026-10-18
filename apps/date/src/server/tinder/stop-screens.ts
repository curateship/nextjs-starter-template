import { TINDER_PACKAGE, type StopReason } from "@/lib/dating/options"

import { allWords, findNode, type ScreenRead } from "./screen"

/**
 * The Tinder screens that stop everything until Tyler presses Resume on the
 * Phone screen: out of likes, a verification wall, an account under review,
 * a ban, an update Tinder insists on, and being signed out. Each walk checks
 * for them first and after every step that changes the screen.
 *
 * Read from the words on the screen, the same way as `screen-words.ts`, and
 * written before a real phone was read: the first real run is the proof.
 * Only a screen Tinder itself is showing counts, so another app's words can
 * never stop the phone.
 */

const r = (pattern: string) => new RegExp(pattern, "im")

const STOP_WORDS: Array<{ reason: Exclude<StopReason, "tinder_missing" | "not_signed_in">; patterns: RegExp[] }> = [
  { reason: "banned", patterns: [r("(you('?ve| have) been|account (has been|is)) (banned|suspended)"), r("^account banned$"), r("banned from tinder")] },
  { reason: "under_review", patterns: [r("(account|profile) is (under|being) review"), r("^under review$"), r("we'?re reviewing your account")] },
  {
    reason: "verification",
    patterns: [
      r("verify (it'?s you|your (account|profile|identity)|yourself)"),
      r("get (photo )?verified to (continue|keep)"),
      r("verification (is )?required"),
      r("complete (your )?(photo |selfie )?verification"),
      r("confirm (it'?s you|you'?re (a )?(real|human))"),
    ],
  },
  {
    reason: "update_required",
    patterns: [r("update required"), r("^update tinder$"), r("please update (tinder|the app)"), r("no longer supported"), r("update to (continue|keep)")],
  },
  { reason: "out_of_likes", patterns: [r("you'?re out of likes"), r("out of likes"), r("no likes left")] },
]

/** The sign-in screen: Tinder's welcome buttons, at least two of them. */
const SIGNED_OUT_BUTTONS = [r("^create account$"), r("^log in$"), r("^sign in$"), r("^sign in with google$"), r("^trouble (logging|signing) in\\?$")]

export type StopScreen = { reason: StopReason; words: string }

/** The stop screen this is, with the words on it, or null when it is none of them. */
export function stopScreen(screen: ScreenRead): StopScreen | null {
  if (screen.package !== TINDER_PACKAGE) return null
  const words = allWords(screen)
  for (const { reason, patterns } of STOP_WORDS) {
    if (patterns.some((pattern) => pattern.test(words))) return { reason, words: words.slice(0, 1_000) }
  }
  const signedOut = SIGNED_OUT_BUTTONS.filter((pattern) => findNode(screen, { text: [pattern], desc: [pattern] }))
  if (signedOut.length >= 2) return { reason: "not_signed_in", words: words.slice(0, 1_000) }
  return null
}

/** How long until Tinder gives likes again, from the timer in the out-of-likes screen's words, in seconds. */
export function outOfLikesWait(words: string): number | null {
  const timer = words.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/)
  if (!timer) return null
  return Number(timer[1]) * 3600 + Number(timer[2]) * 60 + Number(timer[3])
}
