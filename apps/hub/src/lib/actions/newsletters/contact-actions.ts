'use server'

import { eq, and, or, sql, desc, inArray, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterContacts, newsletterEvents, newsletters, newsletterSegments, newsletterSegmentContacts, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { verifyUnsubscribeToken } from '@/lib/utils/unsubscribe-token'

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

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
}

function rowToContact(row: any): CrmContact {
  return {
    id: row.id,
    site_id: row.siteId,
    email: row.email,
    status: row.status,
    engagement_score: row.engagementScore ?? 0,
    last_engaged_at: row.lastEngagedAt?.toISOString() ?? null,
    bounce_count: row.bounceCount ?? 0,
    metadata: row.metadata ?? {},
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
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
        set: { metadata, updatedAt: new Date() },
      })
      .returning()

    if (!data) {
      return { data: null, error: 'Failed to save contact' }
    }
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
              metadata: sql`excluded.metadata`,
              updatedAt: new Date(),
            },
          })
          .returning({ id: newsletterContacts.id })

        imported += result.length
      } catch (err) {
        console.error('bulkImportContacts batch error:', err)
        return { imported, skipped, error: 'Failed to import batch' }
      }
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
    sources?: string[]
    statuses?: string[]
    createdAfter?: string
    createdBefore?: string
    engagedAfter?: string
    engagedBefore?: string
  }
): Promise<{ ids: string[]; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { ids: [], error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { ids: [], error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { ids: [], error: 'Access denied' }
    }

    const conditions = [eq(newsletterContacts.siteId, siteId)]
    if (options?.sources?.length) {
      conditions.push(or(...options.sources.map(s => sql`${newsletterContacts.metadata}->>'source' = ${s}`))!)
    }
    if (options?.statuses?.length) {
      conditions.push(inArray(newsletterContacts.status, options.statuses))
    }
    if (options?.createdAfter) {
      conditions.push(gte(newsletterContacts.createdAt, new Date(options.createdAfter)))
    }
    if (options?.createdBefore) {
      conditions.push(lte(newsletterContacts.createdAt, new Date(options.createdBefore)))
    }
    if (options?.engagedAfter) {
      conditions.push(gte(newsletterContacts.lastEngagedAt, new Date(options.engagedAfter)))
    }
    if (options?.engagedBefore) {
      conditions.push(lte(newsletterContacts.lastEngagedAt, new Date(options.engagedBefore)))
    }

    const rows = await db
      .select({ id: newsletterContacts.id })
      .from(newsletterContacts)
      .where(and(...conditions))

    return { ids: rows.map(r => r.id), error: null }
  } catch (err) {
    return { ids: [], error: 'Server error' }
  }
}

export async function getContactsWithStats(
  siteId: string,
  options?: {
    source?: string
    status?: string
    sources?: string[]
    statuses?: string[]
    createdAfter?: string
    createdBefore?: string
    engagedAfter?: string
    engagedBefore?: string
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

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const offset = (page - 1) * pageSize

    // Build where conditions for contacts query
    const conditions = [eq(newsletterContacts.siteId, siteId)]
    if (options?.source && options.source !== 'all') {
      conditions.push(sql`${newsletterContacts.metadata}->>'source' = ${options.source}`)
    }
    if (options?.status && options.status !== 'all') {
      conditions.push(eq(newsletterContacts.status, options.status))
    }

    // Multi-select filters
    if (options?.sources?.length) {
      conditions.push(or(...options.sources.map(s => sql`${newsletterContacts.metadata}->>'source' = ${s}`))!)
    }
    if (options?.statuses?.length) {
      conditions.push(inArray(newsletterContacts.status, options.statuses))
    }
    if (options?.createdAfter) {
      conditions.push(gte(newsletterContacts.createdAt, new Date(options.createdAfter)))
    }
    if (options?.createdBefore) {
      conditions.push(lte(newsletterContacts.createdAt, new Date(options.createdBefore)))
    }
    if (options?.engagedAfter) {
      conditions.push(gte(newsletterContacts.lastEngagedAt, new Date(options.engagedAfter)))
    }
    if (options?.engagedBefore) {
      conditions.push(lte(newsletterContacts.lastEngagedAt, new Date(options.engagedBefore)))
    }

    const whereClause = and(...conditions)

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

    return { data: rowToContact(contact), error: null }
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
  token: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { success: false, error: 'Invalid request' }

    const emailLower = email?.toLowerCase()
    if (!emailLower) return { success: false, error: 'Invalid request' }

    if (!token || !verifyUnsubscribeToken(siteId, emailLower, token)) {
      return { success: false, error: 'Invalid unsubscribe link' }
    }

    // Intentionally returns success even if no row matched, to prevent email enumeration
    await db
      .update(newsletterContacts)
      .set({ status: 'unsubscribed', updatedAt: new Date() })
      .where(and(eq(newsletterContacts.siteId, siteId), eq(newsletterContacts.email, emailLower)))

    return { success: true, error: null }
  } catch (err) {
    console.error('unsubscribeContact error:', err)
    return { success: false, error: 'Server error' }
  }
}
