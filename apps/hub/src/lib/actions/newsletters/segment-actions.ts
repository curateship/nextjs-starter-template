'use server'

import { eq, and, sql, desc, inArray, or, ilike, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterSegments, newsletterSegmentContacts, newsletterContacts, newsletterEvents, newsletters, sites, emailAutomationEnrollments } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { findActiveAutomations } from './automation-actions'
import {
  formatSegmentDynamicRule,
  normalizeSegmentDynamicRule,
  type SegmentDynamicCondition,
  type SegmentDynamicRule,
  type SegmentType,
} from '@/lib/newsletters/segment-rules'

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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
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

function dynamicRuleExcludesSegment(dynamicRule: unknown, segmentId: string) {
  const normalizedRule = normalizeSegmentDynamicRule(dynamicRule)
  return normalizedRule?.conditions.some((condition) => (
    condition.type === 'segment_exclusion' && condition.segment_id === segmentId
  )) ?? false
}

async function enrollSegmentAutomationContacts(
  executor: any,
  siteId: string,
  segmentId: string,
  contactIds: string[]
) {
  if (!contactIds.length) return

  const automations = await findActiveAutomations(siteId, 'segment_added', segmentId)
  if (!automations.length) return

  const enrollmentValues = automations.flatMap((automation) =>
    contactIds.map((contactId) => ({
      automationId: automation.id,
      contactId,
      metadata: {
        source: 'segment_added',
        segment_id: segmentId,
      },
    }))
  )

  if (!enrollmentValues.length) return

  await executor
    .insert(emailAutomationEnrollments)
    .values(enrollmentValues)
    .onConflictDoNothing()
}

function buildDynamicSegmentCondition(condition: SegmentDynamicCondition) {
  if (condition.type === 'last_engaged_within_days') {
    const cutoff = new Date(Date.now() - condition.days * 24 * 60 * 60 * 1000)
    return condition.operator === 'is'
      ? and(
          sql`${newsletterContacts.lastEngagedAt} IS NOT NULL`,
          sql`${newsletterContacts.lastEngagedAt} >= ${cutoff}`,
        )
      : or(
          sql`${newsletterContacts.lastEngagedAt} IS NULL`,
          sql`${newsletterContacts.lastEngagedAt} < ${cutoff}`,
        )
  }

  if (condition.type === 'email_open_count') {
    const recentEmails = sql`
      select sent.source_type, sent.source_id
      from newsletter_events as sent
      where sent.site_id = ${newsletterContacts.siteId}
        and sent.event_type = 'sent'
        and sent.source_id is not null
      group by sent.source_type, sent.source_id
      order by max(sent.created_at) desc
      limit ${condition.times}
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

    return condition.operator === 'has_opened'
      ? hasOpenedRecentEmail
      : sql`not ${hasOpenedRecentEmail}`
  }

  if (condition.type === 'status_match') {
    return condition.operator === 'is'
      ? eq(newsletterContacts.status, condition.status)
      : ne(newsletterContacts.status, condition.status)
  }

  if (condition.type === 'segment_exclusion') {
    return sql`not exists (
      select 1
      from ${newsletterSegmentContacts}
      where ${newsletterSegmentContacts.segmentId} = ${condition.segment_id}
        and ${newsletterSegmentContacts.contactId} = ${newsletterContacts.id}
    )`
  }

  const tagArray = sql`CASE WHEN jsonb_typeof(${newsletterContacts.metadata}->'tags') = 'array' THEN ${newsletterContacts.metadata}->'tags' ELSE '[]'::jsonb END`
  const tags = condition.tags.map((tag) => tag.toLowerCase())

  const matchesTags = sql`exists (
    select 1
    from jsonb_array_elements_text(${tagArray}) as raw_tag(value)
    cross join lateral unnest(string_to_array(raw_tag.value, ',')) as split_tag(value)
    where lower(trim(split_tag.value)) in (${sql.join(tags.map((tag) => sql`${tag}`), sql`, `)})
  )`

  return condition.operator === 'includes'
    ? matchesTags
    : sql`not ${matchesTags}`
}

async function syncDynamicSegmentMembership(
  executor: any,
  segment: { id: string; siteId: string; segmentType: string; dynamicRule: unknown },
  options?: { contactIds?: string[] }
) {
  if (segment.segmentType !== 'dynamic') return []

  const dynamicRule = normalizeSegmentDynamicRule(segment.dynamicRule)
  if (!dynamicRule) return []

  const normalizedContactIds = options?.contactIds?.filter((id) => UUID_REGEX.test(id)) ?? []
  const useScopedContacts = normalizedContactIds.length > 0
  const ruleConditions = dynamicRule.conditions.map(buildDynamicSegmentCondition)

  const matchingContacts = await executor
    .select({ id: newsletterContacts.id })
    .from(newsletterContacts)
    .where(and(
      eq(newsletterContacts.siteId, segment.siteId),
      ...ruleConditions,
      ...(useScopedContacts ? [inArray(newsletterContacts.id, normalizedContactIds)] : []),
    ))

  const existingMemberships = await executor
    .select({ contactId: newsletterSegmentContacts.contactId })
    .from(newsletterSegmentContacts)
    .where(and(
      eq(newsletterSegmentContacts.segmentId, segment.id),
      ...(useScopedContacts ? [inArray(newsletterSegmentContacts.contactId, normalizedContactIds)] : []),
    ))

  const matchingIds = new Set<string>(matchingContacts.map((row: { id: string }) => row.id))
  const existingIds = new Set<string>(existingMemberships.map((row: { contactId: string }) => row.contactId))

  const toAdd: string[] = Array.from(matchingIds).filter((id) => !existingIds.has(id))
  const toRemove: string[] = Array.from(existingIds).filter((id) => !matchingIds.has(id))
  const changedContactIds = new Set<string>()

  if (toAdd.length) {
    const inserted = await executor
      .insert(newsletterSegmentContacts)
      .values(toAdd.map((contactId) => ({ segmentId: segment.id, contactId })))
      .onConflictDoNothing()
      .returning({ contactId: newsletterSegmentContacts.contactId })

    for (const row of inserted) changedContactIds.add(row.contactId)
    await enrollSegmentAutomationContacts(executor, segment.siteId, segment.id, inserted.map((row: { contactId: string }) => row.contactId))
  }

  if (toRemove.length) {
    await executor
      .delete(newsletterSegmentContacts)
      .where(and(
        eq(newsletterSegmentContacts.segmentId, segment.id),
        inArray(newsletterSegmentContacts.contactId, toRemove),
      ))
    for (const id of toRemove) changedContactIds.add(id)
  }

  return Array.from(changedContactIds)
}

async function syncDependentDynamicSegments(
  executor: any,
  siteId: string,
  segmentId: string,
  contactIds?: string[],
  visitedSegmentIds = new Set<string>()
) {
  if (visitedSegmentIds.has(segmentId)) return
  visitedSegmentIds.add(segmentId)

  const segments = await executor
    .select({
      id: newsletterSegments.id,
      siteId: newsletterSegments.siteId,
      segmentType: newsletterSegments.segmentType,
      dynamicRule: newsletterSegments.dynamicRule,
    })
    .from(newsletterSegments)
    .where(and(
      eq(newsletterSegments.siteId, siteId),
      eq(newsletterSegments.segmentType, 'dynamic'),
    ))

  for (const dependentSegment of segments) {
    if (visitedSegmentIds.has(dependentSegment.id)) continue
    if (!dynamicRuleExcludesSegment(dependentSegment.dynamicRule, segmentId)) continue

    const changedContactIds = await syncDynamicSegmentMembership(
      executor,
      dependentSegment,
      contactIds?.length ? { contactIds } : undefined,
    )
    if (changedContactIds.length) {
      await syncDependentDynamicSegments(executor, siteId, dependentSegment.id, changedContactIds, visitedSegmentIds)
    }
  }
}

export async function syncDynamicSegmentsForContacts(contactIds: string[]): Promise<void> {
  const ids = [...new Set(contactIds.filter((id) => UUID_REGEX.test(id)))]
  if (!ids.length) return

  const siteRows = await db
    .select({ id: newsletterContacts.id, siteId: newsletterContacts.siteId })
    .from(newsletterContacts)
    .where(inArray(newsletterContacts.id, ids))

  const idsBySite = new Map<string, string[]>()
  for (const row of siteRows) {
    const existing = idsBySite.get(row.siteId) || []
    existing.push(row.id)
    idsBySite.set(row.siteId, existing)
  }

  for (const [siteId, scopedIds] of idsBySite.entries()) {
    const segments = await db
      .select({
        id: newsletterSegments.id,
        siteId: newsletterSegments.siteId,
        segmentType: newsletterSegments.segmentType,
        dynamicRule: newsletterSegments.dynamicRule,
      })
      .from(newsletterSegments)
      .where(and(
        eq(newsletterSegments.siteId, siteId),
        eq(newsletterSegments.segmentType, 'dynamic'),
      ))

    for (const segment of segments) {
      const changedContactIds = await syncDynamicSegmentMembership(db, segment, { contactIds: scopedIds })
      if (changedContactIds.length) {
        await syncDependentDynamicSegments(db, siteId, segment.id, changedContactIds)
      }
    }
  }
}

export async function syncAllDynamicSegments(): Promise<void> {
  const segments = await db
    .select({
      id: newsletterSegments.id,
      siteId: newsletterSegments.siteId,
      segmentType: newsletterSegments.segmentType,
      dynamicRule: newsletterSegments.dynamicRule,
    })
    .from(newsletterSegments)
    .where(eq(newsletterSegments.segmentType, 'dynamic'))

  for (const segment of segments) {
    const changedContactIds = await syncDynamicSegmentMembership(db, segment)
    if (changedContactIds.length) {
      await syncDependentDynamicSegments(db, segment.siteId, segment.id, changedContactIds)
    }
  }
}

export async function getSegmentsBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: Segment[] | null; total: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, total: 0, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, total: 0, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, total: 0, error: 'Access denied' }
    }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const offset = (page - 1) * pageSize

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

/** Returns only segment IDs for bulk selection — lightweight alternative to full record fetch */
export async function getSegmentIdsAction(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { ids: [], error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { ids: [], error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { ids: [], error: 'Access denied' }
    }

    const rows = await db
      .select({ id: newsletterSegments.id })
      .from(newsletterSegments)
      .where(eq(newsletterSegments.siteId, siteId))

    return { ids: rows.map(r => r.id), error: null }
  } catch (err) {
    return { ids: [], error: 'Server error' }
  }
}

export async function getSegmentById(
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

export async function getAvailableSegmentTags(siteId: string): Promise<{ data: string[]; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: [], error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: [], error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: [], error: 'Access denied' }
    }

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

export async function createSegment(input: {
  siteId: string
  name: string
  description?: string
  segmentType?: SegmentType
  dynamicRule?: SegmentDynamicRule | null
}): Promise<{ data: Segment | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

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

export async function updateSegment(
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

export async function deleteSegments(ids: string[]): Promise<{ success: boolean; error: string | null }> {
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

export async function getSegmentsWithCounts(
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

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const offset = (page - 1) * pageSize

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

export async function addContactsToSegment(
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

export async function removeContactsFromSegment(
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

/** Aggregate stats for a segment: contact count, event counts, rates, avg engagement */
export async function getSegmentStats(
  segmentId: string
): Promise<{ data: { totalContacts: number; totalSent: number; totalOpened: number; totalClicked: number; openRate: number; clickRate: number; unsubscribeRate: number; avgEngagementScore: number } | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(segmentId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [segment] = await db
      .select({ siteId: newsletterSegments.siteId })
      .from(newsletterSegments)
      .where(eq(newsletterSegments.id, segmentId))
      .limit(1)

    if (!segment) return { data: null, error: 'Segment not found' }
    if (!await verifySiteOwnership(segment.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    // Query 1: contact count + avg engagement score from segment contacts
    // Query 2: event type counts for all contacts in the segment
    const [contactStats, eventStats] = await Promise.all([
      db
        .select({
          totalContacts: sql<number>`count(*)::int`,
          unsubscribedCount: sql<number>`count(*) filter (where ${newsletterContacts.status} = 'unsubscribed')::int`,
          avgEngagementScore: sql<number>`coalesce(round(avg(${newsletterContacts.engagementScore}))::int, 0)`,
        })
        .from(newsletterSegmentContacts)
        .innerJoin(newsletterContacts, eq(newsletterSegmentContacts.contactId, newsletterContacts.id))
        .where(eq(newsletterSegmentContacts.segmentId, segmentId)),
      db
        .select({
          eventType: newsletterEvents.eventType,
          count: sql<number>`count(*)::int`,
        })
        .from(newsletterSegmentContacts)
        .innerJoin(newsletterEvents, eq(newsletterSegmentContacts.contactId, newsletterEvents.contactId))
        .where(eq(newsletterSegmentContacts.segmentId, segmentId))
        .groupBy(newsletterEvents.eventType),
    ])

    const totalContacts = contactStats[0]?.totalContacts ?? 0
    const unsubscribedCount = contactStats[0]?.unsubscribedCount ?? 0
    const unsubscribeRate = totalContacts > 0 ? Math.round((unsubscribedCount / totalContacts) * 100) : 0
    const avgEngagementScore = contactStats[0]?.avgEngagementScore ?? 0

    // Sum up event counts by type
    const counts: Record<string, number> = {}
    for (const r of eventStats) counts[r.eventType] = r.count

    const totalSent = counts['sent'] || 0
    const totalOpened = counts['opened'] || 0
    const totalClicked = counts['clicked'] || 0
    const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0
    const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0

    return { data: { totalContacts, totalSent, totalOpened, totalClicked, openRate, clickRate, unsubscribeRate, avgEngagementScore }, error: null }
  } catch (err) {
    console.error('getSegmentStats error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Paginated contacts in a segment */
export async function getSegmentContacts(
  segmentId: string,
  page = 1,
  pageSize = 20
): Promise<{ data: { id: string; email: string; status: string; engagementScore: number; metadata: any; createdAt: string }[] | null; total: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(segmentId)) return { data: null, total: 0, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, total: 0, error: 'Not authenticated' }

    const [segment] = await db
      .select({ siteId: newsletterSegments.siteId })
      .from(newsletterSegments)
      .where(eq(newsletterSegments.id, segmentId))
      .limit(1)

    if (!segment) return { data: null, total: 0, error: 'Segment not found' }
    if (!await verifySiteOwnership(segment.siteId, user.id)) {
      return { data: null, total: 0, error: 'Access denied' }
    }

    const safePage = Math.max(1, Math.floor(page))
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))
    const offset = (safePage - 1) * safePageSize

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: newsletterContacts.id,
          email: newsletterContacts.email,
          status: newsletterContacts.status,
          engagementScore: newsletterContacts.engagementScore,
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
        engagementScore: r.engagementScore ?? 0,
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
export async function getSegmentEngagementOverTime(
  segmentId: string
): Promise<{ data: { month: string; opens: number; clicks: number }[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(segmentId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [segment] = await db
      .select({ siteId: newsletterSegments.siteId })
      .from(newsletterSegments)
      .where(eq(newsletterSegments.id, segmentId))
      .limit(1)

    if (!segment) return { data: null, error: 'Segment not found' }
    if (!await verifySiteOwnership(segment.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    // Group opens and clicks by month across all segment contacts
    const rows = await db
      .select({
        month: sql<string>`to_char(${newsletterEvents.createdAt}, 'YYYY-MM')`,
        eventType: newsletterEvents.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(newsletterSegmentContacts)
      .innerJoin(newsletterEvents, eq(newsletterSegmentContacts.contactId, newsletterEvents.contactId))
      .where(and(
        eq(newsletterSegmentContacts.segmentId, segmentId),
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
    console.error('getSegmentEngagementOverTime error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Newsletters that targeted this segment via audience_filter */
export async function getSegmentNewsletters(
  segmentId: string
): Promise<{ data: { id: string; name: string; subject: string; status: string; sentAt: string | null; totalSent: number; totalOpened: number; totalClicked: number }[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(segmentId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [segment] = await db
      .select({ siteId: newsletterSegments.siteId })
      .from(newsletterSegments)
      .where(eq(newsletterSegments.id, segmentId))
      .limit(1)

    if (!segment) return { data: null, error: 'Segment not found' }
    if (!await verifySiteOwnership(segment.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    // Find newsletters where audience_filter->>'segment_id' matches this segment
    const rows = await db
      .select({
        id: newsletters.id,
        name: newsletters.name,
        subject: newsletters.subject,
        status: newsletters.status,
        sentAt: newsletters.sentAt,
        totalSent: newsletters.totalSent,
        totalOpened: newsletters.totalOpened,
        totalClicked: newsletters.totalClicked,
      })
      .from(newsletters)
      .where(and(
        eq(newsletters.siteId, segment.siteId),
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
export async function searchContactsForSegment(
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

export { formatSegmentDynamicRule }
