/**
 * The statuses the two review queues filter and label by.
 *
 * Both queues work the same way, so they share one file rather than each
 * growing its own copy of "what does pending_review mean". The lists are `as
 * const` because the address bar is checked against them: a hand-typed filter
 * that is not one of these falls back to showing everything rather than
 * throwing.
 */

export const REVIEW_STATUSES = [
  "pending_verification",
  "pending_review",
  "approved",
  "rejected",
] as const

export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

/**
 * What each status is called on screen.
 *
 * "Waiting on the sender" rather than "pending verification": the admin's
 * question is whose move it is, and that phrasing answers it without them
 * having to learn the word.
 */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending_verification: "Waiting on the sender",
  pending_review: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
}

export const EDIT_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const

export type EditRequestStatus = (typeof EDIT_REQUEST_STATUSES)[number]

export const EDIT_REQUEST_STATUS_LABELS: Record<EditRequestStatus, string> = {
  pending: "Needs review",
  approved: "Applied",
  rejected: "Rejected",
}

/** Which fields an owner may propose a change to, and what each is called. */
export const OWNER_EDITABLE_FIELDS = [
  { key: "title", label: "Name" },
  { key: "metaDescription", label: "Short description" },
  { key: "featuredImage", label: "Photo" },
  { key: "contactLinks", label: "Contact details" },
  { key: "body", label: "About this business" },
] as const

export type OwnerEditableField = (typeof OWNER_EDITABLE_FIELDS)[number]["key"]
