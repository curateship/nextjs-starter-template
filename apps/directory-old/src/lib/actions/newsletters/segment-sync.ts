import { and, eq, inArray, ne, or, sql } from 'drizzle-orm'

import { findActiveAutomations } from './automation-enrollment'
import { buildRecentEmailOpenCondition } from '@/lib/actions/newsletters/event-stats'
import { db } from '@/lib/db'
import {
  emailAutomationEnrollments,
  newsletterContacts,
  newsletterSegmentContacts,
  newsletterSegments,
} from '@/lib/db/schema'
import {
  normalizeSegmentDynamicRule,
  type SegmentDynamicCondition,
} from '@/lib/actions/newsletters/segment-rules'
import { UUID_REGEX } from '@/lib/utils/validation'

export function dynamicRuleExcludesSegment(dynamicRule: unknown, segmentId: string) {
  const normalizedRule = normalizeSegmentDynamicRule(dynamicRule)
  return normalizedRule?.conditions.some((condition) => (
    condition.type === 'segment_exclusion' && condition.segment_ids.includes(segmentId)
  )) ?? false
}

export async function enrollSegmentAutomationContacts(
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
    return buildRecentEmailOpenCondition(condition.times, condition.operator)
  }

  if (condition.type === 'status_match') {
    return condition.operator === 'is'
      ? eq(newsletterContacts.status, condition.status)
      : ne(newsletterContacts.status, condition.status)
  }

  if (condition.type === 'segment_exclusion') {
    const segmentIds = condition.segment_ids.map((id) => sql`${id}::uuid`)

    return sql`not exists (
      select 1
      from ${newsletterSegmentContacts}
      where ${newsletterSegmentContacts.segmentId} in (${sql.join(segmentIds, sql`, `)})
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

export async function syncDynamicSegmentMembership(
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

export async function syncDependentDynamicSegments(
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
