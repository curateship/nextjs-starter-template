/**
 * Where a deal or change an owner sent stands in the admin's queue. Named
 * here, not in the API file, because the browser's Deals from owners row and
 * the server's door both read it.
 */
export const PROMOTION_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const

export type PromotionRequestStatus = (typeof PROMOTION_REQUEST_STATUSES)[number]
