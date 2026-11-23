export type PaidPurchaseStatus = 'pending' | 'succeeded' | 'failed' | 'canceled'

export function resolvePaidPurchaseStatus(
  current: PaidPurchaseStatus | null,
  incoming: PaidPurchaseStatus,
): PaidPurchaseStatus {
  return current === 'succeeded' ? 'succeeded' : incoming
}

export function shouldClaimPaidPurchaseFulfillment(
  status: PaidPurchaseStatus | null,
  emailSentAt: Date | null,
) {
  return status === 'succeeded' && emailSentAt === null
}
