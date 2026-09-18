/**
 * What a visitor can say is wrong with a listing, and what a report's status
 * is called.
 *
 * One file because three places need the same list and must never disagree:
 * the picker on the public form, the server that checks what arrived, and the
 * admin queue that labels the row. A reason not on this list is refused rather
 * than stored, and the database carries the same list as a check constraint —
 * so a reason that got past the form still cannot get into the table.
 *
 * Browser-safe on purpose. The public form imports this, so nothing that
 * reaches the database may live here.
 */

export const LISTING_REPORT_REASONS = [
  "wrong_hours",
  "wrong_contact",
  "closed",
  "other",
] as const

export type ListingReportReason = (typeof LISTING_REPORT_REASONS)[number]

/**
 * Short enough for a table cell and plain enough for the picker, so there is
 * one wording rather than two that drift apart.
 */
export const LISTING_REPORT_REASON_LABELS: Record<
  ListingReportReason,
  string
> = {
  wrong_hours: "Wrong opening hours",
  wrong_contact: "Wrong phone or address",
  closed: "Closed for good",
  other: "Something else",
}

export const LISTING_REPORT_STATUSES = ["open", "fixed", "dismissed"] as const

export type ListingReportStatus = (typeof LISTING_REPORT_STATUSES)[number]

/**
 * "Waiting" rather than "open": the admin's question is whether anything is
 * left to do, and that word answers it without them learning a new one.
 */
export const LISTING_REPORT_STATUS_LABELS: Record<
  ListingReportStatus,
  string
> = {
  open: "Waiting",
  fixed: "Fixed",
  dismissed: "Dismissed",
}
