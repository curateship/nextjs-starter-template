import { revalidateTag } from '@/lib/cache'
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'

import { auth } from '@/lib/actions/auth/server'
import { db } from '@/lib/db'
import { authUsers, siteMemberships, sites } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/db/helpers'
import { lastSignInAtDateSql, lastSignInAtSql } from '@/lib/actions/users/last-sign-in-sql'
import { upsertSiteMembership } from '@/lib/utils/site-membership-runtime'
import { UUID_REGEX } from '@/lib/utils/validation'
import {
  safeDeleteSiteSearchDocument,
  safeSyncProfileSearchDocumentForMembership,
} from '@/lib/actions/site-search/site-search-index'
import {
  SITE_USER_RELATIVE_DAY_OPTIONS,
  SITE_USER_ROLE_OPTIONS,
  SITE_USER_STATUS_OPTIONS,
  type SiteUserDateFilterValue,
  type SiteUserFilterGroup,
  type SiteUserFilterRule,
} from '@/lib/actions/site-users/site-user-filters'

export interface SiteUserListItem {
  id: string
  site_id: string
  user_id: string
  email: string
  display_name: string | null
  image: string | null
  role: 'owner' | 'admin' | 'member'
  status: 'active' | 'suspended'
  created_at: string
  last_sign_in_at: string | null
}

const VALID_ROLE_VALUES = SITE_USER_ROLE_OPTIONS.map((option) => option.value)
const VALID_STATUS_VALUES = SITE_USER_STATUS_OPTIONS.map((option) => option.value)
const VALID_RELATIVE_DAYS = SITE_USER_RELATIVE_DAY_OPTIONS.map((option) => option.value)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ASSIGNABLE_ROLE_VALUES = ['admin', 'member'] as const

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
}

function rowToSiteUser(row: any): SiteUserListItem {
  return {
    id: row.id,
    site_id: row.siteId,
    user_id: row.userId,
    email: row.email,
    display_name: row.displayName ?? row.name ?? null,
    image: row.image ?? null,
    role: row.role,
    status: row.status,
    created_at: row.createdAt?.toISOString() ?? '',
    last_sign_in_at: row.lastSignInAt ?? null,
  }
}

function sanitizeDisplayName(value?: string | null) {
  const trimmed = value?.trim().slice(0, 100)
  if (!trimmed) return null
  return trimmed.replace(/<[^>]*>?/gm, '').replace(/[<>"']/g, '')
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function revalidatePublicProfiles() {
  revalidateTag('public-profile')
}

function startOfDay(value: string) {
  const date = new Date(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0))
}

function endOfDay(value: string) {
  const date = new Date(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999))
}

function normalizeDateFilterValue(value: unknown): SiteUserDateFilterValue | null {
  if (!value || typeof value !== 'object') return null

  const mode = (value as { mode?: unknown }).mode
  if (mode === 'relative') {
    const days = Number((value as { days?: unknown }).days)
    return VALID_RELATIVE_DAYS.includes(days as 7 | 30 | 60 | 90)
      ? { mode: 'relative', days: days as 7 | 30 | 60 | 90 }
      : null
  }

  if (mode === 'range') {
    const rawFrom = (value as { from?: unknown }).from
    const rawTo = (value as { to?: unknown }).to
    const from = typeof rawFrom === 'string' && rawFrom ? rawFrom : null
    const to = typeof rawTo === 'string' && rawTo ? rawTo : null

    if (from && Number.isNaN(new Date(from).getTime())) return null
    if (to && Number.isNaN(new Date(to).getTime())) return null

    return { mode: 'range', from, to }
  }

  return null
}

function normalizeSiteUserFilterRule(rule: unknown): SiteUserFilterRule | null {
  if (!rule || typeof rule !== 'object') return null

  const id = typeof (rule as { id?: unknown }).id === 'string' ? (rule as { id: string }).id : ''
  const type = typeof (rule as { type?: unknown }).type === 'string' ? (rule as { type: string }).type : ''
  if (!id) return null

  if (type === 'status' || type === 'role') {
    const allowedValues: readonly string[] = type === 'status' ? VALID_STATUS_VALUES : VALID_ROLE_VALUES
    const values = Array.isArray((rule as { value?: unknown }).value)
      ? (rule as { value: unknown[] }).value.filter((value): value is string => typeof value === 'string' && allowedValues.includes(value))
      : []
    return values.length ? { id, type, value: [...new Set(values)] } : null
  }

  if (type === 'lastEngaged' || type === 'dateAdded') {
    const operator = (rule as { operator?: unknown }).operator
    const value = normalizeDateFilterValue((rule as { value?: unknown }).value)
    if ((operator !== 'is' && operator !== 'isnt') || !value) return null
    return { id, type, operator, value }
  }

  return null
}

function normalizeSiteUserFilterGroup(group: unknown): SiteUserFilterGroup | null {
  if (!group || typeof group !== 'object') return null

  const match = (group as { match?: unknown }).match === 'any' ? 'any' : 'all'
  const rawRules = Array.isArray((group as { rules?: unknown }).rules) ? (group as { rules: unknown[] }).rules : []
  const rules = rawRules
    .map(normalizeSiteUserFilterRule)
    .filter((rule): rule is SiteUserFilterRule => rule !== null)

  return { match, rules }
}

function buildRelativeDateCondition(
  column: SQL,
  operator: 'is' | 'isnt',
  days: number,
  includeNullForNegative: boolean
): SQL {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  if (operator === 'is') {
    return sql`${column} >= ${cutoff}`
  }

  const conditions: SQL[] = [sql`${column} < ${cutoff}`]
  if (includeNullForNegative) {
    conditions.push(sql`${column} IS NULL`)
  }
  return or(...conditions)!
}

function buildRangeDateCondition(
  column: SQL,
  operator: 'is' | 'isnt',
  value: Extract<SiteUserDateFilterValue, { mode: 'range' }>,
  includeNullForNegative: boolean
): SQL | null {
  const conditions: SQL[] = []
  if (value.from) conditions.push(sql`${column} >= ${startOfDay(value.from)}`)
  if (value.to) conditions.push(sql`${column} <= ${endOfDay(value.to)}`)
  if (!conditions.length) return null

  if (operator === 'is') {
    return conditions.length === 1 ? conditions[0] : and(...conditions)!
  }

  const outsideRange: SQL[] = []
  if (value.from) outsideRange.push(sql`${column} < ${startOfDay(value.from)}`)
  if (value.to) outsideRange.push(sql`${column} > ${endOfDay(value.to)}`)
  if (includeNullForNegative) outsideRange.push(sql`${column} IS NULL`)
  return outsideRange.length === 1 ? outsideRange[0] : or(...outsideRange)!
}

function buildRuleCondition(rule: SiteUserFilterRule): SQL | null {
  if (rule.type === 'status') {
    return rule.value.length ? inArray(siteMemberships.status, rule.value) : null
  }

  if (rule.type === 'role') {
    return rule.value.length ? inArray(siteMemberships.role, rule.value) : null
  }

  const column = rule.type === 'lastEngaged' ? lastSignInAtDateSql() : sql`${siteMemberships.createdAt}`
  const includeNullForNegative = rule.type === 'lastEngaged'

  if (rule.value.mode === 'relative') {
    return buildRelativeDateCondition(column, rule.operator, rule.value.days, includeNullForNegative)
  }

  return buildRangeDateCondition(column, rule.operator, rule.value, includeNullForNegative)
}

function buildFilterWhere(siteId: string, group?: SiteUserFilterGroup | null): SQL {
  const baseCondition = eq(siteMemberships.siteId, siteId)
  if (!group || group.rules.length === 0) return baseCondition

  const conditions = group.rules
    .map(buildRuleCondition)
    .filter((condition): condition is SQL => condition !== null)

  if (!conditions.length) return baseCondition

  const combinedRules = group.match === 'any' ? or(...conditions)! : and(...conditions)!
  return and(baseCondition, combinedRules)!
}

function normalizeSearchQuery(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function buildSearchCondition(query?: string | null): SQL | null {
  const normalizedQuery = normalizeSearchQuery(query)
  if (!normalizedQuery) return null

  const likeQuery = `%${normalizedQuery}%`
  return or(
    ilike(authUsers.email, likeQuery),
    sql`coalesce(${authUsers.displayName}, '') ilike ${likeQuery}`,
    sql`coalesce(${authUsers.name}, '') ilike ${likeQuery}`,
    sql`concat_ws(' ', coalesce(${authUsers.displayName}, ''), coalesce(${authUsers.name}, '')) ilike ${likeQuery}`
  )!
}

function buildSiteUsersWhere(siteId: string, group?: SiteUserFilterGroup | null, searchQuery?: string | null): SQL {
  const conditions: SQL[] = [buildFilterWhere(siteId, group)]
  const searchCondition = buildSearchCondition(searchQuery)
  if (searchCondition) conditions.push(searchCondition)
  return conditions.length === 1 ? conditions[0] : and(...conditions)!
}

export async function getSiteUsersImpl(
  siteId: string,
  options?: {
    filterGroup?: SiteUserFilterGroup | null
    searchQuery?: string | null
    page?: number
    pageSize?: number
  }
  ): Promise<{ data: SiteUserListItem[] | null; total: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, total: 0, error: 'Invalid site ID' }

    const user = await requireAdmin()
    if (!await verifySiteOwnership(siteId, user.id)) return { data: null, total: 0, error: 'Access denied' }

    const page = Math.max(1, options?.page ?? 1)
    const pageSize = Math.max(1, Math.min(options?.pageSize ?? 50, 200))
    const offset = (page - 1) * pageSize
    const normalizedFilters = normalizeSiteUserFilterGroup(options?.filterGroup)
    const where = buildSiteUsersWhere(siteId, normalizedFilters, options?.searchQuery)

    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: siteMemberships.id,
          siteId: siteMemberships.siteId,
          userId: siteMemberships.userId,
          email: authUsers.email,
          name: authUsers.name,
          displayName: authUsers.displayName,
          image: authUsers.image,
          role: siteMemberships.role,
          status: siteMemberships.status,
          createdAt: siteMemberships.createdAt,
          lastSignInAt: lastSignInAtSql(),
        })
        .from(siteMemberships)
        .innerJoin(authUsers, eq(authUsers.id, siteMemberships.userId))
        .where(where)
        .orderBy(desc(siteMemberships.createdAt), desc(siteMemberships.id))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(siteMemberships)
        .innerJoin(authUsers, eq(authUsers.id, siteMemberships.userId))
        .where(where),
    ])

    return {
      data: rows.map(rowToSiteUser),
      total: Number(countRows[0]?.count ?? 0),
      error: null,
    }
  } catch (error) {
    return {
      data: null,
      total: 0,
      error: error instanceof Error ? error.message : 'Failed to load site users',
    }
  }
}

export async function createSiteUserImpl(input: {
  siteId: string
  email: string
  displayName?: string
  password: string
  role: 'admin' | 'member'
  status: 'active' | 'suspended'
}): Promise<{ data: SiteUserListItem | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const currentUser = await requireAdmin()
    if (!await verifySiteOwnership(input.siteId, currentUser.id)) return { data: null, error: 'Access denied' }

    const email = normalizeEmail(input.email)
    if (!EMAIL_REGEX.test(email)) return { data: null, error: 'Invalid email address' }
    if (!ASSIGNABLE_ROLE_VALUES.includes(input.role)) return { data: null, error: 'Invalid role' }
    if (!VALID_STATUS_VALUES.includes(input.status)) return { data: null, error: 'Invalid status' }
    if (input.password.length < 6) return { data: null, error: 'Password must be at least 6 characters' }

    const displayName = sanitizeDisplayName(input.displayName)

    let userId: string
    const existingUser = await db
      .select({
        id: authUsers.id,
        email: authUsers.email,
      })
      .from(authUsers)
      .where(eq(authUsers.email, email))
      .limit(1)
      .then((rows) => rows[0])

    if (existingUser) {
      userId = existingUser.id

      const existingMembership = await db
        .select({ id: siteMemberships.id })
        .from(siteMemberships)
        .where(and(eq(siteMemberships.siteId, input.siteId), eq(siteMemberships.userId, userId)))
        .limit(1)
        .then((rows) => rows[0])

      if (existingMembership) {
        return { data: null, error: 'User is already a member of this site' }
      }

      await db
        .insert(siteMemberships)
        .values({
          siteId: input.siteId,
          userId,
          role: input.role,
          status: input.status,
        })
    } else {
      const created = await auth.api.signUpEmail({
        body: {
          email,
          password: input.password,
          name: displayName || email.split('@')[0],
          displayName: displayName || email.split('@')[0],
        },
      })

      if (!created?.user?.id) {
        return { data: null, error: 'Failed to create user' }
      }

      userId = created.user.id

      await upsertSiteMembership({
        siteId: input.siteId,
        userId,
        role: input.role,
        status: input.status,
      })
    }

    const row = await db
      .select({
        id: siteMemberships.id,
        siteId: siteMemberships.siteId,
        userId: siteMemberships.userId,
        email: authUsers.email,
        name: authUsers.name,
        displayName: authUsers.displayName,
        image: authUsers.image,
        role: siteMemberships.role,
        status: siteMemberships.status,
        createdAt: siteMemberships.createdAt,
        lastSignInAt: lastSignInAtSql(),
      })
      .from(siteMemberships)
      .innerJoin(authUsers, eq(authUsers.id, siteMemberships.userId))
      .where(and(eq(siteMemberships.siteId, input.siteId), eq(siteMemberships.userId, userId)))
      .limit(1)
      .then((rows) => rows[0])

    if (row) {
      await safeSyncProfileSearchDocumentForMembership(input.siteId, userId)
      revalidatePublicProfiles()
    }

    return { data: row ? rowToSiteUser(row) : null, error: row ? null : 'Failed to load user' }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to create site user',
    }
  }
}

export async function updateSiteUserImpl(input: {
  membershipId: string
  siteId: string
  displayName?: string
  role: 'admin' | 'member'
  status: 'active' | 'suspended'
}): Promise<{ data: SiteUserListItem | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.membershipId) || !UUID_REGEX.test(input.siteId)) {
      return { data: null, error: 'Invalid site user' }
    }

    const currentUser = await requireAdmin()
    if (!await verifySiteOwnership(input.siteId, currentUser.id)) return { data: null, error: 'Access denied' }

    if (!ASSIGNABLE_ROLE_VALUES.includes(input.role)) return { data: null, error: 'Invalid role' }
    if (!VALID_STATUS_VALUES.includes(input.status)) return { data: null, error: 'Invalid status' }

    const membership = await db
      .select({
        id: siteMemberships.id,
        siteId: siteMemberships.siteId,
        userId: siteMemberships.userId,
        role: siteMemberships.role,
      })
      .from(siteMemberships)
      .where(and(eq(siteMemberships.id, input.membershipId), eq(siteMemberships.siteId, input.siteId)))
      .limit(1)
      .then((rows) => rows[0])

    if (!membership) return { data: null, error: 'Site user not found' }
    if (membership.role === 'owner') {
      return { data: null, error: 'Site owner membership cannot be edited here' }
    }

    const displayName = sanitizeDisplayName(input.displayName)
    await db.transaction(async (tx) => {
      await tx
        .update(authUsers)
        .set({
          name: displayName || sql`coalesce(${authUsers.name}, split_part(${authUsers.email}, '@', 1))`,
          displayName,
          updatedAt: new Date(),
        })
        .where(eq(authUsers.id, membership.userId))

      await tx
        .update(siteMemberships)
        .set({
          role: input.role,
          status: input.status,
          updatedAt: new Date(),
        })
        .where(eq(siteMemberships.id, membership.id))
    })

    const row = await db
      .select({
        id: siteMemberships.id,
        siteId: siteMemberships.siteId,
        userId: siteMemberships.userId,
        email: authUsers.email,
        name: authUsers.name,
        displayName: authUsers.displayName,
        image: authUsers.image,
        role: siteMemberships.role,
        status: siteMemberships.status,
        createdAt: siteMemberships.createdAt,
        lastSignInAt: lastSignInAtSql(),
      })
      .from(siteMemberships)
      .innerJoin(authUsers, eq(authUsers.id, siteMemberships.userId))
      .where(eq(siteMemberships.id, membership.id))
      .limit(1)
      .then((rows) => rows[0])

    if (row) {
      await safeSyncProfileSearchDocumentForMembership(input.siteId, membership.userId)
      revalidatePublicProfiles()
    }

    return { data: row ? rowToSiteUser(row) : null, error: row ? null : 'Failed to load user' }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to update site user',
    }
  }
}

export async function deleteSiteUsersImpl(input: {
  siteId: string
  membershipIds: string[]
}): Promise<{ success: boolean; error: string | null; deletedCount: number }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) {
      return { success: false, error: 'Invalid site ID', deletedCount: 0 }
    }

    const membershipIds = [...new Set(input.membershipIds)]
    if (!membershipIds.length) {
      return { success: false, error: 'No site users selected', deletedCount: 0 }
    }

    for (const membershipId of membershipIds) {
      if (!UUID_REGEX.test(membershipId)) {
        return { success: false, error: 'Invalid site user', deletedCount: 0 }
      }
    }

    const currentUser = await requireAdmin()
    if (!await verifySiteOwnership(input.siteId, currentUser.id)) {
      return { success: false, error: 'Access denied', deletedCount: 0 }
    }

    const memberships = await db
      .select({
        id: siteMemberships.id,
        userId: siteMemberships.userId,
        role: siteMemberships.role,
      })
      .from(siteMemberships)
      .where(and(eq(siteMemberships.siteId, input.siteId), inArray(siteMemberships.id, membershipIds)))

    if (!memberships.length) {
      return { success: false, error: 'Site users not found', deletedCount: 0 }
    }

    if (memberships.length !== membershipIds.length) {
      return { success: false, error: 'Some selected site users were not found', deletedCount: 0 }
    }

    if (memberships.some((membership) => membership.role === 'owner')) {
      return { success: false, error: 'Owner memberships cannot be deleted here', deletedCount: 0 }
    }

    await db
      .delete(siteMemberships)
      .where(and(eq(siteMemberships.siteId, input.siteId), inArray(siteMemberships.id, membershipIds)))
    await Promise.all(memberships.map((membership) => (
      safeDeleteSiteSearchDocument(input.siteId, 'profile', membership.userId)
    )))

    revalidatePublicProfiles()

    return {
      success: true,
      error: null,
      deletedCount: membershipIds.length,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete site users',
      deletedCount: 0,
    }
  }
}

export type { SiteUserFilterGroup }
