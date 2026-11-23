/**
 * The tags a piece of feedback can carry — what part of the app it is about,
 * next to its type (suggestion, bug report…) which says what kind of note it
 * is. One fixed list, defined here once: the composer's chips, the board's
 * filter, the admin editor, the server's validation, and the database's own
 * check (`drizzle/0020_custom_shell_feedback_tags.sql`) all read from or
 * mirror this file, so adding a tag means touching this list and that
 * migration together.
 */

/** The order the tags are offered and read in, everywhere. */
export const FEEDBACK_TAGS = [
  "dashboard",
  "media",
  "automations",
  "account",
  "billing",
  "performance",
  "design",
] as const

export type FeedbackTag = (typeof FEEDBACK_TAGS)[number]

/** An item carries at most this many tags — enough to file it, too few to spam. */
export const MAX_FEEDBACK_TAGS = 3

export const feedbackTagLabels: Record<FeedbackTag, string> = {
  dashboard: "Dashboard",
  media: "Media",
  automations: "Automations",
  account: "Account",
  billing: "Billing",
  performance: "Performance",
  design: "Design",
}
