import { eq, and, sql, desc, inArray, ilike } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterSegments, newsletterSegmentContacts, newsletterContacts, newsletterSourceStats, newsletters, sites } from '@/lib/db/schema'
import { checkSiteAccess, getAuthenticatedUser, verifySiteOwnership } from '@/lib/db/helpers'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'
import {
  normalizeSegmentDynamicRule,
  type SegmentDynamicRule,
  type SegmentType,
} from '@/lib/actions/newsletters/segment-rules'
import {
  dynamicRuleExcludesSegment,
  enrollSegmentAutomationContacts,
  syncDependentDynamicSegments,
  syncDynamicSegmentMembership,
  syncDynamicSegmentsForContacts,
} from './segment-sync'

export interface Segment {
  id: string
  site_id: string
  name: string
  description: string
  segment_type: SegmentType
  dynamic_rule: SegmentDynamicRule | null
  created_at: string
  updated_at: string
}


async function getAuthorizedSegmentSiteId(segmentId: string) {
  if (!UUID_REGEX.test(segmentId)) return { siteId: null, error: 'Invalid ID' }

  const user = await getAuthenticatedUser()
  if (!user) return { siteId: null, error: 'Not authenticated' }

  const [segment] = await db
    .select({ siteId: newsletterSegments.siteId })
    .from(newsletterSegments)
    .where(eq(newsletterSegments.id, segmentId))
    .limit(1)

  if (!segment) return { siteId: null, error: 'Segment not found' }
  if (!await verifySiteOwnership(segment.siteId, user.id)) {
    return { siteId: null, error: 'Access denied' }
  }

  return { siteId: segment.siteId, error: null }
}

function rowToSegment(row: any): Segment {
  return {
    id: row.id,
    site_id: row.siteId,
    name: row.name,
    description: (row.description as string) ?? '',
    segment_type: row.segmentType === 'dynamic' ? 'dynamic' : 'static',
    dynamic_rule: normalizeSegmentDynamicRule(row.dynamicRule),
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

function normalizeSegmentType(value: unknown): SegmentType {
  return value === 'dynamic' ? 'dynamic' : 'static'
}

function validateSegmentInput(
  input: { name?: string; segmentType?: unknown; dynamicRule?: unknown },
  requireName = false
): { name?: string; segmentType: SegmentType; dynamicRule: SegmentDynamicRule | null; error: string | null } {
  const name = typeof input.name === 'string' ? input.name.trim() : undefined
  if (requireName && !name) {
    return { name, segmentType: 'static', dynamicRule: null, error: 'Segment name is required' }
  }
  if (!requireName && input.name !== undefined && !name) {
    return { name, segmentType: 'static', dynamicRule: null, error: 'Segment name is required' }
  }

  const segmentType = normalizeSegmentType(input.segmentType)
  const dynamicRule = normalizeSegmentDynamicRule(input.dynamicRule)

  if (segmentType === 'dynamic' && !dynamicRule) {
    return { name, segmentType, dynamicRule: null, error: 'Dynamic segments need a valid rule' }
  }

  if (segmentType === 'static' && input.dynamicRule !== undefined && dynamicRule) {
    return { name, segmentType, dynamicRule: null, error: 'Static segments cannot have a dynamic rule' }
  }

  return {
    name,
    segmentType,
    dynamicRule: segmentType === 'dynamic' ? dynamicRule : null,
    error: null,
  }
}

export async function getSegmentsBySiteImpl(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: Segment[] | null; total: number; error: string | null }> {
  try {
    const access = await checkSiteAccess(siteId)
    if (access.error) return { data: null, total: 0, error: access.error }

    const { page, pageSize, offset } = normalizePagination(options)

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(newsletterSegments)
        .where(eq(newsletterSegments.siteId, siteId))
        .orderBy(desc(newsletterSegments.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(newsletterSegments)
        .where(eq(newsletterSegments.siteId, siteId)),
    ])

    return { data: rows.map(rowToSegment), total: countResult[0]?.count ?? 0, error: null }
  } catch (err) {
    console.error('getSegmentsBySite error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function getSegmentByIdImpl(
  segmentId: string
): Promise<{ data: Segment | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(segmentId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [row] = await db
      .select()
      .from(newsletterSegments)
      .where(eq(newsletterSegments.id, segmentId))
      .limit(1)

    if (!row) return { data: null, error: 'Segment not found' }

    if (!await verifySiteOwnership(row.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    return { data: rowToSegment(row), error: null }
  } catch (err) {
    console.error('getSegmentById error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function getAvailableSegmentTagsImpl(siteId: string): Promise<{ data: string[]; error: string | null }> {
  try {
    const access = await checkSiteAccess(siteId)
    if (access.error) return { data: [], error: access.error }

    const rows = await db.execute<{ tag: string }>(sql`
      select distinct trim(tag.value) as tag
      from newsletter_contacts as contact,
      lateral jsonb_array_elements_text(
        case
          when jsonb_typeof(contact.metadata->'tags') = 'array' then contact.metadata->'tags'
          else '[]'::jsonb
        end
      ) as raw_tag(value),
      lateral unnest(string_to_array(raw_tag.value, ',')) as tag(value)
      where contact.site_id = ${siteId}
        and trim(tag.value) <> ''
      order by trim(tag.value)
    `)

    return { data: rows.rows.map((row) => row.tag), error: null }
  } catch (err) {
    console.error('getAvailableSegmentTags error:', err)
    return { data: [], error: 'Server error' }
  }
}

export async function createSegmentImpl(input: {
  siteId: string
  name: string
  description?: string
  segmentType?: SegmentType
  dynamicRule?: SegmentDynamicRule | null
}): Promise<{ data: Segment | null; error: string | null }> {
  try {
    const access = await checkSiteAccess(input.siteId)
    if (access.error) return { data: null, error: access.error }

    const validated = validateSegmentInput(input, true)
    if (validated.error || !validated.name) return { data: null, error: validated.error || 'Invalid segment' }
    const segmentName = validated.name

    const data = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(newsletterSegments)
        .values({
          siteId: input.siteId,
          name: segmentName,
          description: input.description || '',
          segmentType: validated.segmentType,
          dynamicRule: validated.dynamicRule,
        })
        .returning()

      if (!created) return null

      if (validated.segmentType === 'dynamic') {
        const changedContactIds = await syncDynamicSegmentMembership(tx, created)
        if (changedContactIds.length) {
          await syncDependentDynamicSegments(tx, created.siteId, created.id, changedContactIds)
        }
      }

      return created
    })

    if (!data) {
      return { data: null, error: 'Failed to create segment' }
    }

    return { data: rowToSegment(data), error: null }
  } catch (err) {
    console.error('createSegment error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function updateSegmentImpl(
  segmentId: string,
  updates: { name?: string; description?: string; segmentType?: SegmentType; dynamicRule?: SegmentDynamicRule | null }
): Promise<{ data: Segment | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(segmentId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [segment] = await db
      .select({
        siteId: newsletterSegments.siteId,
        segmentType: newsletterSegments.segmentType,
        dynamicRule: newsletterSegments.dynamicRule,
      })
      .from(newsletterSegments)
      .where(eq(newsletterSegments.id, segmentId))
      .limit(1)

    if (!segment) return { data: null, error: 'Segment not found' }

    if (!await verifySiteOwnership(segment.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const currentSegmentType = normalizeSegmentType(segment.segmentType)
    const nextSegmentType = updates.segmentType !== undefined ? normalizeSegmentType(updates.segmentType) : currentSegmentType
    const ruleSource = nextSegmentType === 'dynamic'
      ? (updates.dynamicRule !== undefined ? updates.dynamicRule : segment.dynamicRule)
      : null
    const validated = validateSegmentInput({
      name: updates.name,
      segmentType: nextSegmentType,
      dynamicRule: ruleSource,
    })
    if (validated.error) return { data: null, error: validated.error }
    if (nextSegmentType === 'dynamic' && validated.dynamicRule && dynamicRuleExcludesSegment(validated.dynamicRule, segmentId)) {
      return { data: null, error: 'A segment cannot exclude itself' }
    }

    const allowedFields: Record<string, any> = { updatedAt: new Date() }
    if (updates.name !== undefined) allowedFields.name = updates.name.trim()
    if (updates.description !== undefined) allowedFields.description = updates.description
    if (updates.segmentType !== undefined) allowedFields.segmentType = nextSegmentType
    if (updates.dynamicRule !== undefined || updates.segmentType !== undefined) {
      allowedFields.dynamicRule = nextSegmentType === 'dynamic' ? validated.dynamicRule : null
    }

    const data = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(newsletterSegments)
        .set(allowedFields)
        .where(eq(newsletterSegments.id, segmentId))
        .returning()

      if (!updated) return null

      if (nextSegmentType === 'dynamic') {
        const changedContactIds = await syncDynamicSegmentMembership(tx, updated)
        if (changedContactIds.length) {
          await syncDependentDynamicSegments(tx, updated.siteId, updated.id, changedContactIds)
        }
      }

      return updated
    })

    if (!data) {
      return { data: null, error: 'Failed to update segment' }
    }

    return { data: rowToSegment(data), error: null }
  } catch (err) {
    console.error('updateSegment error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteSegmentsImpl(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!ids.length) return { success: false, error: 'No items selected' }
    for (const id of ids) {
      if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid ID' }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const segments = await db
      .select({ id: newsletterSegments.id, siteId: newsletterSegments.siteId })
      .from(newsletterSegments)
      .where(inArray(newsletterSegments.id, ids))

    if (!segments.length) return { success: false, error: 'Not found' }

    const siteIds = [...new Set(segments.map(s => s.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied' }
    }

    await db.transaction(async (tx) => {
      const memberships = await tx
        .select({
          segmentId: newsletterSegmentContacts.segmentId,
          contactId: newsletterSegmentContacts.contactId,
        })
        .from(newsletterSegmentContacts)
        .where(inArray(newsletterSegmentContacts.segmentId, ids))

      await tx.delete(newsletterSegments).where(inArray(newsletterSegments.id, ids))

      const siteIdBySegmentId = new Map(segments.map((segment) => [segment.id, segment.siteId]))
      const contactIdsBySegmentId = new Map<string, string[]>()
      for (const membership of memberships) {
        const existing = contactIdsBySegmentId.get(membership.segmentId) || []
        existing.push(membership.contactId)
        contactIdsBySegmentId.set(membership.segmentId, existing)
      }

      for (const [deletedSegmentId, changedContactIds] of contactIdsBySegmentId.entries()) {
        const siteId = siteIdBySegmentId.get(deletedSegmentId)
        if (siteId) {
          await syncDependentDynamicSegments(tx, siteId, deletedSegmentId, changedContactIds)
        }
      }
    })

    return { success: true, error: null }
  } catch (err) {
    console.error('deleteSegments error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function getSegmentsWithCountsImpl(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: Segment[] | null; total: number; counts: Record<string, number>; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, total: 0, counts: {}, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, total: 0, counts: {}, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, total: 0, counts: {}, error: 'Access denied' }
    }

    const { page, pageSize, offset } = normalizePagination(options)

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(newsletterSegments)
        .where(eq(newsletterSegments.siteId, siteId))
        .orderBy(desc(newsletterSegments.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(newsletterSegments)
        .where(eq(newsletterSegments.siteId, siteId)),
    ])

    const segments = rows.map(rowToSegment)
    const counts: Record<string, number> = {}

    if (segments.length) {
      const segmentIds = segments.map(s => s.id)
      const countRows = await db
        .select({ segmentId: newsletterSegmentContacts.segmentId, count: sql<number>`count(*)::int` })
        .from(newsletterSegmentContacts)
        .where(inArray(newsletterSegmentContacts.segmentId, segmentIds))
        .groupBy(newsletterSegmentContacts.segmentId)

      for (const row of countRows) {
        counts[row.segmentId] = row.count
      }
      // Fill in zeros for segments with no contacts
      for (const seg of segments) {
        if (!(seg.id in counts)) counts[seg.id] = 0
      }
    }

    return { data: segments, total: countResult[0]?.count ?? 0, counts, error: null }
  } catch (err) {
    console.error('getSegmentsWithCounts error:', err)
    return { data: null, total: 0, counts: {}, error: 'Server error' }
  }
}

export async function refreshDynamicSegmentsForSiteImpl(
  siteId: string
): Promise<{ error: string | null }> {
  try {
    const access = await checkSiteAccess(siteId)
    if (access.error) return { error: access.error }

    const contacts = await db
      .select({ id: newsletterContacts.id })
      .from(newsletterContacts)
      .where(eq(newsletterContacts.siteId, siteId))

    await syncDynamicSegmentsForContacts(contacts.map((contact) => contact.id))

    return { error: null }
  } catch (err) {
    console.error('refreshDynamicSegmentsForSite error:', err)
    return { error: 'Server error' }
  }
}

export async function addContactsToSegmentImpl(
  contactIds: string[],
  segmentId: string
): Promise<{ added: number; error: string | null }> {
  try {
    if (!contactIds.length) return { added: 0, error: 'No contacts selected' }
    if (!UUID_REGEX.test(segmentId)) return { added: 0, error: 'Invalid segment ID' }
    for (const id of contactIds) {
      if (!UUID_REGEX.test(id)) return { added: 0, error: 'Invalid contact ID' }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { added: 0, error: 'Not authenticated' }

    const [segment] = await db
      .select({ siteId: newsletterSegments.siteId, segmentType: newsletterSegments.segmentType })
      .from(newsletterSegments)
      .where(eq(newsletterSegments.id, segmentId))
      .limit(1)

    if (!segment) return { added: 0, error: 'Segment not found' }
    if (segment.segmentType === 'dynamic') return { added: 0, error: 'Dynamic segment membership is automatic' }

    if (!await verifySiteOwnership(segment.siteId, user.id)) {
      return { added: 0, error: 'Access denied' }
    }

    // Verify contacts belong to the same site
    const contacts = await db
      .select({ id: newsletterContacts.id })
      .from(newsletterContacts)
      .where(and(inArray(newsletterContacts.id, contactIds), eq(newsletterContacts.siteId, segment.siteId)))

    if (!contacts.length) return { added: 0, error: 'No matching contacts found' }

    const values = contacts.map(c => ({ segmentId, contactId: c.id }))
    const result = await db
      .insert(newsletterSegmentContacts)
      .values(values)
      .onConflictDoNothing()
      .returning({ contactId: newsletterSegmentContacts.contactId })

    await enrollSegmentAutomationContacts(db, segment.siteId, segmentId, result.map((entry) => entry.contactId))
    if (result.length) {
      await syncDependentDynamicSegments(db, segment.siteId, segmentId, result.map((entry) => entry.contactId))
    }

    return { added: result.length, error: null }
  } catch (err) {
    console.error('addContactsToSegment error:', err)
    return { added: 0, error: 'Server error' }
  }
}

export async function removeContactsFromSegmentImpl(
  contactIds: string[],
  segmentId: string
): Promise<{ removed: number; error: string | null }> {
  try {
    if (!contactIds.length) return { removed: 0, error: 'No contacts selected' }
    if (!UUID_REGEX.test(segmentId)) return { removed: 0, error: 'Invalid segment ID' }
    for (const id of contactIds) {
      if (!UUID_REGEX.test(id)) return { removed: 0, error: 'Invalid contact ID' }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { removed: 0, error: 'Not authenticated' }

    const [segment] = await db
      .select({ siteId: newsletterSegments.siteId, segmentType: newsletterSegments.segmentType })
      .from(newsletterSegments)
      .where(eq(newsletterSegments.id, segmentId))
      .limit(1)

    if (!segment) return { removed: 0, error: 'Segment not found' }
    if (segment.segmentType === 'dynamic') return { removed: 0, error: 'Dynamic segment membership is automatic' }

    if (!await verifySiteOwnership(segment.siteId, user.id)) {
      return { removed: 0, error: 'Access denied' }
    }

    const result = await db
      .delete(newsletterSegmentContacts)
      .where(and(
        eq(newsletterSegmentContacts.segmentId, segmentId),
        inArray(newsletterSegmentContacts.contactId, contactIds)
      ))
      .returning({ contactId: newsletterSegmentContacts.contactId })

    if (result.length) {
      await syncDependentDynamicSegments(db, segment.siteId, segmentId, result.map((entry) => entry.contactId))
    }

    return { removed: result.length, error: null }
  } catch (err) {
    console.error('removeContactsFromSegment error:', err)
    return { removed: 0, error: 'Server error' }
  }
}

/** Aggregate stats for a segment: contact count, event counts, and rates */
export async function getSegmentStatsImpl(
  segmentId: string
): Promise<{ data: { totalContacts: number; totalSent: number; totalOpened: number; totalClicked: number; openRate: number; clickRate: number; unsubscribeRate: number } | null; error: string | null }> {
  try {
    const authResult = await getAuthorizedSegmentSiteId(segmentId)
    if (authResult.error) return { data: null, error: authResult.error }

    const [contactStats, eventStats] = await Promise.all([
      db
        .select({
          totalContacts: sql<number>`count(*)::int`,
          unsubscribedCount: sql<number>`count(*) filter (where ${newsletterContacts.status} = 'unsubscribed')::int`,
        })
        .from(newsletterSegmentContacts)
        .innerJoin(newsletterContacts, eq(newsletterSegmentContacts.contactId, newsletterContacts.id))
        .where(eq(newsletterSegmentContacts.segmentId, segmentId)),
      db.execute<{ sent: number; opened: number; clicked: number }>(sql`
        select
          count(*) filter (where d.is_duplicate_send = false)::int as sent,
          count(*) filter (where d.first_opened_at is not null)::int as opened,
          count(*) filter (where d.first_clicked_at is not null)::int as clicked
        from newsletter_segment_contacts sc
        join newsletter_deliveries d on d.contact_id = sc.contact_id
        where sc.segment_id = ${segmentId}
      `),
    ])

    const totalContacts = contactStats[0]?.totalContacts ?? 0
    const unsubscribedCount = contactStats[0]?.unsubscribedCount ?? 0
    const unsubscribeRate = totalContacts > 0 ? Math.round((unsubscribedCount / totalContacts) * 100) : 0

    const totalSent = Number(eventStats.rows[0]?.sent ?? 0)
    const totalOpened = Number(eventStats.rows[0]?.opened ?? 0)
    const totalClicked = Number(eventStats.rows[0]?.clicked ?? 0)
    const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0
    const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0

    return { data: { totalContacts, totalSent, totalOpened, totalClicked, openRate, clickRate, unsubscribeRate }, error: null }
  } catch (err) {
    console.error('getSegmentStats error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Paginated contacts in a segment */
export async function getSegmentContactsImpl(
  segmentId: string,
  page = 1,
  pageSize = 20
): Promise<{ data: { id: string; email: string; status: string; metadata: any; createdAt: string }[] | null; total: number; error: string | null }> {
  try {
    const authResult = await getAuthorizedSegmentSiteId(segmentId)
    if (authResult.error) return { data: null, total: 0, error: authResult.error }

    const safePage = Math.max(1, Math.floor(page))
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))
    const offset = (safePage - 1) * safePageSize

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: newsletterContacts.id,
          email: newsletterContacts.email,
          status: newsletterContacts.status,
          metadata: newsletterContacts.metadata,
          createdAt: newsletterContacts.createdAt,
        })
        .from(newsletterSegmentContacts)
        .innerJoin(newsletterContacts, eq(newsletterSegmentContacts.contactId, newsletterContacts.id))
        .where(eq(newsletterSegmentContacts.segmentId, segmentId))
        .orderBy(desc(newsletterContacts.createdAt))
        .limit(safePageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(newsletterSegmentContacts)
        .where(eq(newsletterSegmentContacts.segmentId, segmentId)),
    ])

    return {
      data: rows.map(r => ({
        id: r.id,
        email: r.email,
        status: r.status ?? 'active',
        metadata: r.metadata,
        createdAt: r.createdAt?.toISOString() ?? '',
      })),
      total: countResult[0]?.count ?? 0,
      error: null,
    }
  } catch (err) {
    console.error('getSegmentContacts error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

/** Monthly engagement over time for all contacts in a segment */
export async function getSegmentEngagementOverTimeImpl(
  segmentId: string
): Promise<{ data: { month: string; opens: number; clicks: number }[] | null; error: string | null }> {
  try {
    const authResult = await getAuthorizedSegmentSiteId(segmentId)
    if (authResult.error) return { data: null, error: authResult.error }

    const rows = await db.execute<{ month: string; opens: number; clicks: number }>(sql`
      with engagement_events as (
        select d.first_opened_at as event_at, 1 as opens, 0 as clicks
        from newsletter_segment_contacts sc
        join newsletter_deliveries d on d.contact_id = sc.contact_id
        where sc.segment_id = ${segmentId}
          and d.first_opened_at is not null
        union all
        select d.first_clicked_at as event_at, 0 as opens, 1 as clicks
        from newsletter_segment_contacts sc
        join newsletter_deliveries d on d.contact_id = sc.contact_id
        where sc.segment_id = ${segmentId}
          and d.first_clicked_at is not null
      )
      select
        to_char(event_at, 'YYYY-MM') as month,
        sum(opens)::int as opens,
        sum(clicks)::int as clicks
      from engagement_events
      group by to_char(event_at, 'YYYY-MM')
      order by to_char(event_at, 'YYYY-MM')
    `)

    return {
      data: rows.rows.map((row) => ({
        month: row.month,
        opens: Number(row.opens ?? 0),
        clicks: Number(row.clicks ?? 0),
      })),
      error: null,
    }
  } catch (err) {
    console.error('getSegmentEngagementOverTime error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Newsletters that targeted this segment via audience_filter */
export async function getSegmentNewslettersImpl(
  segmentId: string
): Promise<{ data: { id: string; name: string; subject: string; status: string; sentAt: string | null; totalSent: number; totalOpened: number; totalClicked: number }[] | null; error: string | null }> {
  try {
    const authResult = await getAuthorizedSegmentSiteId(segmentId)
    if (authResult.error) return { data: null, error: authResult.error }

    // Find newsletters where audience_filter->>'segment_id' matches this segment
    const rows = await db
      .select({
        id: newsletters.id,
        name: newsletters.name,
        subject: newsletters.subject,
        status: newsletters.status,
        sentAt: newsletters.sentAt,
        totalSent: newsletterSourceStats.sent,
        totalOpened: newsletterSourceStats.opened,
        totalClicked: newsletterSourceStats.clicked,
      })
      .from(newsletters)
      .leftJoin(newsletterSourceStats, and(
        eq(newsletterSourceStats.siteId, newsletters.siteId),
        eq(newsletterSourceStats.sourceType, 'broadcast'),
        eq(newsletterSourceStats.sourceId, newsletters.id),
        eq(newsletterSourceStats.stepOrder, 0),
      ))
      .where(and(
        eq(newsletters.siteId, authResult.siteId!),
        sql`${newsletters.audienceFilter}->>'segment_id' = ${segmentId}`,
      ))
      .orderBy(desc(newsletters.sentAt))

    return {
      data: rows.map(r => ({
        id: r.id,
        name: r.name ?? '',
        subject: r.subject ?? '',
        status: r.status ?? 'draft',
        sentAt: r.sentAt?.toISOString() ?? null,
        totalSent: r.totalSent ?? 0,
        totalOpened: r.totalOpened ?? 0,
        totalClicked: r.totalClicked ?? 0,
      })),
      error: null,
    }
  } catch (err) {
    console.error('getSegmentNewsletters error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Search contacts NOT already in this segment — for the "Add Contact" autocomplete */
export async function searchContactsForSegmentImpl(
  segmentId: string,
  query: string
): Promise<{ data: { id: string; email: string; metadata: any }[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(segmentId)) return { data: null, error: 'Invalid ID' }
    if (!query || query.length < 2) return { data: [], error: null }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [segment] = await db
      .select({ siteId: newsletterSegments.siteId, segmentType: newsletterSegments.segmentType })
      .from(newsletterSegments)
      .where(eq(newsletterSegments.id, segmentId))
      .limit(1)

    if (!segment) return { data: null, error: 'Segment not found' }
    if (segment.segmentType === 'dynamic') return { data: null, error: 'Dynamic segment membership is automatic' }
    if (!await verifySiteOwnership(segment.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    // Find contacts matching the email query that are NOT already in this segment
    const rows = await db
      .select({
        id: newsletterContacts.id,
        email: newsletterContacts.email,
        metadata: newsletterContacts.metadata,
      })
      .from(newsletterContacts)
      .where(and(
        eq(newsletterContacts.siteId, segment.siteId),
        ilike(newsletterContacts.email, `%${query}%`),
        sql`NOT EXISTS (
          SELECT 1 FROM ${newsletterSegmentContacts}
          WHERE ${newsletterSegmentContacts.segmentId} = ${segmentId}
          AND ${newsletterSegmentContacts.contactId} = ${newsletterContacts.id}
        )`,
      ))
      .limit(10)

    return {
      data: rows.map(r => ({
        id: r.id,
        email: r.email,
        metadata: r.metadata,
      })),
      error: null,
    }
  } catch (err) {
    console.error('searchContactsForSegment error:', err)
    return { data: null, error: 'Server error' }
  }
}

export type { SegmentType, SegmentDynamicRule }
