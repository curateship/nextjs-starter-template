'use server'

import { eq, and, sql, desc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterSegments, newsletterContacts, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'

export interface Segment {
  id: string
  site_id: string
  name: string
  description: string
  filter_rules: { tags?: string[] }
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
    filter_rules: (row.filterRules as { tags?: string[] }) ?? {},
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
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

export async function createSegment(input: {
  siteId: string
  name: string
  description?: string
  filterRules: { tags?: string[] }
}): Promise<{ data: Segment | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    if (!input.name?.trim()) return { data: null, error: 'Segment name is required' }

    const [data] = await db
      .insert(newsletterSegments)
      .values({
        siteId: input.siteId,
        name: input.name.trim(),
        description: input.description || '',
        filterRules: input.filterRules || {},
      })
      .returning()

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
  updates: { name?: string; description?: string; filterRules?: { tags?: string[] } }
): Promise<{ data: Segment | null; error: string | null }> {
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

    const allowedFields: Record<string, any> = { updatedAt: new Date() }
    if (updates.name !== undefined) allowedFields.name = updates.name
    if (updates.description !== undefined) allowedFields.description = updates.description
    if (updates.filterRules !== undefined) allowedFields.filterRules = updates.filterRules

    const [data] = await db
      .update(newsletterSegments)
      .set(allowedFields)
      .where(eq(newsletterSegments.id, segmentId))
      .returning()

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

    await db.delete(newsletterSegments).where(inArray(newsletterSegments.id, ids))

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
      await Promise.all(
        segments.map(async (seg) => {
          const conditions = [
            eq(newsletterContacts.siteId, siteId),
            eq(newsletterContacts.status, 'active'),
          ]

          const rules = seg.filter_rules as { tags?: string[] }
          if (rules.tags?.length) {
            for (const tag of rules.tags) {
              conditions.push(sql`${newsletterContacts.metadata} @> ${JSON.stringify({ tags: [tag] })}::jsonb`)
            }
          }

          const [result] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(newsletterContacts)
            .where(and(...conditions))

          counts[seg.id] = result?.count ?? 0
        })
      )
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
): Promise<{ updated: number; error: string | null }> {
  try {
    if (!contactIds.length) return { updated: 0, error: 'No contacts selected' }
    if (!UUID_REGEX.test(segmentId)) return { updated: 0, error: 'Invalid segment ID' }
    for (const id of contactIds) {
      if (!UUID_REGEX.test(id)) return { updated: 0, error: 'Invalid contact ID' }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { updated: 0, error: 'Not authenticated' }

    const [segment] = await db
      .select({ siteId: newsletterSegments.siteId, filterRules: newsletterSegments.filterRules })
      .from(newsletterSegments)
      .where(eq(newsletterSegments.id, segmentId))
      .limit(1)

    if (!segment) return { updated: 0, error: 'Segment not found' }

    if (!await verifySiteOwnership(segment.siteId, user.id)) {
      return { updated: 0, error: 'Access denied' }
    }

    const rules = segment.filterRules as { tags?: string[] } | null
    const segmentTags: string[] = rules?.tags || []
    if (!segmentTags.length) return { updated: 0, error: 'Segment has no tags to add' }

    // Fetch contacts and merge tags
    const contacts = await db
      .select({ id: newsletterContacts.id, metadata: newsletterContacts.metadata })
      .from(newsletterContacts)
      .where(and(inArray(newsletterContacts.id, contactIds), eq(newsletterContacts.siteId, segment.siteId)))

    if (!contacts.length) return { updated: 0, error: 'No matching contacts found' }

    let updated = 0
    for (const contact of contacts) {
      const meta = contact.metadata as Record<string, any> | null
      const existingTags: string[] = meta?.tags || []
      const mergedTags = [...new Set([...existingTags, ...segmentTags])]
      if (mergedTags.length === existingTags.length) continue // no new tags

      try {
        await db
          .update(newsletterContacts)
          .set({ metadata: { ...meta, tags: mergedTags }, updatedAt: new Date() })
          .where(eq(newsletterContacts.id, contact.id))
        updated++
      } catch {
        // skip failed updates
      }
    }

    return { updated, error: null }
  } catch (err) {
    console.error('addContactsToSegment error:', err)
    return { updated: 0, error: 'Server error' }
  }
}
