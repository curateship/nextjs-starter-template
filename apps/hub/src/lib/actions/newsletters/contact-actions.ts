'use server'

import { eq, and, or, sql, desc, inArray, gte, lte, ilike, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterContacts, newsletterEvents, newsletters, newsletterSegments, newsletterSegmentContacts, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { verifyUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import {
  CONTACT_RELATIVE_DAY_OPTIONS,
  CONTACT_SOURCE_OPTIONS,
  CONTACT_STATUS_OPTIONS,
  getContactSourceLabel,
  type ContactDateFilterValue,
  type ContactFilterGroup,
  type ContactFilterRule,
} from '@/lib/actions/newsletters/contact-filters'
import { syncDynamicSegmentsForContacts } from '@/lib/actions/newsletters/segment-actions'

export interface CrmContact {
  id: string
  site_id: string
  email: string
  status: 'active' | 'unsubscribed' | 'bounced' | 'complained'
  engagement_score: number
  last_engaged_at: string | null
  bounce_count: number
  metadata: {
    first_name?: string
    last_name?: string
    source?: string
    source_product_id?: string
    tags?: string[]
    [key: string]: any
  }
  created_at: string
  updated_at: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_STATUSES = ['active', 'unsubscribed', 'bounced', 'complained'] as const
const MAX_IMPORT_SIZE = 50000
const VALID_SOURCES = CONTACT_SOURCE_OPTIONS.map((option) => option.value)
const VALID_STATUS_VALUES = CONTACT_STATUS_OPTIONS.map((option) => option.value)
const VALID_RELATIVE_DAYS = CONTACT_RELATIVE_DAY_OPTIONS.map((option) => option.value)
const HIDDEN_SOURCE_TAGS = new Set(['notion marketplace'])

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
}

function rowToContact(row: any): CrmContact {
  const metadata = normalizeContactMetadata(row.metadata)

  return {
    id: row.id,
    site_id: row.siteId,
    email: row.email,
    status: row.status,
    engagement_score: row.engagementScore ?? 0,
    last_engaged_at: row.lastEngagedAt?.toISOString() ?? null,
    bounce_count: row.bounceCount ?? 0,
    metadata,
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

function normalizeContactMetadata(value: unknown): CrmContact['metadata'] {
  const metadata = value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, any>) }
    : {}

  if (typeof metadata.source === 'string') {
    metadata.source = getContactSourceLabel(metadata.source)

    if (Array.isArray(metadata.tags)) {
      metadata.tags = metadata.tags.filter((tag) => (
        typeof tag === 'string'
        && !HIDDEN_SOURCE_TAGS.has(tag.trim().toLowerCase())
      ))
    }
  }

  return metadata
}

function startOfDay(value: string): Date {
  const date = new Date(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0))
}

function endOfDay(value: string): Date {
  const date = new Date(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999))
}

function normalizeDateFilterValue(value: unknown): ContactDateFilterValue | null {
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

function normalizeContactFilterRule(rule: unknown): ContactFilterRule | null {
  if (!rule || typeof rule !== 'object') return null

  const id = typeof (rule as { id?: unknown }).id === 'string' ? (rule as { id: string }).id : ''
  const type = typeof (rule as { type?: unknown }).type === 'string' ? (rule as { type: string }).type : ''

  if (!id) return null

  if (type === 'status') {
    const values = Array.isArray((rule as { value?: unknown }).value)
      ? (rule as { value: unknown[] }).value.filter((value): value is string => typeof value === 'string' && VALID_STATUS_VALUES.includes(value as typeof VALID_STATUS_VALUES[number]))
      : []
    return values.length ? { id, type, value: [...new Set(values)] } : null
  }

  if (type === 'source') {
    const values = Array.isArray((rule as { value?: unknown }).value)
      ? (rule as { value: unknown[] }).value.filter((value): value is string => typeof value === 'string' && VALID_SOURCES.includes(value as typeof VALID_SOURCES[number]))
      : []
    return values.length ? { id, type, value: [...new Set(values)] } : null
  }

  if (type === 'dataField') {
    const field = (rule as { field?: unknown }).field
    const operator = (rule as { operator?: unknown }).operator
    const value = typeof (rule as { value?: unknown }).value === 'string'
      ? (rule as { value: string }).value.trim()
      : ''

    if (field !== 'tag') return null
    if (
      operator !== 'matchesExact' &&
      operator !== 'notMatchesExact' &&
      operator !== 'contains' &&
      operator !== 'notContains' &&
      operator !== 'isEmpty' &&
      operator !== 'isNotEmpty'
    ) {
      return null
    }
    return { id, type, field, operator, value }
  }

  if (type === 'emailOpens') {
    const operator = (rule as { operator?: unknown }).operator
    const rawTimes = (rule as { times?: unknown }).times
    const times = typeof rawTimes === 'string' ? Number(rawTimes) : rawTimes

    if (operator !== 'has_opened' && operator !== 'hasnt_opened') return null
    if (!Number.isInteger(times) || Number(times) < 1) return null
    return { id, type, operator, times: Number(times) }
  }

  if (type === 'lastEngaged' || type === 'dateAdded') {
    const operator = (rule as { operator?: unknown }).operator
    const value = normalizeDateFilterValue((rule as { value?: unknown }).value)
    if ((operator !== 'is' && operator !== 'isnt') || !value) return null
    return { id, type, operator, value }
  }

  return null
}

function normalizeContactFilterGroup(group: unknown): ContactFilterGroup | null {
  if (!group || typeof group !== 'object') return null

  const match = (group as { match?: unknown }).match === 'any' ? 'any' : 'all'
  const rawRules = Array.isArray((group as { rules?: unknown }).rules) ? (group as { rules: unknown[] }).rules : []
  const rules = rawRules
    .map(normalizeContactFilterRule)
    .filter((rule): rule is ContactFilterRule => rule !== null)

  return { match, rules }
}

function buildRelativeDateCondition(
  column: typeof newsletterContacts.lastEngagedAt | typeof newsletterContacts.createdAt,
  operator: 'is' | 'isnt',
  days: number,
  includeNullForNegative: boolean
): SQL {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  if (operator === 'is') {
    return gte(column, cutoff)
  }

  const comparisons: SQL[] = [sql`${column} < ${cutoff}`]
  if (includeNullForNegative) {
    comparisons.push(sql`${column} IS NULL`)
  }
  return or(...comparisons)!
}

function buildRangeDateCondition(
  column: typeof newsletterContacts.lastEngagedAt | typeof newsletterContacts.createdAt,
  operator: 'is' | 'isnt',
  value: Extract<ContactDateFilterValue, { mode: 'range' }>,
  includeNullForNegative: boolean
): SQL | null {
  const conditions: SQL[] = []

  if (value.from) {
    conditions.push(gte(column, startOfDay(value.from)))
  }
  if (value.to) {
    conditions.push(lte(column, endOfDay(value.to)))
  }

  if (!conditions.length) return null

  if (operator === 'is') {
    return conditions.length === 1 ? conditions[0] : and(...conditions)!
  }

  const outsideRange: SQL[] = []
  if (value.from) {
    outsideRange.push(sql`${column} < ${startOfDay(value.from)}`)
  }
  if (value.to) {
    outsideRange.push(sql`${column} > ${endOfDay(value.to)}`)
  }
  if (includeNullForNegative) {
    outsideRange.push(sql`${column} IS NULL`)
  }

  return outsideRange.length === 1 ? outsideRange[0] : or(...outsideRange)!
}

function buildRuleCondition(rule: ContactFilterRule): SQL | null {
  if (rule.type === 'status') {
    return rule.value.length ? inArray(newsletterContacts.status, rule.value) : null
  }

  if (rule.type === 'source') {
    return rule.value.length
      ? or(...rule.value.map((value) => sql`${newsletterContacts.metadata}->>'source' = ${value}`))!
      : null
  }

  if (rule.type === 'dataField') {
    const tagArray = sql`CASE WHEN jsonb_typeof(${newsletterContacts.metadata}->'tags') = 'array' THEN ${newsletterContacts.metadata}->'tags' ELSE '[]'::jsonb END`

    if (rule.operator === 'isEmpty') {
      return sql`jsonb_array_length(${tagArray}) = 0`
    }

    if (rule.operator === 'isNotEmpty') {
      return sql`jsonb_array_length(${tagArray}) > 0`
    }

    if (!rule.value.trim()) return null

    if (rule.operator === 'matchesExact') {
      return sql`exists (
        select 1
        from jsonb_array_elements_text(${tagArray}) as tag(value)
        where lower(tag.value) = lower(${rule.value})
      )`
    }

    if (rule.operator === 'notMatchesExact') {
      return sql`not exists (
        select 1
        from jsonb_array_elements_text(${tagArray}) as tag(value)
        where lower(tag.value) = lower(${rule.value})
      )`
    }

    const likeValue = `%${rule.value}%`
    if (rule.operator === 'contains') {
      return sql`exists (
        select 1
        from jsonb_array_elements_text(${tagArray}) as tag(value)
        where tag.value ilike ${likeValue}
      )`
    }

    return sql`not exists (
      select 1
      from jsonb_array_elements_text(${tagArray}) as tag(value)
      where tag.value ilike ${likeValue}
    )`
  }

  if (rule.type === 'emailOpens') {
    const recentEmails = sql`
      select sent.source_type, sent.source_id
      from newsletter_events as sent
      where sent.site_id = ${newsletterContacts.siteId}
        and sent.event_type = 'sent'
        and sent.source_id is not null
      group by sent.source_type, sent.source_id
      order by max(sent.created_at) desc
      limit ${Number(rule.times)}
    `
    const hasOpenedRecentEmail = sql`exists (
      select 1
      from newsletter_events as opened
      inner join (${recentEmails}) as recent_email
        on opened.source_type = recent_email.source_type
        and opened.source_id = recent_email.source_id
      where opened.contact_id = ${newsletterContacts.id}
        and opened.site_id = ${newsletterContacts.siteId}
        and opened.event_type = 'opened'
    )`

    return rule.operator === 'has_opened'
      ? hasOpenedRecentEmail
      : sql`not ${hasOpenedRecentEmail}`
  }

  const column = rule.type === 'lastEngaged' ? newsletterContacts.lastEngagedAt : newsletterContacts.createdAt
  const includeNullForNegative = rule.type === 'lastEngaged'

  if (rule.value.mode === 'relative') {
    return buildRelativeDateCondition(column, rule.operator, rule.value.days, includeNullForNegative)
  }

  return buildRangeDateCondition(column, rule.operator, rule.value, includeNullForNegative)
}

function buildContactFilterWhere(siteId: string, group?: ContactFilterGroup | null): SQL {
  const baseCondition = eq(newsletterContacts.siteId, siteId)
  if (!group || group.rules.length === 0) return baseCondition

  const ruleConditions = group.rules
    .map(buildRuleCondition)
    .filter((condition): condition is SQL => condition !== null)

  if (!ruleConditions.length) return baseCondition

  const combinedRules = group.match === 'any' ? or(...ruleConditions)! : and(...ruleConditions)!
  return and(baseCondition, combinedRules)!
}

function normalizeSearchQuery(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function buildContactSearchCondition(query?: string | null): SQL | null {
  const normalizedQuery = normalizeSearchQuery(query)
  if (!normalizedQuery) return null

  const likeQuery = `%${normalizedQuery}%`

  return or(
    ilike(newsletterContacts.email, likeQuery),
    sql`coalesce(${newsletterContacts.metadata}->>'first_name', '') ilike ${likeQuery}`,
    sql`coalesce(${newsletterContacts.metadata}->>'last_name', '') ilike ${likeQuery}`,
    sql`concat_ws(' ', coalesce(${newsletterContacts.metadata}->>'first_name', ''), coalesce(${newsletterContacts.metadata}->>'last_name', '')) ilike ${likeQuery}`,
  )!
}

function buildContactsWhere(siteId: string, group?: ContactFilterGroup | null, searchQuery?: string | null): SQL {
  const conditions: SQL[] = [buildContactFilterWhere(siteId, group)]
  const searchCondition = buildContactSearchCondition(searchQuery)
  if (searchCondition) conditions.push(searchCondition)
  return conditions.length === 1 ? conditions[0] : and(...conditions)!
}

async function repairBouncedContacts(siteId: string) {
  await db.execute(sql`
    update newsletter_contacts as contact
    set status = 'bounced',
        bounce_count = greatest(coalesce(contact.bounce_count, 0), 1),
        updated_at = now()
    where contact.site_id = ${siteId}
      and contact.status = 'active'
      and exists (
        select 1
        from newsletter_events as event
        where event.contact_id = contact.id
          and event.event_type = 'bounced'
      )
  `)
}

export async function createOrUpsertContact(input: {
  siteId: string
  email: string
  firstName?: string
  lastName?: string
  source?: string
  sourceProductId?: string
  tags?: string[]
}): Promise<{ data: CrmContact | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const email = input.email?.toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { data: null, error: 'Invalid email address' }
    }

    const metadata: Record<string, any> = {}
    if (input.firstName) metadata.first_name = input.firstName
    if (input.lastName) metadata.last_name = input.lastName
    if (input.source) metadata.source = input.source
    if (input.sourceProductId) metadata.source_product_id = input.sourceProductId
    if (input.tags?.length) metadata.tags = input.tags

    const [data] = await db
      .insert(newsletterContacts)
      .values({
        siteId: input.siteId,
        email,
        metadata,
      })
      .onConflictDoUpdate({
        target: [newsletterContacts.siteId, newsletterContacts.email],
        set: {
          metadata: sql`coalesce(${newsletterContacts.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`,
          updatedAt: new Date(),
        },
      })
      .returning()

    if (!data) {
      return { data: null, error: 'Failed to save contact' }
    }

    await syncDynamicSegmentsForContacts([data.id])

    return { data: rowToContact(data), error: null }
  } catch (err) {
    console.error('createOrUpsertContact error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function bulkImportContacts(input: {
  siteId: string
  contacts: { email: string; first_name?: string; last_name?: string; tags?: string[]; created_at?: string; last_engaged_at?: string }[]
}): Promise<{ imported: number; skipped: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { imported: 0, skipped: 0, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { imported: 0, skipped: 0, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { imported: 0, skipped: 0, error: 'Access denied' }
    }

    if (!input.contacts.length) return { imported: 0, skipped: 0, error: 'No contacts provided' }

    if (input.contacts.length > MAX_IMPORT_SIZE) {
      return { imported: 0, skipped: 0, error: `Maximum ${MAX_IMPORT_SIZE.toLocaleString()} contacts per import` }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const valid: typeof input.contacts = []
    let skipped = 0

    for (const c of input.contacts) {
      const email = c.email?.toLowerCase()
      if (email && emailRegex.test(email)) {
        valid.push({ ...c, email })
      } else {
        skipped++
      }
    }

    if (!valid.length) return { imported: 0, skipped, error: 'No valid emails found' }

    // Dedupe by email -- last occurrence wins
    const deduped = new Map<string, typeof valid[0]>()
    for (const c of valid) {
      deduped.set(c.email, c)
    }
    const uniqueContacts = Array.from(deduped.values())
    skipped += valid.length - uniqueContacts.length

    // Process in batches of 500
    const batchSize = 500
    let imported = 0
    const importedContactIds: string[] = []
    for (let i = 0; i < uniqueContacts.length; i += batchSize) {
      const batch = uniqueContacts.slice(i, i + batchSize)
      const rows = batch.map(c => {
        const metadata: Record<string, any> = { source: 'import' }
        if (c.first_name) metadata.first_name = c.first_name
        if (c.last_name) metadata.last_name = c.last_name
        if (c.tags?.length) metadata.tags = c.tags
        return {
          siteId: input.siteId,
          email: c.email,
          metadata,
          ...(c.created_at ? { createdAt: new Date(c.created_at) } : {}),
          ...(c.last_engaged_at ? { lastEngagedAt: new Date(c.last_engaged_at) } : {}),
        }
      })

      try {
        const result = await db
          .insert(newsletterContacts)
          .values(rows)
          .onConflictDoUpdate({
            target: [newsletterContacts.siteId, newsletterContacts.email],
            set: {
              metadata: sql`coalesce(${newsletterContacts.metadata}, '{}'::jsonb) || excluded.metadata`,
              updatedAt: new Date(),
            },
          })
          .returning({ id: newsletterContacts.id })

        imported += result.length
        importedContactIds.push(...result.map((row) => row.id))
      } catch (err) {
        console.error('bulkImportContacts batch error:', err)
        return { imported, skipped, error: 'Failed to import batch' }
      }
    }

    if (importedContactIds.length) {
      await syncDynamicSegmentsForContacts(importedContactIds)
    }

    return { imported, skipped, error: null }
  } catch (err) {
    console.error('bulkImportContacts error:', err)
    return { imported: 0, skipped: 0, error: 'Server error' }
  }
}

export async function updateContact(
  contactId: string,
  updates: { metadata?: Record<string, any>; status?: CrmContact['status'] }
): Promise<{ data: CrmContact | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(contactId)) return { data: null, error: 'Invalid contact ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [contact] = await db
      .select({ siteId: newsletterContacts.siteId, metadata: newsletterContacts.metadata })
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contactId))
      .limit(1)

    if (!contact) return { data: null, error: 'Contact not found' }

    if (!await verifySiteOwnership(contact.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (updates.status !== undefined && !VALID_STATUSES.includes(updates.status)) {
      return { data: null, error: 'Invalid status' }
    }

    const updateFields: Record<string, any> = { updatedAt: new Date() }
    if (updates.status !== undefined) updateFields.status = updates.status
    if (updates.metadata !== undefined) {
      updateFields.metadata = { ...(contact.metadata as Record<string, any>), ...updates.metadata }
    }

    const [data] = await db
      .update(newsletterContacts)
      .set(updateFields)
      .where(eq(newsletterContacts.id, contactId))
      .returning()

    if (!data) {
      return { data: null, error: 'Failed to update contact' }
    }

    await syncDynamicSegmentsForContacts([data.id])

    return { data: rowToContact(data), error: null }
  } catch (err) {
    console.error('updateContact error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteContacts(contactIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!contactIds.length) return { success: false, error: 'No contacts selected' }
    for (const id of contactIds) {
      if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid contact ID' }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const contacts = await db
      .select({ id: newsletterContacts.id, siteId: newsletterContacts.siteId })
      .from(newsletterContacts)
      .where(inArray(newsletterContacts.id, contactIds))

    if (!contacts.length) return { success: false, error: 'Contacts not found' }

    const siteIds = [...new Set(contacts.map(c => c.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    await db
      .delete(newsletterContacts)
      .where(inArray(newsletterContacts.id, contactIds))

    return { success: true, error: null }
  } catch (err) {
    console.error('deleteContacts error:', err)
    return { success: false, error: 'Server error' }
  }
}

/** Returns only contact IDs for bulk selection — lightweight alternative to full record fetch */
export async function getContactIdsAction(
  siteId: string,
  options?: {
    filterGroup?: ContactFilterGroup
    searchQuery?: string
  }
): Promise<{ ids: string[]; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { ids: [], error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { ids: [], error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { ids: [], error: 'Access denied' }
    }

    await repairBouncedContacts(siteId)

    const normalizedGroup = normalizeContactFilterGroup(options?.filterGroup)
    const whereClause = buildContactsWhere(siteId, normalizedGroup, options?.searchQuery)

    const rows = await db
      .select({ id: newsletterContacts.id })
      .from(newsletterContacts)
      .where(whereClause)

    return { ids: rows.map(r => r.id), error: null }
  } catch (err) {
    return { ids: [], error: 'Server error' }
  }
}

export async function getContactsWithStats(
  siteId: string,
  options?: {
    filterGroup?: ContactFilterGroup
    searchQuery?: string
    page?: number
    pageSize?: number
  }
): Promise<{
  data: CrmContact[] | null
  total: number
  stats: { total: number; active: number; unsubscribed: number; bounced: number; bySource: Record<string, number> } | null
  error: string | null
}> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, total: 0, stats: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, total: 0, stats: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, total: 0, stats: null, error: 'Access denied' }
    }

    await repairBouncedContacts(siteId)

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const offset = (page - 1) * pageSize

    const normalizedGroup = normalizeContactFilterGroup(options?.filterGroup)
    const whereClause = buildContactsWhere(siteId, normalizedGroup, options?.searchQuery)

    const [contactsResult, countResult, statsResult] = await Promise.all([
      db
        .select()
        .from(newsletterContacts)
        .where(whereClause)
        .orderBy(desc(newsletterContacts.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(newsletterContacts)
        .where(whereClause),
      db
        .select({ status: newsletterContacts.status, metadata: newsletterContacts.metadata })
        .from(newsletterContacts)
        .where(eq(newsletterContacts.siteId, siteId)),
    ])

    const total = countResult[0]?.count ?? 0

    let stats = null
    if (statsResult) {
      stats = {
        total: statsResult.length,
        active: 0,
        unsubscribed: 0,
        bounced: 0,
        bySource: {} as Record<string, number>,
      }
      for (const c of statsResult) {
        if (c.status === 'active') stats.active++
        else if (c.status === 'unsubscribed') stats.unsubscribed++
        else if (c.status === 'bounced' || c.status === 'complained') stats.bounced++
        const meta = c.metadata as Record<string, any> | null
        const source = meta?.source || 'manual'
        stats.bySource[source] = (stats.bySource[source] || 0) + 1
      }
    }

    return { data: contactsResult.map(rowToContact), total, stats, error: null }
  } catch (err) {
    console.error('getContactsWithStats error:', err)
    return { data: null, total: 0, stats: null, error: 'Server error' }
  }
}

/** Fetch a single contact by ID with auth + ownership check */
export async function getContactById(
  contactId: string
): Promise<{ data: CrmContact | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(contactId)) return { data: null, error: 'Invalid contact ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [contact] = await db
      .select()
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contactId))
      .limit(1)

    if (!contact) return { data: null, error: 'Contact not found' }

    if (!await verifySiteOwnership(contact.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    await repairBouncedContacts(contact.siteId)

    const [repairedContact] = await db
      .select()
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contactId))
      .limit(1)

    if (!repairedContact) return { data: null, error: 'Contact not found' }

    return { data: rowToContact(repairedContact), error: null }
  } catch (err) {
    console.error('getContactById error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Aggregate stats for a contact from newsletter_events */
export async function getContactStats(
  contactId: string
): Promise<{ data: { totalSent: number; totalOpened: number; totalClicked: number; openRate: number; clickRate: number } | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(contactId)) return { data: null, error: 'Invalid contact ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Verify contact exists and user owns the site
    const [contact] = await db
      .select({ siteId: newsletterContacts.siteId })
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contactId))
      .limit(1)

    if (!contact) return { data: null, error: 'Contact not found' }
    if (!await verifySiteOwnership(contact.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    // Count events by type for this contact
    const rows = await db
      .select({
        eventType: newsletterEvents.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(newsletterEvents)
      .where(eq(newsletterEvents.contactId, contactId))
      .groupBy(newsletterEvents.eventType)

    const counts: Record<string, number> = {}
    for (const r of rows) counts[r.eventType] = r.count

    const totalSent = counts['sent'] || 0
    const totalOpened = counts['opened'] || 0
    const totalClicked = counts['clicked'] || 0
    const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0
    const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0

    return { data: { totalSent, totalOpened, totalClicked, openRate, clickRate }, error: null }
  } catch (err) {
    console.error('getContactStats error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Paginated event history for a contact, joined with newsletter subject */
export async function getContactEvents(
  contactId: string,
  page = 1,
  pageSize = 20
): Promise<{ data: { id: string; eventType: string; sourceId: string | null; newsletterSubject: string | null; metadata: any; createdAt: string }[] | null; total: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(contactId)) return { data: null, total: 0, error: 'Invalid contact ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, total: 0, error: 'Not authenticated' }

    const [contact] = await db
      .select({ siteId: newsletterContacts.siteId })
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contactId))
      .limit(1)

    if (!contact) return { data: null, total: 0, error: 'Contact not found' }
    if (!await verifySiteOwnership(contact.siteId, user.id)) {
      return { data: null, total: 0, error: 'Access denied' }
    }

    const safePage = Math.max(1, Math.floor(page))
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))
    const offset = (safePage - 1) * safePageSize

    // Fetch events with left-joined newsletter subject
    const [events, countResult] = await Promise.all([
      db
        .select({
          id: newsletterEvents.id,
          eventType: newsletterEvents.eventType,
          sourceId: newsletterEvents.sourceId,
          newsletterSubject: newsletters.subject,
          metadata: newsletterEvents.metadata,
          createdAt: newsletterEvents.createdAt,
        })
        .from(newsletterEvents)
        .leftJoin(newsletters, eq(newsletterEvents.sourceId, newsletters.id))
        .where(eq(newsletterEvents.contactId, contactId))
        .orderBy(desc(newsletterEvents.createdAt))
        .limit(safePageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(newsletterEvents)
        .where(eq(newsletterEvents.contactId, contactId)),
    ])

    return {
      data: events.map(e => ({
        id: e.id,
        eventType: e.eventType,
        sourceId: e.sourceId,
        newsletterSubject: e.newsletterSubject,
        metadata: e.metadata,
        createdAt: e.createdAt?.toISOString() ?? '',
      })),
      total: countResult[0]?.count ?? 0,
      error: null,
    }
  } catch (err) {
    console.error('getContactEvents error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

/** Segments a contact belongs to */
export async function getContactSegments(
  contactId: string
): Promise<{ data: { id: string; name: string }[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(contactId)) return { data: null, error: 'Invalid contact ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [contact] = await db
      .select({ siteId: newsletterContacts.siteId })
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contactId))
      .limit(1)

    if (!contact) return { data: null, error: 'Contact not found' }
    if (!await verifySiteOwnership(contact.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const rows = await db
      .select({
        id: newsletterSegments.id,
        name: newsletterSegments.name,
      })
      .from(newsletterSegmentContacts)
      .innerJoin(newsletterSegments, eq(newsletterSegmentContacts.segmentId, newsletterSegments.id))
      .where(eq(newsletterSegmentContacts.contactId, contactId))

    return { data: rows, error: null }
  } catch (err) {
    console.error('getContactSegments error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Click events for a contact with link URL from metadata, joined with newsletter name */
export async function getContactClickedLinks(
  contactId: string
): Promise<{ data: { id: string; linkUrl: string; newsletterSubject: string | null; createdAt: string }[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(contactId)) return { data: null, error: 'Invalid contact ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [contact] = await db
      .select({ siteId: newsletterContacts.siteId })
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contactId))
      .limit(1)

    if (!contact) return { data: null, error: 'Contact not found' }
    if (!await verifySiteOwnership(contact.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const rows = await db
      .select({
        id: newsletterEvents.id,
        metadata: newsletterEvents.metadata,
        newsletterSubject: newsletters.subject,
        createdAt: newsletterEvents.createdAt,
      })
      .from(newsletterEvents)
      .leftJoin(newsletters, eq(newsletterEvents.sourceId, newsletters.id))
      .where(and(
        eq(newsletterEvents.contactId, contactId),
        eq(newsletterEvents.eventType, 'clicked'),
      ))
      .orderBy(desc(newsletterEvents.createdAt))
      .limit(50)

    return {
      data: rows.map(r => ({
        id: r.id,
        linkUrl: (r.metadata as any)?.link_url || '',
        newsletterSubject: r.newsletterSubject,
        createdAt: r.createdAt?.toISOString() ?? '',
      })),
      error: null,
    }
  } catch (err) {
    console.error('getContactClickedLinks error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Monthly engagement over time for recharts — groups opens/clicks by month */
export async function getContactEngagementOverTime(
  contactId: string
): Promise<{ data: { month: string; opens: number; clicks: number }[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(contactId)) return { data: null, error: 'Invalid contact ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [contact] = await db
      .select({ siteId: newsletterContacts.siteId })
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contactId))
      .limit(1)

    if (!contact) return { data: null, error: 'Contact not found' }
    if (!await verifySiteOwnership(contact.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    // Group opens and clicks by month
    const rows = await db
      .select({
        month: sql<string>`to_char(${newsletterEvents.createdAt}, 'YYYY-MM')`,
        eventType: newsletterEvents.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(newsletterEvents)
      .where(and(
        eq(newsletterEvents.contactId, contactId),
        or(
          eq(newsletterEvents.eventType, 'opened'),
          eq(newsletterEvents.eventType, 'clicked'),
        ),
      ))
      .groupBy(sql`to_char(${newsletterEvents.createdAt}, 'YYYY-MM')`, newsletterEvents.eventType)
      .orderBy(sql`to_char(${newsletterEvents.createdAt}, 'YYYY-MM')`)

    // Merge into { month, opens, clicks } format
    const byMonth: Record<string, { opens: number; clicks: number }> = {}
    for (const r of rows) {
      if (!byMonth[r.month]) byMonth[r.month] = { opens: 0, clicks: 0 }
      if (r.eventType === 'opened') byMonth[r.month].opens = r.count
      if (r.eventType === 'clicked') byMonth[r.month].clicks = r.count
    }

    const data = Object.entries(byMonth).map(([month, counts]) => ({
      month,
      opens: counts.opens,
      clicks: counts.clicks,
    }))

    return { data, error: null }
  } catch (err) {
    console.error('getContactEngagementOverTime error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Public unsubscribe -- requires signed HMAC token to prevent abuse */
export async function unsubscribeContact(
  siteId: string,
  email: string,
  token: string,
  newsletterId?: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { success: false, error: 'Invalid request' }

    const emailLower = email?.toLowerCase()
    if (!emailLower) return { success: false, error: 'Invalid request' }

    if (!token || !verifyUnsubscribeToken(siteId, emailLower, token)) {
      return { success: false, error: 'Invalid unsubscribe link' }
    }

    const normalizedNewsletterId = newsletterId && UUID_REGEX.test(newsletterId) ? newsletterId : null

    const [contact] = await db
      .select({ id: newsletterContacts.id, status: newsletterContacts.status })
      .from(newsletterContacts)
      .where(and(eq(newsletterContacts.siteId, siteId), eq(newsletterContacts.email, emailLower)))
      .limit(1)

    if (!contact) {
      return { success: true, error: null }
    }

    if (contact.status !== 'unsubscribed') {
      await db
        .update(newsletterContacts)
        .set({ status: 'unsubscribed', updatedAt: new Date() })
        .where(and(eq(newsletterContacts.siteId, siteId), eq(newsletterContacts.email, emailLower)))

      if (normalizedNewsletterId) {
        await db.insert(newsletterEvents).values({
          siteId,
          contactId: contact.id,
          eventType: 'unsubscribed',
          sourceType: 'broadcast',
          sourceId: normalizedNewsletterId,
        })
      }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('unsubscribeContact error:', err)
    return { success: false, error: 'Server error' }
  }
}
