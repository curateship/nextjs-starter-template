/**
 * Following, as the browser sees it.
 *
 * The cap exists for the same reason groups are capped at five and fifty: an
 * uncapped list is a list one account can use to follow every member. Tyler's
 * call, 2 Oct 2026 — 200 is far above what anybody reaches in normal use.
 */
export const MAX_FOLLOWING = 200

export const FOLLOWING_FULL_MESSAGE = `You can follow ${MAX_FOLLOWING} people. Unfollow somebody before adding another.`

/**
 * Every refusal a Follow can meet, in the sender's words.
 *
 * A profile that does not exist and one that has blocked you give the same
 * sentence on purpose. A different message for each would be a way to find
 * out you had been blocked.
 */
export function followErrorMessage(cause: unknown) {
  const text = cause instanceof Error ? cause.message : String(cause)
  if (text.includes("FOLLOWING_FULL")) return FOLLOWING_FULL_MESSAGE
  if (text.includes("CANNOT_FOLLOW_SELF")) return "You cannot follow yourself."
  if (text.includes("PROFILE_NOT_FOUND"))
    return "That profile is not available."
  return "That could not be saved. Try again."
}

/** The line a Following board shows somebody who follows nobody yet. */
export const FOLLOWING_EMPTY_MESSAGE =
  "You are not following anybody yet. Open somebody's profile and press Follow, and they will appear here."

/** The line on a board row for somebody who publishes no figures. */
export const FOLLOWING_NO_FIGURES =
  "publishes no figures"
