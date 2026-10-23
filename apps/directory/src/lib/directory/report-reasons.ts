/**
 * What a visitor can say is wrong with a listing or an event, and what a
 * report's status is called.
 *
 * One file because three places need the same lists and must never disagree:
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

/**
 * An event has its own list, because "wrong opening hours" means nothing on a
 * one-night gig and "cancelled" means nothing on a shop. "other" is on both.
 */
export const EVENT_REPORT_REASONS = [
  "wrong_time",
  "cancelled",
  "wrong_place",
  "other",
] as const

export type EventReportReason = (typeof EVENT_REPORT_REASONS)[number]

export const EVENT_REPORT_REASON_LABELS: Record<EventReportReason, string> = {
  wrong_time: "Wrong date or time",
  cancelled: "Cancelled",
  wrong_place: "Wrong place",
  other: "Something else",
}

/**
 * A deal has its own list too: what goes wrong with a deal is at the counter,
 * not in the opening hours. "other" is on every list.
 */
export const PROMOTION_REPORT_REASONS = [
  "not_honoured",
  "ended",
  "wrong_details",
  "other",
] as const

export type PromotionReportReason = (typeof PROMOTION_REPORT_REASONS)[number]

export const PROMOTION_REPORT_REASON_LABELS: Record<
  PromotionReportReason,
  string
> = {
  not_honoured: "The deal wasn't honoured",
  ended: "It has ended",
  wrong_details: "Wrong details",
  other: "Something else",
}

/**
 * What a report is about. The queue shows every kind in one list. A deal is
 * stored as "promotion", its name in Admin; visitors and the queue say "Deal".
 */
export const REPORT_KINDS = ["listing", "event", "promotion"] as const

export type ReportKind = (typeof REPORT_KINDS)[number]

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  listing: "Listing",
  event: "Event",
  promotion: "Deal",
}

export type ReportReason =
  | ListingReportReason
  | EventReportReason
  | PromotionReportReason

/** Any stored reason's label, for the queue that shows every kind. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  ...LISTING_REPORT_REASON_LABELS,
  ...EVENT_REPORT_REASON_LABELS,
  ...PROMOTION_REPORT_REASON_LABELS,
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
