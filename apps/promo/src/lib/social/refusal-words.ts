/**
 * Refusals already written for the reader, which a dashboard's error lookup
 * shows word for word instead of swapping in a general sentence. Each names
 * the account, phone or proxy involved and what to do, which a lookup table
 * cannot.
 *
 * - "kept apart": important and throwaway accounts (`src/server/social/apart.ts`).
 * - "before it takes an account": a phone that needs wiping or setting up
 *   again (`src/server/phones/wipe.ts`).
 * - "before wiping": a phone with an account on it, or one on its way.
 * - "Move to a phone" and "being moved": the move from a browser profile to a
 *   phone (`src/server/social/move-to-phone.ts`).
 * - "yet: on a phone, the Reddit app": a Reddit step a phone does not do
 *   (`phoneStepRefusal` in `src/lib/phones/options.ts`).
 * - "Sign out of iCloud": an iPhone wipe refused while an Apple ID is signed
 *   in (`src/server/phones/wipe.ts`).
 * - The Bans task's (`src/server/bans/`): a phone kept off an app, a proxy
 *   in a ban, a throwaway going first, the Instagram and TikTok warm-up,
 *   half pace, the app-wide brake, the appeal, an unknown screen already
 *   answered, Clean up and a retire with no reason.
 */
const WRITTEN_FOR_THE_READER = [
  "kept apart",
  "before it takes an account",
  "before wiping",
  "Move to a phone",
  "is not being moved",
  "is already important",
  "has never been seen signed in",
  "not on a browser profile, so there is nothing to move",
  "one on its way. One Reddit account per phone",
  "self-test has not walked",
  "yet: on a phone, the Reddit app",
  "Sign out of iCloud",
  "Use another phone for",
  "was used by a banned",
  "from a throwaway",
  "is warming up, so it only scrolls",
  "Half pace",
  "bans in a day paused every",
  "is not paused",
  "already has an appeal",
  "Record the appeal first",
  "already has its answer",
  "already answered",
  "Only an account a ban stopped",
  "already retired, so there is nothing to clean up",
  "Pick why the account is retired",
  "That ban is not there any more",
]

/** The refusal's own words when it is one of these, or null. */
export function readerWrittenRefusal(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  return WRITTEN_FOR_THE_READER.some((words) => message.includes(words)) ? message : null
}

/** Wraps an error lookup so the refusals above pass through as they are. */
export function passReaderWritten(lookup: (error: unknown) => string): (error: unknown) => string {
  return (error) => readerWrittenRefusal(error) ?? lookup(error)
}
