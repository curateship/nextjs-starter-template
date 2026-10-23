// Pure decision helpers for the abandoned-checkout recovery cron.
// Kept free of 'server-only' and DB imports so the cron route and the unit
// tests (checkout-recovery-core.test.ts) share the same rules — the same
// split directory-renewal-reminders.ts uses: SQL narrows, this decides.

import type { SiteSettings } from '@/lib/db/schema/sites'

/** How long a checkout sits unpaid before the one follow-up goes out. */
export const RECOVERY_DELAY_HOURS = 24

/**
 * Checkouts older than this never get emailed. Without it, the first run after
 * deploy would dig up every stale unpaid checkout ever recorded and email
 * people about carts they abandoned months ago.
 */
export const RECOVERY_MAX_AGE_DAYS = 7

/** Contact statuses that mean "do not email this person" for this site. */
export const SUPPRESSED_CONTACT_STATUSES = ['unsubscribed', 'bounced', 'complained'] as const

/** The site switch: on unless the owner explicitly turned it off. */
export function isRecoveryEnabled(settings: Pick<SiteSettings, 'checkout_recovery_enabled'> | null | undefined): boolean {
  return settings?.checkout_recovery_enabled !== false
}

export interface RecoveryCandidate {
  /** When the checkout was started (the pending order row's created_at). */
  createdAt: Date
  /** Already sent the one follow-up. */
  recoveryEmailSentAt: Date | null
  /** A succeeded order exists for the same email and product on this site. */
  hasCompletedPurchase: boolean
  /** This email's newsletter-contact status on the site, if a contact exists. */
  contactStatus: string | null
  /** The site's checkout-recovery switch (see isRecoveryEnabled). */
  recoveryEnabled: boolean
}

export type RecoverySkipReason =
  | 'disabled'
  | 'already_emailed'
  | 'completed_since'
  | 'suppressed'
  | 'too_recent'
  | 'too_old'

/**
 * Why this candidate must NOT be emailed right now, or null when the one
 * recovery email is due. The cron's SQL applies the same filters for
 * efficiency; this function is the authority the tests pin down.
 */
export function recoverySkipReason(candidate: RecoveryCandidate, now: Date): RecoverySkipReason | null {
  if (!candidate.recoveryEnabled) return 'disabled'
  if (candidate.recoveryEmailSentAt) return 'already_emailed'
  if (candidate.hasCompletedPurchase) return 'completed_since'
  if (
    candidate.contactStatus &&
    (SUPPRESSED_CONTACT_STATUSES as readonly string[]).includes(candidate.contactStatus)
  ) {
    return 'suppressed'
  }

  const HOUR_MS = 60 * 60 * 1000
  const ageMs = now.getTime() - candidate.createdAt.getTime()
  if (ageMs < RECOVERY_DELAY_HOURS * HOUR_MS) return 'too_recent'
  if (ageMs > RECOVERY_MAX_AGE_DAYS * 24 * HOUR_MS) return 'too_old'

  return null
}

/**
 * The path the email links back to. The checkout page needs its ?tier= to
 * show the payment form; without a usable tier it redirects to the product
 * page itself, so linking there directly is the honest fallback. Either way
 * the page starts a brand-new Stripe payment — nothing expired is reused.
 */
export function buildRecoveryCheckoutPath(productSlug: string, tierId: string | null | undefined): string {
  const base = `/products/${productSlug}`
  return tierId ? `${base}/checkout?tier=${encodeURIComponent(tierId)}` : base
}
