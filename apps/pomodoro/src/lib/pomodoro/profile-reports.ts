/**
 * The reasons a public profile can be reported, as a fixed list.
 *
 * Fixed rather than typed, for the same reason room reactions are five emoji
 * rather than free text: a typed explanation is itself something an operator
 * has to read and moderate, and a reader who has to write a sentence mostly
 * does not file the report at all.
 *
 * The stored id never changes even when the wording does. A renamed reason
 * must still read correctly on a report filed last month.
 */
export const PROFILE_REPORT_REASONS = [
  {
    id: "picture",
    label: "The picture should not be public",
  },
  {
    id: "words",
    label: "The words are abusive or hateful",
  },
  {
    id: "impersonation",
    label: "They are pretending to be someone else",
  },
  {
    id: "spam",
    label: "It is spam or an advert",
  },
  {
    id: "links",
    label: "The links go somewhere harmful",
  },
  {
    id: "other",
    label: "Something else",
  },
] as const

export type ProfileReportReasonId =
  (typeof PROFILE_REPORT_REASONS)[number]["id"]

export const PROFILE_REPORT_REASON_IDS = PROFILE_REPORT_REASONS.map(
  (reason) => reason.id
) as [ProfileReportReasonId, ...ProfileReportReasonId[]]

export function profileReportReasonLabel(id: string) {
  return (
    PROFILE_REPORT_REASONS.find((reason) => reason.id === id)?.label ?? id
  )
}

/**
 * How many reports one address may file an hour.
 *
 * A public page has no account to count against, so the count is by address.
 * Six is enough for somebody genuinely working through a few bad profiles and
 * nowhere near enough to bury the queue.
 */
export const PROFILE_REPORTS_PER_HOUR = 6

export const PROFILE_REPORT_THANKS =
  "Thanks. Someone on our team will look at this profile."
export const PROFILE_REPORT_RATE_LIMITED =
  "That is a lot of reports from one place. Try again in an hour."

/** What the owner of a hidden profile is told, on their own Settings card. */
export const PROFILE_HIDDEN_NOTICE =
  "Our team has hidden your public page after a report, so its address now shows nothing, as if it were switched off. Your focus record is untouched. Reply to a support email if you think this is wrong."
