/**
 * The reasons a group can be reported (groups task 01, part 24), as a fixed
 * list, for the same reason a profile's are: a typed explanation is itself
 * something an operator has to read and moderate.
 *
 * What a stranger can see of a group is its name, its line and its public
 * page, so the reasons are about those. The stored id never changes even
 * when the wording does.
 */
export const GROUP_REPORT_REASONS = [
  { id: "words", label: "The name or line is abusive or hateful" },
  { id: "impersonation", label: "It is pretending to be someone else" },
  { id: "spam", label: "It is spam or an advert" },
  { id: "other", label: "Something else" },
] as const

export type GroupReportReasonId = (typeof GROUP_REPORT_REASONS)[number]["id"]

export const GROUP_REPORT_REASON_IDS = GROUP_REPORT_REASONS.map(
  (reason) => reason.id
) as [GroupReportReasonId, ...GroupReportReasonId[]]

export function groupReportReasonLabel(id: string) {
  return GROUP_REPORT_REASONS.find((reason) => reason.id === id)?.label ?? id
}

/** Reports one address may file an hour, the profile report's number. */
export const GROUP_REPORTS_PER_HOUR = 6

export const GROUP_REPORT_THANKS =
  "Thanks. Someone on our team will look at this group."
