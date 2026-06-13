'use server'

import { eq, and, asc, desc, sql, inArray } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { events, eventTemplates, sites, contentCategoryRelationships, categories } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { serializeEvent } from '@/lib/utils/content-serializer'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'
import {
  generateUniqueContentSlug,
  requireOwnedContentRow,
  requireOwnedSite,
  validateContentSlugUpdate,
} from '@/lib/actions/content/content-action-helpers'
import {
  getEventNonBlockEntries,
  mergeEventTemplateBlocks,
  pruneEventValueBlocksForTemplate,
} from './event-template-inheritance'

type EventRow = typeof events.$inferSelect

export interface Event {
  id: string
  site_id: string
  template_id: string
  title: string
  slug: string
  is_published: boolean
  display_order: number
  content_blocks: Record<string, any>
  featured_image: string | null
  meta_description: string | null
  created_at: string
  updated_at: string
}

export interface UpdateEventData {
  title?: string
  slug?: string
  is_published?: boolean
  featured_image?: string | null
  meta_description?: string | null
}

export async function getSiteEventsAction(siteId: string, options?: { page?: number; pageSize?: number; selectedSlug?: string }) {
  try {
    // Auth + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedSite(siteId)
    if (!access.ok) {
      return { data: null, total: 0, error: access.error }
    }

    // Pagination
    const { pageSize, offset: from } = normalizePagination(options)
    const selectedSlug = options?.selectedSlug?.trim()

    const [countResult, result, selectedRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(events).where(eq(events.siteId, siteId)),
      db.select().from(events).where(eq(events.siteId, siteId)).orderBy(asc(events.displayOrder), desc(events.createdAt)).limit(pageSize).offset(from),
      selectedSlug
        ? db.select().from(events).where(and(eq(events.siteId, siteId), eq(events.slug, selectedSlug))).limit(1)
        : Promise.resolve([]),
    ])

    const selectedRow = selectedRows[0]
    const rows = selectedRow && !result.some((event) => event.id === selectedRow.id)
      ? [selectedRow, ...result]
      : result

    return { data: rows.map(serializeEvent), total: countResult[0]?.count ?? 0, error: null }
  } catch (error) {
    console.error('Error fetching events:', error)
    return { data: null, total: 0, error: 'Failed to fetch events' }
  }
}

/**
 * Get events with their categories in a single server action call.
 */
export async function getSiteEventsWithCategoriesAction(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{
  data: Event[] | null
  categories: Record<string, import('@/lib/actions/categories/category-relationship-actions').CategoryInfo[]>
  total: number
  error: string | null
}> {
  try {
    // Auth + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedSite(siteId)
    if (!access.ok) {
      return { data: null, categories: {}, total: 0, error: access.error }
    }

    const { pageSize, offset: from } = normalizePagination(options)

    const [countResult, result] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(events).where(eq(events.siteId, siteId)),
      db.select().from(events).where(eq(events.siteId, siteId)).orderBy(desc(events.displayOrder)).limit(pageSize).offset(from),
    ])

    const evts = result.map(serializeEvent)

    let categoryMap: Record<string, import('@/lib/actions/categories/category-relationship-actions').CategoryInfo[]> = {}
    if (evts.length > 0) {
      const eventIds = evts.map(e => e.id)

      // Get category relationships with category data
      const rels = await db
        .select({
          contentId: contentCategoryRelationships.contentId,
          categoryId: contentCategoryRelationships.categoryId,
          catId: categories.id,
          catTitle: categories.title,
          catSlug: categories.slug,
          catParentId: categories.parentId,
        })
        .from(contentCategoryRelationships)
        .innerJoin(categories, eq(contentCategoryRelationships.categoryId, categories.id))
        .where(
          and(
            inArray(contentCategoryRelationships.contentId, eventIds),
            eq(contentCategoryRelationships.contentType, 'event')
          )
        )

      if (rels.length > 0) {
        const parentIds = new Set<string>()
        for (const rel of rels) {
          if (rel.catParentId) parentIds.add(rel.catParentId)
        }

        let parentTitles: Record<string, string> = {}
        if (parentIds.size > 0) {
          const parents = await db
            .select({ id: categories.id, title: categories.title })
            .from(categories)
            .where(inArray(categories.id, Array.from(parentIds)))

          parentTitles = Object.fromEntries(parents.map(p => [p.id, p.title]))
        }

        for (const rel of rels) {
          const cid = rel.contentId
          if (!categoryMap[cid]) categoryMap[cid] = []
          categoryMap[cid].push({
            id: rel.catId,
            title: rel.catTitle,
            slug: rel.catSlug,
            parent_id: rel.catParentId,
            parent_title: rel.catParentId ? parentTitles[rel.catParentId] : undefined
          })
        }
      }
    }

    return { data: evts, categories: categoryMap, total: countResult[0]?.count ?? 0, error: null }
  } catch (error) {
    return { data: null, categories: {}, total: 0, error: 'Failed to fetch events' }
  }
}

/**
 * Get events with template-merged content blocks (builder preview only —
 * writers must keep using the raw rows from getSiteEventsAction)
 */
export async function getSiteEventsWithMergedBlocksAction(siteId: string, options?: { page?: number; pageSize?: number; selectedSlug?: string }) {
  const result = await getSiteEventsAction(siteId, options)
  if (!result.data) return result

  try {
    // One fetch for all distinct templates referenced by the returned events
    const templateIds = [...new Set(result.data.map((event) => event.template_id))]
    const templates = templateIds.length
      ? await db
          .select({ id: eventTemplates.id, contentBlocks: eventTemplates.contentBlocks })
          .from(eventTemplates)
          .where(inArray(eventTemplates.id, templateIds))
      : []
    const templateMap = new Map(templates.map((template) => [template.id, (template.contentBlocks || {}) as Record<string, any>]))

    return {
      ...result,
      data: result.data.map((event) => ({
        ...event,
        content_blocks: mergeEventTemplateBlocks(
          templateMap.get(event.template_id) || {},
          event.content_blocks || {}
        ),
      })),
    }
  } catch (error) {
    console.error('Error merging event template blocks:', error)
    return { data: null, total: 0, error: 'Failed to fetch events' }
  }
}

export async function updateEventAction(eventId: string, data: UpdateEventData) {
  try {
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<EventRow>(events, eventId, 'Event')
    if (!access.ok) {
      return { data: null, error: access.error }
    }
    const event = access.row

    // Validate and process slug if being updated
    if (data.slug !== undefined) {
      const slugResult = await validateContentSlugUpdate(events, event.siteId, eventId, data.slug, 'Event')
      if (!slugResult.ok) {
        return { data: null, error: slugResult.error }
      }
      data = { ...data, slug: slugResult.slug }
    }

    // Build updates with explicit field whitelist
    const allowedFields = ['title', 'slug', 'is_published', 'featured_image', 'meta_description'] as const
    const finalUpdates: Record<string, any> = {}
    for (const field of allowedFields) {
      if ((data as any)[field] !== undefined) {
        if (field === 'title' || field === 'meta_description' || field === 'featured_image') {
          finalUpdates[field] = typeof (data as any)[field] === 'string'
            ? (data as any)[field].trim() || null
            : (data as any)[field]
        } else {
          finalUpdates[field] = (data as any)[field]
        }
      }
    }

    // Map snake_case fields to camelCase Drizzle columns
    const drizzleUpdates: Record<string, any> = {}
    if (finalUpdates.title !== undefined) drizzleUpdates.title = finalUpdates.title
    if (finalUpdates.slug !== undefined) drizzleUpdates.slug = finalUpdates.slug
    if (finalUpdates.is_published !== undefined) drizzleUpdates.isPublished = finalUpdates.is_published
    if (finalUpdates.featured_image !== undefined) drizzleUpdates.featuredImage = finalUpdates.featured_image
    if (finalUpdates.meta_description !== undefined) drizzleUpdates.metaDescription = finalUpdates.meta_description
    drizzleUpdates.updatedAt = new Date()

    // Update the event
    const [updatedEvent] = await db
      .update(events)
      .set(drizzleUpdates)
      .where(eq(events.id, eventId))
      .returning()

    if (!updatedEvent) {
      return { data: null, error: 'Failed to update event' }
    }

    // Revalidate cache
    revalidateTag('events')
    revalidateTag(`event-${eventId}`)
    revalidateTag(`site-${event.siteId}`)

    return { data: serializeEvent(updatedEvent), error: null }
  } catch (error) {
    console.error('Error updating event:', error)
    return { data: null, error: 'Failed to update event' }
  }
}

export async function deleteEventAction(eventId: string) {
  try {
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<EventRow>(events, eventId, 'Event')
    if (!access.ok) {
      return { success: false, error: access.error }
    }
    const event = access.row

    // Delete the event
    await db.delete(events).where(eq(events.id, eventId))

    // Revalidate cache
    revalidateTag('events')
    revalidateTag(`event-${eventId}`)
    revalidateTag(`site-${event.siteId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error deleting event:', error)
    return { success: false, error: 'Failed to delete event' }
  }
}

/**
 * Delete multiple events at once
 */
export async function deleteEventsAction(eventIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!eventIds.length) {
      return { success: false, error: 'No events selected' }
    }

    for (const id of eventIds) {
      if (!UUID_REGEX.test(id)) {
        return { success: false, error: 'Invalid event ID format' }
      }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
    }

    const eventRows = await db
      .select({ id: events.id, siteId: events.siteId })
      .from(events)
      .where(inArray(events.id, eventIds))

    if (!eventRows.length) {
      return { success: false, error: 'Events not found' }
    }

    const siteIds = [...new Set(eventRows.map(e => e.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied to one or more events' }
    }

    await db.delete(events).where(inArray(events.id, eventIds))

    revalidateTag('events')

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export async function duplicateEventAction(eventId: string, newTitle: string) {
  try {
    if (!newTitle?.trim()) {
      return { data: null, error: 'New event title is required' }
    }

    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<EventRow>(events, eventId, 'Event')
    if (!access.ok) {
      return { data: null, error: access.error }
    }
    const originalEvent = access.row

    // Unique slug via shared helper
    const slug = await generateUniqueContentSlug(events, originalEvent.siteId, newTitle)

    // Get the highest display_order for this site
    const [maxOrderEvent] = await db
      .select({ displayOrder: events.displayOrder })
      .from(events)
      .where(eq(events.siteId, originalEvent.siteId))
      .orderBy(desc(events.displayOrder))
      .limit(1)

    const nextDisplayOrder = maxOrderEvent ? maxOrderEvent.displayOrder + 1 : 0

    // Create the duplicate
    const [newEvent] = await db
      .insert(events)
      .values({
        siteId: originalEvent.siteId,
        templateId: originalEvent.templateId,
        title: newTitle,
        slug,
        isPublished: false, // Always create duplicates as draft
        featuredImage: originalEvent.featuredImage,
        metaDescription: originalEvent.metaDescription,
        contentBlocks: originalEvent.contentBlocks || {},
        displayOrder: nextDisplayOrder
      })
      .returning()

    if (!newEvent) {
      return { data: null, error: 'Failed to create duplicate event' }
    }

    // Revalidate cache
    revalidateTag('events')
    revalidateTag(`site-${originalEvent.siteId}`)

    return { data: serializeEvent(newEvent), error: null }
  } catch (error) {
    console.error('Error duplicating event:', error)
    return { data: null, error: 'Failed to duplicate event' }
  }
}

/**
 * Update event block values (for builder). The template owns structure;
 * only value keys for blocks present in the template are stored on the row.
 */
export async function updateEventBlocksAction(eventId: string, contentBlocks: Record<string, any>) {
  try {
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<EventRow>(events, eventId, 'Event')
    if (!access.ok) {
      return { success: false, error: access.error }
    }
    const event = access.row

    const template = await db.query.eventTemplates.findFirst({
      where: and(eq(eventTemplates.id, event.templateId), eq(eventTemplates.siteId, event.siteId)),
      columns: { contentBlocks: true },
    })

    if (!template) {
      return { success: false, error: 'Template not found' }
    }

    // Keep row settings (_settings.is_private etc.) from the existing row when the
    // incoming value JSON doesn't carry them, then prune against the template
    const existingSettings = getEventNonBlockEntries((event.contentBlocks || {}) as Record<string, any>)
    const valueBlocks = pruneEventValueBlocksForTemplate(
      { ...existingSettings, ...contentBlocks },
      (template.contentBlocks || {}) as Record<string, any>
    )

    // Update the event blocks (value-only)
    await db
      .update(events)
      .set({
        contentBlocks: valueBlocks,
        updatedAt: new Date()
      })
      .where(eq(events.id, eventId))

    // Revalidate cache
    revalidateTag('events')
    revalidateTag(`event-${eventId}`)
    revalidateTag(`site-${event.siteId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error updating event blocks:', error)
    return { success: false, error: 'Failed to update event blocks' }
  }
}
