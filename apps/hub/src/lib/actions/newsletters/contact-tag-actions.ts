'use server'

import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterContacts, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { syncDynamicSegmentsForContacts } from '@/lib/actions/newsletters/segment-actions'
import { UUID_REGEX } from '@/lib/utils/validation'

export interface NewsletterContactTag {
  id: string
  tag: string
  contact_count: number
  last_used_at: string | null
}

export type NewsletterContactTagFilter = 'all' | 'empty'

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
}

function normalizeTagKey(tag: string) {
  return tag.trim().toLowerCase()
}

function normalizeSearchQuery(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toIsoString(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return new Date(value).toISOString()
  return null
}

function getMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, any>) }
    : {}
}

function normalizeTagList(metadata: unknown) {
  const tags = getMetadata(metadata).tags
  if (!Array.isArray(tags)) return []

  const seen = new Set<string>()
  const normalized: string[] = []

  for (const rawTag of tags) {
    if (typeof rawTag !== 'string') continue

    for (const part of rawTag.split(',')) {
      const tag = part.trim()
      const key = normalizeTagKey(tag)
      if (!key || seen.has(key)) continue
      seen.add(key)
      normalized.push(tag)
    }
  }

  return normalized
}

function replaceTag(metadata: unknown, fromKey: string, toTag: string) {
  const seen = new Set<string>()
  const tags: string[] = []

  for (const tag of normalizeTagList(metadata)) {
    const nextTag = normalizeTagKey(tag) === fromKey ? toTag : tag
    const nextKey = normalizeTagKey(nextTag)
    if (!nextKey || seen.has(nextKey)) continue
    seen.add(nextKey)
    tags.push(nextTag.trim())
  }

  return { ...getMetadata(metadata), tags }
}

function removeTags(metadata: unknown, tagKeys: Set<string>) {
  const tags = normalizeTagList(metadata).filter((tag) => !tagKeys.has(normalizeTagKey(tag)))
  return { ...getMetadata(metadata), tags }
}

function matchingTagsCondition(tagKeys: string[]) {
  return sql`exists (
    select 1
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(${newsletterContacts.metadata}->'tags') = 'array' then ${newsletterContacts.metadata}->'tags'
        else '[]'::jsonb
      end
    ) as raw_tag(value),
    lateral unnest(string_to_array(raw_tag.value, ',')) as tag(value)
    where lower(trim(tag.value)) in (${sql.join(tagKeys.map((tagKey) => sql`${tagKey}`), sql`, `)})
  )`
}

export async function getNewsletterContactTags(
  siteId: string,
  options?: { filter?: NewsletterContactTagFilter; searchQuery?: string; page?: number; pageSize?: number }
): Promise<{ data: NewsletterContactTag[] | null; total: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, total: 0, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, total: 0, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, total: 0, error: 'Access denied' }
    }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const requestedPageSize = Math.floor(options?.pageSize ?? 50)
    const pageSize = requestedPageSize === -1
      ? Number.MAX_SAFE_INTEGER
      : Math.min(100, Math.max(1, requestedPageSize))
    const offset = (page - 1) * pageSize
    const searchQuery = normalizeSearchQuery(options?.searchQuery)

    const tagRows = await db.execute<{
      tag_key: string
      tag: string
      contact_count: number
      last_used_at: Date | string | null
    }>(sql`
      with tag_rows as (
        select
          contact.id as contact_id,
          contact.updated_at,
          trim(tag.value) as tag,
          lower(trim(tag.value)) as tag_key
        from newsletter_contacts as contact,
        lateral jsonb_array_elements_text(
          case
            when jsonb_typeof(contact.metadata->'tags') = 'array' then contact.metadata->'tags'
            else '[]'::jsonb
          end
        ) as raw_tag(value),
        lateral unnest(string_to_array(raw_tag.value, ',')) as tag(value)
        where contact.site_id = ${siteId}
      ),
      filtered_tags as (
        select *
        from tag_rows
        where tag <> ''
      ),
      grouped_tags as (
        select
          tag_key,
          (array_agg(tag order by updated_at desc, tag asc))[1] as tag,
          count(distinct contact_id)::int as contact_count,
          max(updated_at) as last_used_at
        from filtered_tags
        group by tag_key
      )
      select tag_key, tag, contact_count, last_used_at
      from grouped_tags
      order by lower(tag) asc
    `)

    let rows = tagRows.rows.map((row) => ({
      id: row.tag_key,
      tag: row.tag,
      contact_count: Number(row.contact_count),
      last_used_at: toIsoString(row.last_used_at),
    }))

    if (searchQuery) {
      const search = searchQuery.toLowerCase()
      rows = rows.filter((row) => row.tag.toLowerCase().includes(search))
    }
    if (options?.filter === 'empty') {
      rows = rows.filter((row) => row.contact_count === 0)
    }

    rows.sort((a, b) => a.tag.localeCompare(b.tag))
    const total = rows.length

    return {
      data: rows.slice(offset, offset + pageSize),
      total,
      error: null,
    }
  } catch (err) {
    console.error('getNewsletterContactTags error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function renameNewsletterContactTag(
  siteId: string,
  fromTag: string,
  toTag: string
): Promise<{ updated: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { updated: 0, error: 'Invalid site ID' }

    const fromKey = normalizeTagKey(fromTag)
    const nextTag = toTag.trim()
    if (!fromKey) return { updated: 0, error: 'Tag is required' }
    if (!nextTag) return { updated: 0, error: 'New tag name is required' }

    const user = await getAuthenticatedUser()
    if (!user) return { updated: 0, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { updated: 0, error: 'Access denied' }
    }

    const changedContactIds = await db.transaction(async (tx) => {
      const contacts = await tx
        .select({ id: newsletterContacts.id, metadata: newsletterContacts.metadata })
        .from(newsletterContacts)
        .where(and(
          eq(newsletterContacts.siteId, siteId),
          matchingTagsCondition([fromKey])
        ))

      for (const contact of contacts) {
        await tx
          .update(newsletterContacts)
          .set({
            metadata: replaceTag(contact.metadata, fromKey, nextTag),
            updatedAt: new Date(),
          })
          .where(eq(newsletterContacts.id, contact.id))
      }

      return contacts.map((contact) => contact.id)
    })

    await syncDynamicSegmentsForContacts(changedContactIds)

    return { updated: changedContactIds.length, error: null }
  } catch (err) {
    console.error('renameNewsletterContactTag error:', err)
    return { updated: 0, error: 'Server error' }
  }
}

export async function deleteNewsletterContactTags(
  siteId: string,
  tags: string[]
): Promise<{ updated: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { updated: 0, error: 'Invalid site ID' }

    const tagKeys = [...new Set(tags.map(normalizeTagKey).filter(Boolean))]
    if (!tagKeys.length) return { updated: 0, error: 'No tags selected' }

    const user = await getAuthenticatedUser()
    if (!user) return { updated: 0, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { updated: 0, error: 'Access denied' }
    }

    const tagKeySet = new Set(tagKeys)
    const changedContactIds = await db.transaction(async (tx) => {
      const contacts = await tx
        .select({ id: newsletterContacts.id, metadata: newsletterContacts.metadata })
        .from(newsletterContacts)
        .where(and(
          eq(newsletterContacts.siteId, siteId),
          matchingTagsCondition(tagKeys)
        ))

      for (const contact of contacts) {
        await tx
          .update(newsletterContacts)
          .set({
            metadata: removeTags(contact.metadata, tagKeySet),
            updatedAt: new Date(),
          })
          .where(eq(newsletterContacts.id, contact.id))
      }

      return contacts.map((contact) => contact.id)
    })

    await syncDynamicSegmentsForContacts(changedContactIds)

    return { updated: changedContactIds.length, error: null }
  } catch (err) {
    console.error('deleteNewsletterContactTags error:', err)
    return { updated: 0, error: 'Server error' }
  }
}
