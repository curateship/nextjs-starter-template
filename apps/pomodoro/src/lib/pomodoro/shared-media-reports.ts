/**
 * Reporting a shared file, and the copyright form for people with no
 * account (uploads-and-sharing task 05, parts 2 and 6). Browser-safe, so the
 * window and the server check the same list.
 *
 * Fixed reasons, for the reason profile reports have them: a typed
 * explanation is itself something an admin has to read and moderate. The
 * copyright form is the exception, because a rights holder has to say what
 * was copied.
 */

export const SHARED_FILE_REPORT_REASONS = [
  { id: "copyright", label: "Copyright: it copies someone else's work" },
  { id: "unsuitable", label: "Not suitable for the site" },
  { id: "broken", label: "Broken: it does not play or looks wrong" },
  { id: "other", label: "Something else" },
] as const

export type SharedFileReportReasonId =
  (typeof SHARED_FILE_REPORT_REASONS)[number]["id"]

export const SHARED_FILE_REPORT_REASON_IDS = SHARED_FILE_REPORT_REASONS.map(
  (reason) => reason.id
) as [SharedFileReportReasonId, ...SharedFileReportReasonId[]]

export function sharedFileReportReasonLabel(id: string) {
  return (
    SHARED_FILE_REPORT_REASONS.find((reason) => reason.id === id)?.label ?? id
  )
}

export const SHARED_FILE_REPORT_THANKS =
  "Thanks. Someone on our team will look at this file."

/** The copyright form's limits, matched by the form and the server. */
export const COPYRIGHT_NAME_MAX = 100
export const COPYRIGHT_EMAIL_MAX = 254
export const COPYRIGHT_URL_MAX = 500
export const COPYRIGHT_WORK_MAX = 2000

/** How many copyright reports one address may send an hour. */
export const COPYRIGHT_REPORTS_PER_HOUR = 5

export const COPYRIGHT_THANKS =
  "Thanks. We have your report and will answer by email, usually within a day."

/** The statement the sender ticks. Stored as the report's reason. */
export const COPYRIGHT_STATEMENT =
  "I own the rights to this work, or I am allowed to act for the person who does, and what I have said here is true."

/**
 * The shared file a pasted address points at, or null. Accepts the file's
 * own page in any of its spellings: with or without the site, a trailing
 * slash, or a query string.
 */
export function sharedFileFromAddress(address: string) {
  const match =
    /\/u\/([a-z0-9_-]{3,30})\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(
      address
    )
  return match
    ? { handle: match[1].toLowerCase(), mediaId: match[2].toLowerCase() }
    : null
}

/**
 * Why an admin took a file off sharing (task 05, part 4). The owner's bell
 * says the label, then the admin's own words when there are any.
 */
export const UNSHARE_REASONS = [
  { id: "copyright", label: "It copies someone else's work" },
  { id: "unsuitable", label: "It is not suitable for the site" },
  { id: "broken", label: "It is broken or very poor quality" },
  { id: "spam", label: "It is spam or an advert" },
  { id: "other", label: "Something else" },
] as const

export type UnshareReasonId = (typeof UNSHARE_REASONS)[number]["id"]

export const UNSHARE_REASON_IDS = UNSHARE_REASONS.map((reason) => reason.id) as [
  UnshareReasonId,
  ...UnshareReasonId[],
]

export const UNSHARE_NOTE_MAX = 200

/** The stored reason: the label, then the admin's note after a colon. */
export function unshareReasonText(id: UnshareReasonId, note: string) {
  const label = UNSHARE_REASONS.find((reason) => reason.id === id)?.label ?? id
  const extra = note.trim()
  return (extra ? `${label}: ${extra}` : label).slice(0, 300)
}

/** The sharing filter on the admin's Member uploads list. */
export const UPLOAD_SHARING_FILTERS = [
  "all",
  "shared",
  "waiting",
  "taken_down",
] as const

export type UploadSharingFilter = (typeof UPLOAD_SHARING_FILTERS)[number]
