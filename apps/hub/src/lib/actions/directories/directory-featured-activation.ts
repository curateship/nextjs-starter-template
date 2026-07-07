import 'server-only'

import { revalidateTag, unstable_cache } from 'next/cache'
import { and, eq, gt, lte, or, sql } from 'drizzle-orm'

import { createHubNotificationForSuperAdmins } from '@/lib/actions/notifications/notification-service'
import { db } from '@/lib/db'
import {
  directories,
  directoryClaims,
  directoryFeaturedEntitlements,
  directoryFeaturedPlans,
} from '@/lib/db/schema'
import { UUID_REGEX } from '@/lib/utils/validation'

export const DIRECTORY_FEATURED_COMMERCE_TYPE = 'directory_featured_upgrade'

const DAY_MS = 24 * 60 * 60 * 1000

export function isDirectoryFeaturedPurchaseMetadata(metadata: Record<string, string | undefined> | null | undefined) {
  return metadata?.commerceType === DIRECTORY_FEATURED_COMMERCE_TYPE
}

/**
 * SQL lateral join exposing active paid Featured placement for a directory row
 * as `featured.priority`. An entitlement only counts while it is unexpired,
 * unrevoked, and its claim is still approved for the same owner. Returns the
 * highest plan priority so featured listings can rank among themselves.
 */
export function getDirectoryFeaturedJoin(directoryAlias: ReturnType<typeof sql>) {
  return sql`
    left join lateral (
      select max(dfp.priority) as priority
      from directory_featured_entitlements dfe
      inner join directory_featured_plans dfp on dfp.id = dfe.plan_id
      inner join directory_claims dc
        on dc.id = dfe.claim_id
        and dc.status = 'approved'
        and dc.user_id = dfe.user_id
        and dc.directory_id = dfe.directory_id
      where dfe.directory_id = ${directoryAlias}.id
        and dfe.site_id = ${directoryAlias}.site_id
        and dfe.status = 'active'
        and dfe.starts_at <= now()
        and dfe.ends_at > now()
    ) featured on true
  `
}

// Entitlement is unexpired and unrevoked (drizzle mirror of the SQL join above)
export function activeEntitlementConditions() {
  return [
    eq(directoryFeaturedEntitlements.status, 'active'),
    lte(directoryFeaturedEntitlements.startsAt, sql`now()`),
    gt(directoryFeaturedEntitlements.endsAt, sql`now()`),
  ]
}

/**
 * When the directory's active Featured entitlement ends, or null when it has
 * none. Cached hourly; callers should still compare the timestamp against the
 * current time so an entitlement that expired inside the cache window
 * immediately stops rendering as featured.
 */
export function getDirectoryFeaturedUntil(siteId: string, directoryId: string): Promise<string | null> {
  return unstable_cache(
    async () => {
      const [row] = await db
        .select({ endsAt: sql<string | Date | null>`max(${directoryFeaturedEntitlements.endsAt})` })
        .from(directoryFeaturedEntitlements)
        .innerJoin(directoryClaims, and(
          eq(directoryClaims.id, directoryFeaturedEntitlements.claimId),
          eq(directoryClaims.status, 'approved'),
          eq(directoryClaims.userId, directoryFeaturedEntitlements.userId),
          eq(directoryClaims.directoryId, directoryFeaturedEntitlements.directoryId)
        ))
        .where(and(
          eq(directoryFeaturedEntitlements.siteId, siteId),
          eq(directoryFeaturedEntitlements.directoryId, directoryId),
          ...activeEntitlementConditions()
        ))

      return row?.endsAt ? new Date(row.endsAt).toISOString() : null
    },
    ['directory-featured-until-v1', siteId, directoryId],
    {
      revalidate: 3600,
      tags: ['directory', `directory-${directoryId}`, `site-${siteId}`, 'all'],
    }
  )()
}

export function revalidateDirectoryFeaturedCaches(siteId: string, directoryId: string) {
  revalidateTag('directory')
  revalidateTag('listing-views')
  revalidateTag(`directory-${directoryId}`)
  revalidateTag(`site-${siteId}`)
}

/**
 * Activate a paid Featured entitlement from a completed Stripe payment.
 *
 * Every metadata field is treated as untrusted and re-validated against the
 * database. Idempotent by Stripe session ID and payment intent ID: duplicate
 * webhook deliveries (or the webhook racing the success-redirect confirmation)
 * activate at most one entitlement.
 */
export async function activateDirectoryFeaturedEntitlement(params: {
  // Site resolved from the verified webhook signature (or server-side session lookup)
  siteId: string
  metadata: Record<string, string | undefined> | null | undefined
  paymentStatus: string | null | undefined
  stripeSessionId?: string | null
  stripePaymentIntentId?: string | null
  amountTotal?: number | null
  currency?: string | null
}): Promise<{ activated: boolean; alreadyProcessed: boolean; error: string | null }> {
  const { siteId, metadata } = params

  if (!isDirectoryFeaturedPurchaseMetadata(metadata)) {
    return { activated: false, alreadyProcessed: false, error: 'Not a directory featured purchase' }
  }
  if (params.paymentStatus !== 'paid') {
    return { activated: false, alreadyProcessed: false, error: 'Payment is not completed' }
  }

  const directoryId = metadata?.directoryId || ''
  const claimId = metadata?.claimId || ''
  const planId = metadata?.planId || ''
  const userId = metadata?.userId || ''
  const metadataSiteId = metadata?.siteId || ''

  if (
    !UUID_REGEX.test(siteId) ||
    metadataSiteId !== siteId ||
    !UUID_REGEX.test(directoryId) ||
    !UUID_REGEX.test(claimId) ||
    !UUID_REGEX.test(planId) ||
    !userId
  ) {
    return { activated: false, alreadyProcessed: false, error: 'Invalid purchase metadata' }
  }

  const stripeSessionId = params.stripeSessionId || null
  const stripePaymentIntentId = params.stripePaymentIntentId || null
  if (!stripeSessionId && !stripePaymentIntentId) {
    return { activated: false, alreadyProcessed: false, error: 'Missing Stripe payment reference' }
  }

  // or() ignores undefined conditions, and the both-null case returned above
  const [existing] = await db
    .select({ id: directoryFeaturedEntitlements.id })
    .from(directoryFeaturedEntitlements)
    .where(or(
      stripeSessionId ? eq(directoryFeaturedEntitlements.stripeSessionId, stripeSessionId) : undefined,
      stripePaymentIntentId ? eq(directoryFeaturedEntitlements.stripePaymentIntentId, stripePaymentIntentId) : undefined
    ))
    .limit(1)

  if (existing) {
    return { activated: false, alreadyProcessed: true, error: null }
  }

  const [row] = await db
    .select({
      claim: {
        id: directoryClaims.id,
        status: directoryClaims.status,
      },
      directory: {
        id: directories.id,
        title: directories.title,
        slug: directories.slug,
        status: directories.status,
      },
      plan: {
        id: directoryFeaturedPlans.id,
        name: directoryFeaturedPlans.name,
        durationDays: directoryFeaturedPlans.durationDays,
      },
    })
    .from(directoryClaims)
    .innerJoin(directories, eq(directories.id, directoryClaims.directoryId))
    .innerJoin(directoryFeaturedPlans, and(
      eq(directoryFeaturedPlans.id, planId),
      eq(directoryFeaturedPlans.siteId, siteId)
    ))
    .where(and(
      eq(directoryClaims.id, claimId),
      eq(directoryClaims.siteId, siteId),
      eq(directoryClaims.directoryId, directoryId),
      eq(directoryClaims.userId, userId),
      eq(directoryClaims.status, 'approved')
    ))
    .limit(1)

  if (!row || row.directory.status !== 'published') {
    console.error('Directory featured activation rejected: metadata does not match an approved claim', {
      siteId,
      directoryId,
      claimId,
      planId,
      stripeSessionId,
      stripePaymentIntentId,
    })
    return { activated: false, alreadyProcessed: false, error: 'Purchase does not match an approved listing claim' }
  }

  const now = new Date()
  const endsAt = new Date(now.getTime() + row.plan.durationDays * DAY_MS)

  let entitlementId: string
  try {
    const [entitlement] = await db.insert(directoryFeaturedEntitlements).values({
      siteId,
      directoryId,
      claimId,
      userId,
      planId,
      stripeSessionId,
      stripePaymentIntentId,
      amountTotal: params.amountTotal ?? null,
      currency: params.currency || null,
      status: 'active',
      startsAt: now,
      endsAt,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: directoryFeaturedEntitlements.id })
    entitlementId = entitlement.id
  } catch (error) {
    // Unique session/payment-intent index hit: another delivery activated it first
    const code = (error as { code?: string })?.code
    if (code === '23505') {
      return { activated: false, alreadyProcessed: true, error: null }
    }
    throw error
  }

  revalidateDirectoryFeaturedCaches(siteId, directoryId)

  try {
    await createHubNotificationForSuperAdmins({
      type: 'directory_featured',
      siteId,
      sourceId: entitlementId,
      title: 'Featured listing upgrade purchased',
      message: `${row.directory.title} is now featured via the ${row.plan.name} plan.`,
      targetHref: '/admin/directory/monetization',
      metadata: {
        directory_id: directoryId,
        directory_slug: row.directory.slug,
        plan_id: planId,
      },
    })
  } catch (error) {
    console.error('Failed to create featured upgrade notification:', error)
  }

  return { activated: true, alreadyProcessed: false, error: null }
}
