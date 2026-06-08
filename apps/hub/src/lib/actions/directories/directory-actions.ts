'use server'

import { revalidateTag } from 'next/cache'
import { eq, and, desc, asc, sql, inArray, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { directories } from '@/lib/db/schema/directories'
import { directoryTemplates } from '@/lib/db/schema/directory-templates'
import { sites } from '@/lib/db/schema/sites'
import { contentCategoryRelationships, categories } from '@/lib/db/schema/categories'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { generateSlug } from '@/lib/utils/slug'
import { getDirectoryCustomBlocksBySite } from './directory-custom-block-actions'
import {
  mergeDirectoryTemplateBlocks,
  pruneDirectoryValueBlocksForTemplate,
} from './directory-template-inheritance'
import type { DirectoryData } from './directory-data'
import type { DirectoryCustomBlockTemplate } from './directory-custom-blocks/types'
import { searchSiteDirectoriesAction, type DirectorySummary } from './directory-list-actions'
export type DirectoryStatus = 'draft' | 'published'

export interface Directory {
  id: string
  site_id: string
  template_id: string
  title: string
  slug: string
  status: DirectoryStatus
  display_order: number
  content_blocks: Record<string, any>
  directory_data: DirectoryData
  featured_image: string | null
  meta_description: string | null
  source_type: string | null
  source_id: string | null
  created_at: string
  updated_at: string
}

export interface DirectoryWithDetails extends Directory {
  site_name: string
  subdomain: string
  user_id: string
}

interface DirectoryBuilderData {
  directory: Directory | null
  directoryOptions: DirectorySummary[]
  customBlockTemplates: DirectoryCustomBlockTemplate[]
}


export interface UpdateDirectoryData {
  title?: string
  slug?: string
  status?: DirectoryStatus
  featured_image?: string | null
  meta_description?: string | null
  template_id?: string
}

function toDirectory(row: typeof directories.$inferSelect): Directory {
  return {
    id: row.id,
    site_id: row.siteId,
    template_id: row.templateId,
    title: row.title,
    slug: row.slug,
    status: row.status,
    display_order: row.displayOrder,
    content_blocks: (row.contentBlocks ?? {}) as Record<string, any>,
    directory_data: (row.directoryData ?? {}) as DirectoryData,
    featured_image: row.featuredImage,
    meta_description: row.metaDescription,
    source_type: row.sourceType,
    source_id: row.sourceId,
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
  } catch {
    return { data: null, categories: {}, total: 0, error: 'Failed to fetch listings' }
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

    let nextTemplateContentBlocks: Record<string, any> | null = null
    if (data.template_id !== undefined) {
      if (!uuidRegex.test(data.template_id)) {
        return { data: null, error: 'Invalid template ID format' }
      }

      const [template] = await db
        .select({
          id: directoryTemplates.id,
          siteId: directoryTemplates.siteId,
          contentBlocks: directoryTemplates.contentBlocks,
        })
        .from(directoryTemplates)
        .where(eq(directoryTemplates.id, data.template_id))
        .limit(1)

      if (!template || template.siteId !== directory.siteId) {
        return { data: null, error: 'Template not found' }
      }

      nextTemplateContentBlocks = (template.contentBlocks || {}) as Record<string, any>
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
    const allowedFields = ['title', 'slug', 'status', 'featured_image', 'meta_description', 'template_id'] as const
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

    // Map snake_case fields to Drizzle camelCase columns
    const drizzleUpdates: Record<string, any> = {}
    if (finalUpdates.title !== undefined) drizzleUpdates.title = finalUpdates.title
    if (finalUpdates.slug !== undefined) drizzleUpdates.slug = finalUpdates.slug
    if (finalUpdates.status !== undefined) drizzleUpdates.status = finalUpdates.status
    if (finalUpdates.featured_image !== undefined) drizzleUpdates.featuredImage = finalUpdates.featured_image
    if (finalUpdates.meta_description !== undefined) drizzleUpdates.metaDescription = finalUpdates.meta_description
    if (finalUpdates.template_id !== undefined) {
      drizzleUpdates.templateId = finalUpdates.template_id
      drizzleUpdates.contentBlocks = pruneDirectoryValueBlocksForTemplate(
        (directory.contentBlocks || {}) as Record<string, any>,
        nextTemplateContentBlocks || {}
      )
    }

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
    revalidateTag('listing-views')
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
    revalidateTag('listing-views')
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
      return { success: false, error: 'No listings selected' }
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
      return { success: false, error: 'Listings not found' }
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
      return { success: false, error: 'Access denied to one or more listings' }
    }

    await db.delete(directories)
      .where(inArray(directories.id, directoryIds))

    revalidateTag('directory')
    revalidateTag('listing-views')

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
      return { data: null, error: 'New listing title is required' }
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
        templateId: originalDirectory.templateId,
        title: newTitle,
        slug,
        status: 'draft',
        featuredImage: originalDirectory.featuredImage,
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
    revalidateTag('listing-views')
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

    const [template] = await db
      .select({ contentBlocks: directoryTemplates.contentBlocks })
      .from(directoryTemplates)
      .where(and(
        eq(directoryTemplates.id, directory.templateId),
        eq(directoryTemplates.siteId, directory.siteId)
      ))
      .limit(1)

    if (!template) {
      return { data: null, error: 'Template not found' }
    }

    const mergedDirectory = {
      ...directory,
      contentBlocks: mergeDirectoryTemplateBlocks(
        (template.contentBlocks || {}) as Record<string, any>,
        (directory.contentBlocks || {}) as Record<string, any>
      ),
    }

    const directoryWithDetails: DirectoryWithDetails = {
      ...toDirectory(mergedDirectory),
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

export async function getDirectoryBuilderDataAction(
  siteId: string,
  selectedDirectory: string
): Promise<{ data: DirectoryBuilderData | null; error: string | null }> {
  try {
    const [directoryResult, customBlocksResult, optionsResult] = await Promise.all([
      selectedDirectory
        ? getDirectoryBySlugAction(siteId, selectedDirectory)
        : Promise.resolve({ data: null, error: null }),
      getDirectoryCustomBlocksBySite(siteId),
      searchSiteDirectoriesAction(siteId, {
        limit: 20,
      }),
    ])

    if (directoryResult.error) {
      return { data: null, error: directoryResult.error }
    }

    if (customBlocksResult.error) {
      return { data: null, error: customBlocksResult.error }
    }

    if (optionsResult.error) {
      return { data: null, error: optionsResult.error }
    }

    const directoryOptions = optionsResult.data || []
    const selectedOption = directoryResult.data
      ? {
          id: directoryResult.data.id,
          site_id: directoryResult.data.site_id,
          title: directoryResult.data.title,
          slug: directoryResult.data.slug,
          status: directoryResult.data.status,
          display_order: directoryResult.data.display_order,
          featured_image: directoryResult.data.featured_image,
          meta_description: directoryResult.data.meta_description,
          created_at: directoryResult.data.created_at,
          updated_at: directoryResult.data.updated_at,
        }
      : null

    return {
      data: {
        directory: directoryResult.data,
        directoryOptions: selectedOption && !directoryOptions.some((item) => item.id === selectedOption.id)
          ? [selectedOption, ...directoryOptions]
          : directoryOptions,
        customBlockTemplates: customBlocksResult.data || [],
      },
      error: null,
    }
  } catch (error) {
    console.error('Error loading directory builder data:', error)
    return { data: null, error: 'Failed to load directory builder data' }
  }
}

export async function getDirectoryByIdAction(directoryId: string) {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(directoryId)) {
      return { data: null, error: 'Invalid directory ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'Authentication required' }
    }

    const [directory] = await db.select()
      .from(directories)
      .where(eq(directories.id, directoryId))
      .limit(1)

    if (!directory) {
      return { data: null, error: 'Directory not found' }
    }

    const [site] = await db.select({ userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, directory.siteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { data: null, error: 'Unauthorized' }
    }

    return { data: toDirectory(directory), error: null }
  } catch (error) {
    console.error('Error fetching directory by ID:', error)
    return { data: null, error: 'Failed to fetch directory' }
  }
}

export async function updateDirectoryBlockValuesAction(directoryId: string, contentBlocks: Record<string, any>) {
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

    const [template] = await db
      .select({ contentBlocks: directoryTemplates.contentBlocks })
      .from(directoryTemplates)
      .where(and(
        eq(directoryTemplates.id, directory.templateId),
        eq(directoryTemplates.siteId, directory.siteId)
      ))
      .limit(1)

    if (!template) {
      return { success: false, error: 'Template not found' }
    }

    const valueBlocks = pruneDirectoryValueBlocksForTemplate(
      contentBlocks,
      (template.contentBlocks || {}) as Record<string, any>
    )

    // Update the listing-specific block values
    await db.update(directories)
      .set({
        contentBlocks: valueBlocks,
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
