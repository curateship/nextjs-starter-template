'use server'

import Stripe from 'stripe'
import { and, asc, desc, eq, gt, gte, lte, sql } from 'drizzle-orm'

import {
  activateDirectoryFeaturedEntitlement,
  activeEntitlementConditions,
  DIRECTORY_FEATURED_COMMERCE_TYPE,
  revalidateDirectoryFeaturedCaches,
} from '@/lib/actions/directories/directory-featured-activation'
import { sanitizeReturnPath } from '@/lib/actions/directories/directory-featured-helpers'
import {
  buildDirectoryRevenueCurrencySummaries,
  EXPIRING_SOON_DAYS,
  revenueChartWindowStart,
  type DirectoryRevenueCurrencySummary,
} from '@/lib/actions/directories/directory-revenue-summary'
import { getStripeConfig } from '@/lib/actions/integrations/config-helpers'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import {
  authUsers,
  directories,
  directoryClaims,
  directoryFeaturedEntitlements,
  directoryFeaturedPlans,
  sites,
} from '@/lib/db/schema'
import { isPersistentRateLimited } from '@/lib/utils/rate-limit'
import { getSiteUrl } from '@/lib/utils/site-url-generator'
import { UUID_REGEX } from '@/lib/utils/validation'

export type DirectoryFeaturedEntitlementStatus = 'active' | 'expired' | 'revoked'

export interface DirectoryFeaturedPlanItem {
  id: string
  site_id: string
  name: string
  description: string | null
  stripe_price_id: string
  duration_days: number
  priority: number
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface DirectoryFeaturedEntitlementListItem {
  id: string
  directory_id: string
  directory_title: string
  directory_slug: string
  owner_email: string
  owner_name: string | null
  plan_name: string
  amount_total: number | null
  currency: string | null
  status: DirectoryFeaturedEntitlementStatus
  starts_at: string
  ends_at: string
  revoked_at: string | null
  revoke_note: string | null
  created_at: string
}

export interface MyDirectoryFeaturedUpgradePlan {
  id: string
  name: string
  description: string | null
  duration_days: number
  amount: number | null
  currency: string | null
}

const STRIPE_API_VERSION = '2025-10-29.clover' as const
const STRIPE_PRICE_ID_REGEX = /^price_[A-Za-z0-9_]+$/
const STRIPE_SESSION_ID_REGEX = /^cs_[A-Za-z0-9_]+$/
const ENTITLEMENT_STATUSES: DirectoryFeaturedEntitlementStatus[] = ['active', 'expired', 'revoked']
const MAX_DURATION_DAYS = 3650
const MAX_PRIORITY = 1000

function nowIso(value?: Date | null) {
  return value ? value.toISOString() : null
}

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/<[^>]*>?/gm, '').replace(/[<>"]/g, '').slice(0, maxLength)
}

function sanitizeOptionalText(value: unknown, maxLength: number) {
  const sanitized = sanitizeText(value, maxLength)
  return sanitized || null
}

function toPositiveInt(value: unknown, max: number) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(numeric)) return null
  const rounded = Math.round(numeric)
  return rounded >= 1 && rounded <= max ? rounded : null
}

function toBoundedInt(value: unknown, max: number, fallback: number) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(0, Math.round(numeric)))
}

async function requireSuperAdmin() {
  const user = await getAuthenticatedUser()
  if (!user || user.role !== 'super_admin') return null
  return user
}

async function getStripeClient(siteId: string) {
  const config = await getStripeConfig(siteId)
  if (!config) return null
  return new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION })
}

function planToItem(row: typeof directoryFeaturedPlans.$inferSelect): DirectoryFeaturedPlanItem {
  return {
    id: row.id,
    site_id: row.siteId,
    name: row.name,
    description: row.description,
    stripe_price_id: row.stripePriceId,
    duration_days: row.durationDays,
    priority: row.priority,
    is_active: row.isActive,
    display_order: row.displayOrder,
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

const derivedEntitlementStatus = sql<DirectoryFeaturedEntitlementStatus>`
  case
    when ${directoryFeaturedEntitlements.status} = 'revoked' then 'revoked'
    when ${directoryFeaturedEntitlements.endsAt} <= now() then 'expired'
    else 'active'
  end
`

// --- Admin: Featured plans ---

export async function getDirectoryFeaturedPlansAction(siteId: string): Promise<{
  data: DirectoryFeaturedPlanItem[]
  error: string | null
}> {
  if (!UUID_REGEX.test(siteId)) return { data: [], error: 'Invalid site ID' }

  const user = await requireSuperAdmin()
  if (!user) return { data: [], error: 'Access denied' }

  const rows = await db
    .select()
    .from(directoryFeaturedPlans)
    .where(eq(directoryFeaturedPlans.siteId, siteId))
    .orderBy(desc(directoryFeaturedPlans.isActive), asc(directoryFeaturedPlans.displayOrder), asc(directoryFeaturedPlans.createdAt))

  return { data: rows.map(planToItem), error: null }
}

export async function saveDirectoryFeaturedPlanAction(input: {
  siteId: string
  planId?: string | null
  name: string
  description?: string | null
  stripePriceId: string
  durationDays: number | string
  priority?: number | string
  displayOrder?: number | string
}): Promise<{ success: boolean; error: string | null }> {
  if (!UUID_REGEX.test(input.siteId)) return { success: false, error: 'Invalid site ID' }
  if (input.planId && !UUID_REGEX.test(input.planId)) return { success: false, error: 'Invalid plan ID' }

  const user = await requireSuperAdmin()
  if (!user) return { success: false, error: 'Access denied' }

  const name = sanitizeText(input.name, 120)
  const description = sanitizeOptionalText(input.description, 1000)
  const stripePriceId = typeof input.stripePriceId === 'string' ? input.stripePriceId.trim() : ''
  const durationDays = toPositiveInt(input.durationDays, MAX_DURATION_DAYS)
  const priority = toBoundedInt(input.priority, MAX_PRIORITY, 0)
  const displayOrder = toBoundedInt(input.displayOrder, 10000, 0)

  if (!name) return { success: false, error: 'Enter a plan name' }
  if (!STRIPE_PRICE_ID_REGEX.test(stripePriceId)) {
    return { success: false, error: 'Enter a valid Stripe price ID (starts with "price_")' }
  }
  if (!durationDays) {
    return { success: false, error: `Duration must be between 1 and ${MAX_DURATION_DAYS} days` }
  }

  const now = new Date()

  if (input.planId) {
    const [updated] = await db
      .update(directoryFeaturedPlans)
      .set({ name, description, stripePriceId, durationDays, priority, displayOrder, updatedAt: now })
      .where(and(
        eq(directoryFeaturedPlans.id, input.planId),
        eq(directoryFeaturedPlans.siteId, input.siteId)
      ))
      .returning({ id: directoryFeaturedPlans.id })

    if (!updated) return { success: false, error: 'Plan not found' }
    return { success: true, error: null }
  }

  await db.insert(directoryFeaturedPlans).values({
    siteId: input.siteId,
    name,
    description,
    stripePriceId,
    durationDays,
    priority,
    displayOrder,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })

  return { success: true, error: null }
}

export async function setDirectoryFeaturedPlanArchivedAction(input: {
  siteId: string
  planId: string
  archived: boolean
}): Promise<{ success: boolean; error: string | null }> {
  if (!UUID_REGEX.test(input.siteId) || !UUID_REGEX.test(input.planId)) {
    return { success: false, error: 'Invalid plan ID' }
  }

  const user = await requireSuperAdmin()
  if (!user) return { success: false, error: 'Access denied' }

  const [updated] = await db
    .update(directoryFeaturedPlans)
    .set({ isActive: input.archived !== true, updatedAt: new Date() })
    .where(and(
      eq(directoryFeaturedPlans.id, input.planId),
      eq(directoryFeaturedPlans.siteId, input.siteId)
    ))
    .returning({ id: directoryFeaturedPlans.id })

  if (!updated) return { success: false, error: 'Plan not found' }
  return { success: true, error: null }
}

// --- Admin: Featured entitlements ---

export async function getDirectoryFeaturedEntitlementsAction(siteId: string, status?: DirectoryFeaturedEntitlementStatus): Promise<{
  data: DirectoryFeaturedEntitlementListItem[]
  counts: Record<DirectoryFeaturedEntitlementStatus, number>
  error: string | null
}> {
  const emptyCounts = { active: 0, expired: 0, revoked: 0 }

  if (!UUID_REGEX.test(siteId)) return { data: [], counts: emptyCounts, error: 'Invalid site ID' }
  if (status && !ENTITLEMENT_STATUSES.includes(status)) {
    return { data: [], counts: emptyCounts, error: 'Invalid entitlement status' }
  }

  const user = await requireSuperAdmin()
  if (!user) return { data: [], counts: emptyCounts, error: 'Access denied' }

  const [countRows, rows] = await Promise.all([
    db
      .select({ status: derivedEntitlementStatus, count: sql<number>`count(*)::int` })
      .from(directoryFeaturedEntitlements)
      .where(eq(directoryFeaturedEntitlements.siteId, siteId))
      .groupBy(derivedEntitlementStatus),
    db
      .select({
        entitlement: directoryFeaturedEntitlements,
        derivedStatus: derivedEntitlementStatus,
        directoryTitle: directories.title,
        directorySlug: directories.slug,
        ownerEmail: authUsers.email,
        ownerName: authUsers.name,
        ownerDisplayName: authUsers.displayName,
        planName: directoryFeaturedPlans.name,
      })
      .from(directoryFeaturedEntitlements)
      .innerJoin(directories, eq(directories.id, directoryFeaturedEntitlements.directoryId))
      .innerJoin(authUsers, eq(authUsers.id, directoryFeaturedEntitlements.userId))
      .innerJoin(directoryFeaturedPlans, eq(directoryFeaturedPlans.id, directoryFeaturedEntitlements.planId))
      .where(status
        ? and(eq(directoryFeaturedEntitlements.siteId, siteId), sql`${derivedEntitlementStatus} = ${status}`)
        : eq(directoryFeaturedEntitlements.siteId, siteId)
      )
      .orderBy(desc(directoryFeaturedEntitlements.createdAt))
      .limit(100),
  ])

  const counts = { ...emptyCounts }
  for (const row of countRows) {
    counts[row.status] = row.count
  }

  return {
    counts,
    error: null,
    data: rows.map((row) => ({
      id: row.entitlement.id,
      directory_id: row.entitlement.directoryId,
      directory_title: row.directoryTitle,
      directory_slug: row.directorySlug,
      owner_email: row.ownerEmail,
      owner_name: row.ownerDisplayName ?? row.ownerName ?? null,
      plan_name: row.planName,
      amount_total: row.entitlement.amountTotal,
      currency: row.entitlement.currency,
      status: row.derivedStatus,
      starts_at: row.entitlement.startsAt.toISOString(),
      ends_at: row.entitlement.endsAt.toISOString(),
      revoked_at: nowIso(row.entitlement.revokedAt),
      revoke_note: row.entitlement.revokeNote,
      created_at: row.entitlement.createdAt?.toISOString() ?? '',
    })),
  }
}

export interface DirectoryFeaturedExpiringItem {
  id: string
  directory_id: string
  directory_title: string
  directory_slug: string
  owner_email: string
  owner_name: string | null
  plan_name: string
  amount_total: number | null
  currency: string | null
  ends_at: string
}

export interface DirectoryFeaturedRevenueSummary {
  currencies: DirectoryRevenueCurrencySummary[]
  activeCount: number
  expiringCount: number
  expiringSoon: DirectoryFeaturedExpiringItem[]
  error: string | null
}

const EXPIRING_SOON_LIMIT = 50

export async function getDirectoryFeaturedRevenueSummaryAction(siteId: string): Promise<DirectoryFeaturedRevenueSummary> {
  const empty = { currencies: [], activeCount: 0, expiringCount: 0, expiringSoon: [] }

  if (!UUID_REGEX.test(siteId)) return { ...empty, error: 'Invalid site ID' }

  const user = await requireSuperAdmin()
  if (!user) return { ...empty, error: 'Access denied' }

  const now = new Date()
  // Revenue counts every completed purchase (revoked placements stay counted;
  // refunds are handled manually in Stripe and never recorded here).
  const monthExpr = sql<string>`to_char(${directoryFeaturedEntitlements.createdAt} at time zone 'UTC', 'YYYY-MM')`
  const paidSaleConditions = [
    eq(directoryFeaturedEntitlements.siteId, siteId),
    sql`${directoryFeaturedEntitlements.amountTotal} is not null`,
  ]
  // Matches derivedEntitlementStatus 'active' so the stat agrees with the table counts.
  const activeConditions = [
    eq(directoryFeaturedEntitlements.siteId, siteId),
    eq(directoryFeaturedEntitlements.status, 'active'),
    gt(directoryFeaturedEntitlements.endsAt, sql`now()`),
  ]

  const [monthlyRows, totalRows, [countsRow], expiringRows] = await Promise.all([
    db
      .select({
        month: monthExpr,
        currency: directoryFeaturedEntitlements.currency,
        revenue: sql<number>`sum(${directoryFeaturedEntitlements.amountTotal})::int`,
        purchases: sql<number>`count(*)::int`,
      })
      .from(directoryFeaturedEntitlements)
      .where(and(...paidSaleConditions, gte(directoryFeaturedEntitlements.createdAt, revenueChartWindowStart(now))))
      .groupBy(monthExpr, directoryFeaturedEntitlements.currency),
    db
      .select({
        currency: directoryFeaturedEntitlements.currency,
        revenue: sql<number>`sum(${directoryFeaturedEntitlements.amountTotal})::int`,
        purchases: sql<number>`count(*)::int`,
      })
      .from(directoryFeaturedEntitlements)
      .where(and(...paidSaleConditions))
      .groupBy(directoryFeaturedEntitlements.currency),
    db
      .select({
        active: sql<number>`count(*)::int`,
        expiring: sql<number>`count(*) filter (where ${directoryFeaturedEntitlements.endsAt} <= now() + make_interval(days => ${EXPIRING_SOON_DAYS}))::int`,
      })
      .from(directoryFeaturedEntitlements)
      .where(and(...activeConditions)),
    db
      .select({
        id: directoryFeaturedEntitlements.id,
        directoryId: directoryFeaturedEntitlements.directoryId,
        directoryTitle: directories.title,
        directorySlug: directories.slug,
        ownerEmail: authUsers.email,
        ownerName: authUsers.name,
        ownerDisplayName: authUsers.displayName,
        planName: directoryFeaturedPlans.name,
        amountTotal: directoryFeaturedEntitlements.amountTotal,
        currency: directoryFeaturedEntitlements.currency,
        endsAt: directoryFeaturedEntitlements.endsAt,
      })
      .from(directoryFeaturedEntitlements)
      .innerJoin(directories, eq(directories.id, directoryFeaturedEntitlements.directoryId))
      .innerJoin(authUsers, eq(authUsers.id, directoryFeaturedEntitlements.userId))
      .innerJoin(directoryFeaturedPlans, eq(directoryFeaturedPlans.id, directoryFeaturedEntitlements.planId))
      .where(and(
        ...activeConditions,
        lte(directoryFeaturedEntitlements.endsAt, sql`now() + make_interval(days => ${EXPIRING_SOON_DAYS})`)
      ))
      .orderBy(asc(directoryFeaturedEntitlements.endsAt))
      .limit(EXPIRING_SOON_LIMIT),
  ])

  return {
    currencies: buildDirectoryRevenueCurrencySummaries({ monthlyRows, totalRows, now }),
    activeCount: countsRow?.active ?? 0,
    expiringCount: countsRow?.expiring ?? 0,
    error: null,
    expiringSoon: expiringRows.map((row) => ({
      id: row.id,
      directory_id: row.directoryId,
      directory_title: row.directoryTitle,
      directory_slug: row.directorySlug,
      owner_email: row.ownerEmail,
      owner_name: row.ownerDisplayName ?? row.ownerName ?? null,
      plan_name: row.planName,
      amount_total: row.amountTotal,
      currency: row.currency,
      ends_at: row.endsAt.toISOString(),
    })),
  }
}

export async function revokeDirectoryFeaturedEntitlementAction(input: {
  siteId: string
  entitlementId: string
  note?: string
}): Promise<{ success: boolean; error: string | null }> {
  if (!UUID_REGEX.test(input.siteId) || !UUID_REGEX.test(input.entitlementId)) {
    return { success: false, error: 'Invalid entitlement ID' }
  }

  const user = await requireSuperAdmin()
  if (!user) return { success: false, error: 'Access denied' }

  const now = new Date()
  const [updated] = await db
    .update(directoryFeaturedEntitlements)
    .set({
      status: 'revoked',
      revokedByUserId: user.id,
      revokedAt: now,
      revokeNote: sanitizeOptionalText(input.note, 1000),
      updatedAt: now,
    })
    .where(and(
      eq(directoryFeaturedEntitlements.id, input.entitlementId),
      eq(directoryFeaturedEntitlements.siteId, input.siteId),
      eq(directoryFeaturedEntitlements.status, 'active')
    ))
    .returning({ directoryId: directoryFeaturedEntitlements.directoryId })

  if (!updated) return { success: false, error: 'Active entitlement not found' }

  revalidateDirectoryFeaturedCaches(input.siteId, updated.directoryId)
  return { success: true, error: null }
}

// --- Owner: upgrade options + checkout ---

export async function getMyDirectoryFeaturedUpgradeStateAction(siteId: string, directoryId: string): Promise<{
  stripeConfigured: boolean
  featuredUntil: string | null
  activePlanName: string | null
  plans: MyDirectoryFeaturedUpgradePlan[]
  error: string | null
}> {
  const emptyState = { stripeConfigured: false, featuredUntil: null, activePlanName: null, plans: [] }

  if (!UUID_REGEX.test(siteId) || !UUID_REGEX.test(directoryId)) {
    return { ...emptyState, error: 'Invalid listing ID' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { ...emptyState, error: 'Authentication required' }

  // Each call makes live Stripe price lookups — cap per-user abuse
  if (await isPersistentRateLimited(`dir-featured-state:${user.id}`, 60, 10 * 60 * 1000)) {
    return { ...emptyState, error: 'Too many requests. Please try again shortly.' }
  }

  const [claim] = await db
    .select({ id: directoryClaims.id })
    .from(directoryClaims)
    .where(and(
      eq(directoryClaims.siteId, siteId),
      eq(directoryClaims.directoryId, directoryId),
      eq(directoryClaims.userId, user.id),
      eq(directoryClaims.status, 'approved')
    ))
    .limit(1)

  if (!claim) return { ...emptyState, error: 'Approved claim required' }

  const [[current], planRows, stripeConfig] = await Promise.all([
    db
      .select({
        endsAt: directoryFeaturedEntitlements.endsAt,
        planName: directoryFeaturedPlans.name,
      })
      .from(directoryFeaturedEntitlements)
      .innerJoin(directoryFeaturedPlans, eq(directoryFeaturedPlans.id, directoryFeaturedEntitlements.planId))
      .where(and(
        eq(directoryFeaturedEntitlements.siteId, siteId),
        eq(directoryFeaturedEntitlements.directoryId, directoryId),
        ...activeEntitlementConditions()
      ))
      .orderBy(desc(directoryFeaturedPlans.priority), desc(directoryFeaturedEntitlements.endsAt))
      .limit(1),
    db
      .select()
      .from(directoryFeaturedPlans)
      .where(and(
        eq(directoryFeaturedPlans.siteId, siteId),
        eq(directoryFeaturedPlans.isActive, true)
      ))
      .orderBy(asc(directoryFeaturedPlans.displayOrder), asc(directoryFeaturedPlans.createdAt)),
    getStripeConfig(siteId).catch(() => null),
  ])

  const stripe = stripeConfig ? new Stripe(stripeConfig.secretKey, { apiVersion: STRIPE_API_VERSION }) : null
  const plans = await Promise.all(planRows.map(async (plan): Promise<MyDirectoryFeaturedUpgradePlan> => {
    let amount: number | null = null
    let currency: string | null = null

    if (stripe) {
      try {
        const price = await stripe.prices.retrieve(plan.stripePriceId)
        amount = price.unit_amount ?? null
        currency = price.currency ?? null
      } catch (error) {
        console.error('Failed to load Stripe price for featured plan:', plan.id, error)
      }
    }

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      duration_days: plan.durationDays,
      amount,
      currency,
    }
  }))

  return {
    stripeConfigured: Boolean(stripeConfig),
    featuredUntil: nowIso(current?.endsAt ?? null),
    activePlanName: current?.planName ?? null,
    plans,
    error: null,
  }
}

export async function createDirectoryFeaturedCheckoutAction(input: {
  siteId: string
  directoryId: string
  planId: string
  returnPath?: string
}): Promise<{ success: boolean; url?: string; error: string | null }> {
  if (!UUID_REGEX.test(input.siteId) || !UUID_REGEX.test(input.directoryId) || !UUID_REGEX.test(input.planId)) {
    return { success: false, error: 'Invalid upgrade request' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Authentication required' }

  // Each call creates a real Stripe Checkout session — cap per-user abuse
  if (await isPersistentRateLimited(`dir-featured-checkout:${user.id}`, 5, 10 * 60 * 1000)) {
    return { success: false, error: 'Too many checkout attempts. Please try again shortly.' }
  }

  const [row] = await db
    .select({
      claimId: directoryClaims.id,
      directoryStatus: directories.status,
      site: {
        subdomain: sites.subdomain,
        customDomain: sites.customDomain,
      },
    })
    .from(directoryClaims)
    .innerJoin(directories, eq(directories.id, directoryClaims.directoryId))
    .innerJoin(sites, eq(sites.id, directoryClaims.siteId))
    .where(and(
      eq(directoryClaims.siteId, input.siteId),
      eq(directoryClaims.directoryId, input.directoryId),
      eq(directoryClaims.userId, user.id),
      eq(directoryClaims.status, 'approved')
    ))
    .limit(1)

  if (!row || row.directoryStatus !== 'published') {
    return { success: false, error: 'Approved claim required' }
  }

  const [plan] = await db
    .select({ id: directoryFeaturedPlans.id, stripePriceId: directoryFeaturedPlans.stripePriceId })
    .from(directoryFeaturedPlans)
    .where(and(
      eq(directoryFeaturedPlans.id, input.planId),
      eq(directoryFeaturedPlans.siteId, input.siteId),
      eq(directoryFeaturedPlans.isActive, true)
    ))
    .limit(1)

  if (!plan) return { success: false, error: 'Upgrade plan not found' }

  const stripe = await getStripeClient(input.siteId)
  if (!stripe) {
    return { success: false, error: 'Stripe is not configured for this site. Add your Stripe keys in site Integration settings.' }
  }

  const siteUrl = getSiteUrl({ subdomain: row.site.subdomain, customDomain: row.site.customDomain })
  const returnPath = sanitizeReturnPath(input.returnPath)
  const metadata = {
    commerceType: DIRECTORY_FEATURED_COMMERCE_TYPE,
    siteId: input.siteId,
    directoryId: input.directoryId,
    claimId: row.claimId,
    planId: plan.id,
    userId: user.id,
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      customer_email: user.email || undefined,
      success_url: `${siteUrl}${returnPath}?featured_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}${returnPath}?featured_checkout=cancelled`,
      metadata,
      payment_intent_data: { metadata },
    })

    if (!session.url) return { success: false, error: 'Stripe did not return a checkout URL' }
    return { success: true, url: session.url, error: null }
  } catch (error) {
    console.error('Error creating featured upgrade checkout session:', error)
    return { success: false, error: 'Failed to start checkout. Please try again.' }
  }
}

/**
 * Confirm a featured upgrade after the Stripe success redirect.
 *
 * The session ID comes from the client, so nothing is trusted from it directly:
 * the session is re-fetched from Stripe with the site's own keys and activation
 * re-validates all metadata. The webhook remains the primary activation path;
 * this just makes the entitlement visible immediately on return.
 */
export async function confirmDirectoryFeaturedCheckoutAction(input: {
  siteId: string
  sessionId: string
}): Promise<{ success: boolean; error: string | null }> {
  if (!UUID_REGEX.test(input.siteId)) return { success: false, error: 'Invalid site ID' }
  const sessionId = typeof input.sessionId === 'string' ? input.sessionId.trim() : ''
  if (!STRIPE_SESSION_ID_REGEX.test(sessionId)) return { success: false, error: 'Invalid checkout session' }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Authentication required' }

  // Each call retrieves a session from Stripe — cap per-user abuse
  if (await isPersistentRateLimited(`dir-featured-confirm:${user.id}`, 20, 10 * 60 * 1000)) {
    return { success: false, error: 'Too many requests. Please try again shortly.' }
  }

  const stripe = await getStripeClient(input.siteId)
  if (!stripe) return { success: false, error: 'Stripe is not configured for this site' }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch (error) {
    console.error('Error retrieving featured upgrade checkout session:', error)
    return { success: false, error: 'Checkout session not found' }
  }

  if (session.metadata?.userId !== user.id) {
    return { success: false, error: 'Checkout session does not belong to your account' }
  }
  if (session.payment_status !== 'paid') {
    return { success: false, error: 'Payment is not completed yet' }
  }

  const result = await activateDirectoryFeaturedEntitlement({
    siteId: input.siteId,
    metadata: session.metadata,
    paymentStatus: session.payment_status,
    stripeSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null,
    amountTotal: session.amount_total,
    currency: session.currency,
  })

  if (result.activated || result.alreadyProcessed) {
    return { success: true, error: null }
  }
  return { success: false, error: result.error || 'Could not activate the upgrade' }
}
