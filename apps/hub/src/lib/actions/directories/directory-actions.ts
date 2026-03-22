'use server'

import { revalidateTag } from 'next/cache'
import { eq, and, desc, asc, sql, inArray, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { directories } from '@/lib/db/schema/directories'
import { sites } from '@/lib/db/schema/sites'
import { contentCategoryRelationships, categories } from '@/lib/db/schema/categories'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { generateSlug } from '@/lib/utils/slug'



export interface Directory {
  id: string
  site_id: string
  title: string
  slug: string
  is_published: boolean
  display_order: number
  content_blocks: Record<string, any>
  featured_image: string | null
  description: string | null
  meta_description: string | null
  created_at: string
  updated_at: string
}

export interface DirectoryWithDetails extends Directory {
  site_name: string
  subdomain: string
  user_id: string
}


export interface UpdateDirectoryData {
  title?: string
  slug?: string
  is_published?: boolean
  featured_image?: string | null
  description?: string | null
  meta_description?: string | null
}

function toDirectory(row: typeof directories.$inferSelect): Directory {
  return {
    id: row.id,
    site_id: row.siteId,
    title: row.title,
    slug: row.slug,
    is_published: row.isPublished,
    display_order: row.displayOrder,
    content_blocks: (row.contentBlocks ?? {}) as Record<string, any>,
    featured_image: row.featuredImage,
    description: row.description,
    meta_description: row.metaDescription,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function getSiteDirectoriesAction(siteId: string, options?: { page?: number; pageSize?: number }) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, total: 0, error: 'Authentication required' }
    }

    // Verify site ownership
    const [site] = await db.select({ id: sites.id, userId: sites.userId })
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

    const [countResult, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(directories).where(eq(directories.siteId, siteId)),
      db.select().from(directories).where(eq(directories.siteId, siteId)).orderBy(asc(directories.displayOrder), desc(directories.createdAt)).limit(pageSize).offset(from),
    ])

    return { data: rows.map(toDirectory), total: countResult[0]?.count ?? 0, error: null }
  } catch (error) {
    console.error('Error fetching directory:', error)
    return { data: null, total: 0, error: 'Failed to fetch directory' }
  }
}


/**
 * Get directories with their categories in a single server action call.
 */
export async function getSiteDirectoriesWithCategoriesAction(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{
  data: Directory[] | null
  categories: Record<string, import('@/lib/actions/categories/category-relationship-actions').CategoryInfo[]>
  total: number
  error: string | null
}> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, categories: {}, total: 0, error: 'Authentication required' }
    }

    const [site] = await db.select({ id: sites.id, userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { data: null, categories: {}, total: 0, error: 'Site not found or unauthorized' }
    }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const from = (page - 1) * pageSize

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(directories)
      .where(eq(directories.siteId, siteId))

    const rows = await db.select()
      .from(directories)
      .where(eq(directories.siteId, siteId))
      .orderBy(desc(directories.displayOrder))
      .limit(pageSize)
      .offset(from)

    const dirs = rows.map(toDirectory)

    let categoryMap: Record<string, import('@/lib/actions/categories/category-relationship-actions').CategoryInfo[]> = {}
    if (dirs.length > 0) {
      const dirIds = dirs.map(d => d.id)

      // Query relationships joined with categories (replaces category_relationships + categories join)
      const rels = await db.select({
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
            inArray(contentCategoryRelationships.contentId, dirIds),
            eq(contentCategoryRelationships.contentType, 'directory')
          )
        )

      if (rels.length > 0) {
        const parentIds = new Set<string>()
        for (const rel of rels) {
          if (rel.catParentId) parentIds.add(rel.catParentId)
        }
        let parentTitles: Record<string, string> = {}
        if (parentIds.size > 0) {
          const parents = await db.select({ id: categories.id, title: categories.title })
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

    return { data: dirs, categories: categoryMap, total: count ?? 0, error: null }
  } catch (error) {
    return { data: null, categories: {}, total: 0, error: 'Failed to fetch directories' }
  }
}

/** Returns only directory IDs for bulk selection — lightweight alternative to full record fetch */
export async function getDirectoryIdsAction(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { ids: [], error: 'Authentication required' }

    const [site] = await db.select({ id: sites.id, userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1)

    if (!site || site.userId !== user.id) return { ids: [], error: 'Site not found or unauthorized' }

    const rows = await db
      .select({ id: directories.id })
      .from(directories)
      .where(eq(directories.siteId, siteId))

    return { ids: rows.map(r => r.id), error: null }
  } catch (error) {
    return { ids: [], error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function updateDirectoryAction(directoryId: string, data: UpdateDirectoryData) {
  try {
    // Validate directory ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(directoryId)) {
      return { data: null, error: 'Invalid directory ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the directory to verify ownership
    const [directory] = await db.select()
      .from(directories)
      .where(eq(directories.id, directoryId))
      .limit(1)

    if (!directory) {
      return { data: null, error: 'Directory not found' }
    }

    // Verify site ownership
    const [site] = await db.select({ userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, directory.siteId))
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

      if (slug !== directory.slug) {
        const [existingDirectory] = await db.select({ id: directories.id })
          .from(directories)
          .where(
            and(
              eq(directories.siteId, directory.siteId),
              eq(directories.slug, slug),
              ne(directories.id, directoryId)
            )
          )
          .limit(1)

        if (existingDirectory) {
          return { data: null, error: 'A directory with this slug already exists' }
        }
      }
    }

    // Build updates with explicit field whitelist
    const allowedFields = ['title', 'slug', 'is_published', 'featured_image', 'description', 'meta_description'] as const
    const finalUpdates: Record<string, any> = {}
    for (const field of allowedFields) {
      if ((data as any)[field] !== undefined) {
        if (field === 'title' || field === 'description' || field === 'meta_description' || field === 'featured_image') {
          finalUpdates[field] = typeof (data as any)[field] === 'string'
            ? (data as any)[field].trim() || null
            : (data as any)[field]
        } else {
          finalUpdates[field] = (data as any)[field]
        }
      }
    }

    // Map snake_case fields to Drizzle camelCase columns
    const drizzleUpdates: Record<string, any> = {}
    if (finalUpdates.title !== undefined) drizzleUpdates.title = finalUpdates.title
    if (finalUpdates.slug !== undefined) drizzleUpdates.slug = finalUpdates.slug
    if (finalUpdates.is_published !== undefined) drizzleUpdates.isPublished = finalUpdates.is_published
    if (finalUpdates.featured_image !== undefined) drizzleUpdates.featuredImage = finalUpdates.featured_image
    if (finalUpdates.description !== undefined) drizzleUpdates.description = finalUpdates.description
    if (finalUpdates.meta_description !== undefined) drizzleUpdates.metaDescription = finalUpdates.meta_description

    // Update the directory
    const [updatedDirectory] = await db.update(directories)
      .set({
        ...drizzleUpdates,
        updatedAt: new Date(),
      })
      .where(eq(directories.id, directoryId))
      .returning()

    if (!updatedDirectory) {
      return { data: null, error: 'Failed to update directory' }
    }

    // Revalidate cache
    revalidateTag('directory')
    revalidateTag(`directory-${directoryId}`)
    revalidateTag(`site-${directory.siteId}`)

    return { data: toDirectory(updatedDirectory), error: null }
  } catch (error) {
    console.error('Error updating directory:', error)
    return { data: null, error: 'Failed to update directory' }
  }
}

export async function deleteDirectoryAction(directoryId: string) {
  try {
    // Validate directory ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(directoryId)) {
      return { success: false, error: 'Invalid directory ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the directory to verify ownership
    const [directory] = await db.select()
      .from(directories)
      .where(eq(directories.id, directoryId))
      .limit(1)

    if (!directory) {
      return { success: false, error: 'Directory not found' }
    }

    // Verify site ownership
    const [site] = await db.select({ userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, directory.siteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Delete the directory
    await db.delete(directories)
      .where(eq(directories.id, directoryId))

    // Revalidate cache
    revalidateTag('directory')
    revalidateTag(`directory-${directoryId}`)
    revalidateTag(`site-${directory.siteId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error deleting directory:', error)
    return { success: false, error: 'Failed to delete directory' }
  }
}

/**
 * Delete multiple directories at once
 */
export async function deleteDirectoriesAction(directoryIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!directoryIds.length) {
      return { success: false, error: 'No directories selected' }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const id of directoryIds) {
      if (!uuidRegex.test(id)) {
        return { success: false, error: 'Invalid directory ID format' }
      }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    const foundDirectories = await db.select({ id: directories.id, siteId: directories.siteId })
      .from(directories)
      .where(inArray(directories.id, directoryIds))

    if (!foundDirectories.length) {
      return { success: false, error: 'Directories not found' }
    }

    const siteIds = [...new Set(foundDirectories.map(d => d.siteId))]
    const ownedSites = await db.select({ id: sites.id })
      .from(sites)
      .where(
        and(
          inArray(sites.id, siteIds),
          eq(sites.userId, user.id)
        )
      )

    if (!ownedSites.length || ownedSites.length !== siteIds.length) {
      return { success: false, error: 'Access denied to one or more directories' }
    }

    await db.delete(directories)
      .where(inArray(directories.id, directoryIds))

    revalidateTag('directory')

    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export async function duplicateDirectoryAction(directoryId: string, newTitle: string) {
  try {
    // Validate directory ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(directoryId)) {
      return { data: null, error: 'Invalid directory ID format' }
    }

    if (!newTitle?.trim()) {
      return { data: null, error: 'New directory title is required' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the directory to duplicate
    const [originalDirectory] = await db.select()
      .from(directories)
      .where(eq(directories.id, directoryId))
      .limit(1)

    if (!originalDirectory) {
      return { data: null, error: 'Directory not found' }
    }

    // Verify site ownership
    const [site] = await db.select({ userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, originalDirectory.siteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    // Generate a unique slug for the duplicate
    const baseSlug = generateSlug(newTitle)
    let slug = baseSlug
    let counter = 1

    while (true) {
      const [existingDirectory] = await db.select({ id: directories.id })
        .from(directories)
        .where(
          and(
            eq(directories.siteId, originalDirectory.siteId),
            eq(directories.slug, slug)
          )
        )
        .limit(1)

      if (!existingDirectory) break
      slug = `${baseSlug}-${counter}`
      counter++
    }

    // Get the highest display_order for this site
    const [maxOrderDirectory] = await db.select({ displayOrder: directories.displayOrder })
      .from(directories)
      .where(eq(directories.siteId, originalDirectory.siteId))
      .orderBy(desc(directories.displayOrder))
      .limit(1)

    const nextDisplayOrder = maxOrderDirectory ? maxOrderDirectory.displayOrder + 1 : 0

    // Create the duplicate
    const [newDirectory] = await db.insert(directories)
      .values({
        siteId: originalDirectory.siteId,
        title: newTitle,
        slug,
        isPublished: false, // Always create duplicates as draft
        featuredImage: originalDirectory.featuredImage,
        description: originalDirectory.description,
        metaDescription: originalDirectory.metaDescription,
        contentBlocks: originalDirectory.contentBlocks || {},
        displayOrder: nextDisplayOrder,
      })
      .returning()

    if (!newDirectory) {
      return { data: null, error: 'Failed to create duplicate directory' }
    }

    // Revalidate cache
    revalidateTag('directory')
    revalidateTag(`site-${originalDirectory.siteId}`)

    return { data: toDirectory(newDirectory), error: null }
  } catch (error) {
    console.error('Error duplicating directory:', error)
    return { data: null, error: 'Failed to duplicate directory' }
  }
}

export async function getDirectoryBySlugAction(siteId: string, slug: string) {
  try {
    // Validate site ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(siteId)) {
      return { data: null, error: 'Invalid site ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    // Get the directory
    const [directory] = await db.select()
      .from(directories)
      .where(
        and(
          eq(directories.siteId, siteId),
          eq(directories.slug, slug)
        )
      )
      .limit(1)

    if (!directory) {
      return { data: null, error: 'Directory not found' }
    }

    // Get site details and verify ownership
    const [site] = await db.select({ userId: sites.userId, name: sites.name, subdomain: sites.subdomain })
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    const directoryWithDetails: DirectoryWithDetails = {
      ...toDirectory(directory),
      site_name: site.name,
      subdomain: site.subdomain,
      user_id: site.userId
    }

    return { data: directoryWithDetails, error: null }
  } catch (error) {
    console.error('Error fetching directory:', error)
    return { data: null, error: 'Failed to fetch directory' }
  }
}

export async function updateDirectoryBlocksAction(directoryId: string, contentBlocks: Record<string, any>) {
  try {
    // Validate directory ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(directoryId)) {
      return { success: false, error: 'Invalid directory ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    // Get the directory to verify ownership
    const [directory] = await db.select()
      .from(directories)
      .where(eq(directories.id, directoryId))
      .limit(1)

    if (!directory) {
      return { success: false, error: 'Directory not found' }
    }

    // Verify site ownership
    const [site] = await db.select({ userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, directory.siteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Update the directory blocks
    await db.update(directories)
      .set({
        contentBlocks,
        updatedAt: new Date(),
      })
      .where(eq(directories.id, directoryId))

    // Revalidate cache
    revalidateTag('directory')
    revalidateTag(`directory-${directoryId}`)
    revalidateTag(`site-${directory.siteId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error updating directory blocks:', error)
    return { success: false, error: 'Failed to update directory blocks' }
  }
}
