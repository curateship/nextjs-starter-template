'use server'

import { eq, and, ne, asc, desc, sql, inArray } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { events, sites, contentCategoryRelationships, categories } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { generateSlug } from '@/lib/utils/slug'
import { serializeEvent } from '@/lib/utils/content-serializer'



export interface Event {
  id: string
  site_id: string
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

export async function getSiteEventsAction(siteId: string, options?: { page?: number; pageSize?: number }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, total: 0, error: 'Authentication required' }
    }

    // Verify site ownership
    const [site] = await db
      .select({ id: sites.id, userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1)

    if (!site) {
      return { data: null, total: 0, error: 'Site not found' }
    }

    if (site.userId !== user.id) {
      return { data: null, total: 0, error: 'Unauthorized' }
    }

    // Pagination
    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const from = (page - 1) * pageSize

    const [countResult, result] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(events).where(eq(events.siteId, siteId)),
      db.select().from(events).where(eq(events.siteId, siteId)).orderBy(asc(events.displayOrder), desc(events.createdAt)).limit(pageSize).offset(from),
    ])

    return { data: result.map(serializeEvent), total: countResult[0]?.count ?? 0, error: null }
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
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, categories: {}, total: 0, error: 'Authentication required' }
    }

    const [site] = await db
      .select({ id: sites.id, userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { data: null, categories: {}, total: 0, error: 'Site not found or unauthorized' }
    }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const from = (page - 1) * pageSize

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

export async function updateEventAction(eventId: string, data: UpdateEventData) {
  try {
    // Validate event ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(eventId)) {
      return { data: null, error: 'Invalid event ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the event
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1)

    if (!event) {
      return { data: null, error: 'Event not found' }
    }

    // Verify ownership via site
    const [site] = await db
      .select({ userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, event.siteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Validate and process slug if being updated
    if (data.slug !== undefined) {
      const slug = data.slug.trim()

      if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
        return { data: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
      }

      const reservedSlugs = ['api', 'admin', 'www', 'mail', 'ftp', 'global']
      if (reservedSlugs.includes(slug.toLowerCase())) {
        return { data: null, error: 'This slug is reserved and cannot be used.' }
      }

      if (slug !== event.slug) {
        const [existingEvent] = await db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.siteId, event.siteId),
              eq(events.slug, slug),
              ne(events.id, eventId)
            )
          )
          .limit(1)

        if (existingEvent) {
          return { data: null, error: 'An event with this slug already exists' }
        }
      }
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
    // Validate event ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(eventId)) {
      return { success: false, error: 'Invalid event ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the event
    const [event] = await db
      .select({ id: events.id, siteId: events.siteId })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1)

    if (!event) {
      return { success: false, error: 'Event not found' }
    }

    // Verify ownership via site
    const [site] = await db
      .select({ userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, event.siteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

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

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const id of eventIds) {
      if (!uuidRegex.test(id)) {
        return { success: false, error: 'Invalid event ID format' }
      }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
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
    // Validate event ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(eventId)) {
      return { data: null, error: 'Invalid event ID format' }
    }

    if (!newTitle?.trim()) {
      return { data: null, error: 'New event title is required' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the event to duplicate
    const [originalEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1)

    if (!originalEvent) {
      return { data: null, error: 'Event not found' }
    }

    // Verify ownership via site
    const [site] = await db
      .select({ userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, originalEvent.siteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Generate a unique slug for the duplicate
    const baseSlug = generateSlug(newTitle)
    let slug = baseSlug
    let counter = 1

    while (true) {
      const [existingEvent] = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.siteId, originalEvent.siteId), eq(events.slug, slug)))
        .limit(1)

      if (!existingEvent) break
      slug = `${baseSlug}-${counter}`
      counter++
    }

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

export async function updateEventBlocksAction(eventId: string, contentBlocks: Record<string, any>) {
  try {
    // Validate event ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(eventId)) {
      return { success: false, error: 'Invalid event ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the event
    const [event] = await db
      .select({ id: events.id, siteId: events.siteId })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1)

    if (!event) {
      return { success: false, error: 'Event not found' }
    }

    // Verify ownership via site
    const [site] = await db
      .select({ userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, event.siteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Update the event blocks
    await db
      .update(events)
      .set({
        contentBlocks,
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
