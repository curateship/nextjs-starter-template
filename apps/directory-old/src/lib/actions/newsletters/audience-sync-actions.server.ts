import { eq, and, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterContacts, newsletterSegmentContacts, sites } from '@/lib/db/schema'
import { getAuthenticatedUser, verifySiteOwnership } from '@/lib/db/helpers'
import { UUID_REGEX } from '@/lib/utils/validation'


/**
 * Get audience count matching a newsletter's filter.
 */
export async function getAudienceCountImpl(
  siteId: string,
  audienceFilter: { segment_id?: string; tags?: string[]; sources?: string[] }
): Promise<{ count: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { count: 0, error: 'Invalid site ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { count: 0, error: 'Not authenticated' }
    if (!await verifySiteOwnership(siteId, user.id)) return { count: 0, error: 'Access denied' }

    // If segment_id is provided, count via join table
    if (audienceFilter.segment_id) {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(newsletterContacts)
        .innerJoin(newsletterSegmentContacts, eq(newsletterSegmentContacts.contactId, newsletterContacts.id))
        .where(and(
          eq(newsletterSegmentContacts.segmentId, audienceFilter.segment_id),
          eq(newsletterContacts.siteId, siteId),
          eq(newsletterContacts.status, 'active')
        ))
      return { count: result?.count ?? 0, error: null }
    }

    const conditions = [
      eq(newsletterContacts.siteId, siteId),
      eq(newsletterContacts.status, 'active'),
    ]

    if (audienceFilter.tags?.length) {
      for (const tag of audienceFilter.tags) {
        conditions.push(sql`${newsletterContacts.metadata} @> ${JSON.stringify({ tags: [tag] })}::jsonb`)
      }
    }

    if (audienceFilter.sources?.length) {
      conditions.push(sql`${newsletterContacts.metadata}->>'source' IN (${sql.join(audienceFilter.sources.map((s: string) => sql`${s}`), sql`, `)})`)
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(newsletterContacts)
      .where(and(...conditions))

    return { count: result?.count ?? 0, error: null }
  } catch (err) {
    console.error('getAudienceCount error:', err)
    return { count: 0, error: 'Server error' }
  }
}
