'use server'

import { revalidateTag } from 'next/cache'
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { directories } from '@/lib/db/schema/directories'
import { directoryTemplates } from '@/lib/db/schema/directory-templates'
import { sites } from '@/lib/db/schema/sites'
import { contentCategoryRelationships, categories } from '@/lib/db/schema/categories'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import {
  generateUniqueContentSlug,
  requireOwnedContentRow,
  requireOwnedSite,
  validateContentSlugUpdate,
} from '@/lib/actions/content/content-action-helpers'
import { getDirectoryCustomBlocksBySite } from './directory-custom-block-actions'
import {
  deriveDirectoryMetaDescriptionFromBlocks,
  mergeDirectoryTemplateBlocks,
  pruneDirectoryValueBlocksForTemplate,
} from './directory-template-inheritance'
import type { DirectoryCustomBlockTemplate } from './directory-custom-blocks/types'
import { searchSiteDirectoriesAction, type DirectorySummary } from './directory-list-actions'
import { UUID_REGEX, normalizePagination } from '@/lib/utils/validation'
import {
  safeDeleteSiteSearchDocument,
  safeSyncSiteSearchDocument,
} from '@/lib/actions/site-search/site-search-index'
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
  featured_image: string | null
  meta_description: string | null
  source_type: string | null
  source_id: string | null
  created_at: string
  updated_at: string
}

interface DirectoryWithDetails extends Directory {
  site_name: string
  subdomain: string
  user_id: string
}

interface DirectoryBuilderData {
  directory: Directory | null
  directoryOptions: DirectorySummary[]
  customBlockTemplates: DirectoryCustomBlockTemplate[]
}

export interface UpdateDirectoryInput {
  title?: string
  slug?: string
  status?: DirectoryStatus
  featured_image?: string | null
  meta_description?: string | null
  template_id?: string
}

type DirectoryRow = typeof directories.$inferSelect

function toDirectory(row: DirectoryRow): Directory {
  return {
    id: row.id,
    site_id: row.siteId,
    template_id: row.templateId,
    title: row.title,
    slug: row.slug,
    status: row.status,
    display_order: row.displayOrder,
    content_blocks: (row.contentBlocks ?? {}) as Record<string, any>,
    featured_image: row.featuredImage,
    meta_description: row.metaDescription,
    source_type: row.sourceType,
    source_id: row.sourceId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}


export async function updateDirectoryAction(directoryId: string, data: UpdateDirectoryInput) {
  try {
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<DirectoryRow>(directories, directoryId, 'Directory')
    if (!access.ok) {
      return { data: null, error: access.error }
    }
    const directory = access.row

    let nextTemplateContentBlocks: Record<string, any> | null = null
    if (data.template_id !== undefined) {
      if (!UUID_REGEX.test(data.template_id)) {
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
      const slugResult = await validateContentSlugUpdate(directories, directory.siteId, directoryId, data.slug, 'Directory')
      if (!slugResult.ok) {
        return { data: null, error: slugResult.error }
      }
      data = { ...data, slug: slugResult.slug }
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

    await safeSyncSiteSearchDocument('directory', updatedDirectory)
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
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<DirectoryRow>(directories, directoryId, 'Directory')
    if (!access.ok) {
      return { success: false, error: access.error }
    }
    const directory = access.row

    await db.transaction(async (tx) => {
      await tx.delete(contentCategoryRelationships)
        .where(and(
          eq(contentCategoryRelationships.contentId, directoryId),
          eq(contentCategoryRelationships.contentType, 'directory')
        ))

      await tx.delete(directories)
        .where(eq(directories.id, directoryId))
    })
    await safeDeleteSiteSearchDocument(directory.siteId, 'directory', directoryId)

    // Revalidate cache
    revalidateTag('directory')
    revalidateTag('listing-views')
    revalidateTag('content-categories')
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

    for (const id of directoryIds) {
      if (!UUID_REGEX.test(id)) {
        return { success: false, error: 'Invalid directory ID format' }
      }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { success: false, error: 'User not authenticated. Please log in first.' }
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

    await db.transaction(async (tx) => {
      await tx.delete(contentCategoryRelationships)
        .where(and(
          inArray(contentCategoryRelationships.contentId, directoryIds),
          eq(contentCategoryRelationships.contentType, 'directory')
        ))

      await tx.delete(directories)
        .where(inArray(directories.id, directoryIds))
    })
    await Promise.all(foundDirectories.map((directory) => safeDeleteSiteSearchDocument(directory.siteId, 'directory', directory.id)))

    revalidateTag('directory')
    revalidateTag('listing-views')
    revalidateTag('content-categories')

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
    if (!newTitle?.trim()) {
      return { data: null, error: 'New listing title is required' }
    }

    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<DirectoryRow>(directories, directoryId, 'Directory')
    if (!access.ok) {
      return { data: null, error: access.error }
    }
    const originalDirectory = access.row

    // Unique slug via shared helper
    const slug = await generateUniqueContentSlug(directories, originalDirectory.siteId, newTitle)

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

    await safeSyncSiteSearchDocument('directory', newDirectory)
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

async function getDirectoryBySlugAction(siteId: string, slug: string) {
  try {
    // Validate site ID format
    if (!UUID_REGEX.test(siteId)) {
      return { data: null, error: 'Invalid site ID format' }
    }

    const user = await getAuthenticatedUser()
    if (!user) {
      return { data: null, error: 'User not authenticated. Please log in first.' }
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

    // Get site details and verify ownership (needs name/subdomain, so not the shared helper)
    const [site] = await db.select({ userId: sites.userId, name: sites.name, subdomain: sites.subdomain })
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { data: null, error: 'Site not found or access denied' }
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
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<DirectoryRow>(directories, directoryId, 'Directory')
    if (!access.ok) {
      return { data: null, error: access.error }
    }

    return { data: toDirectory(access.row), error: null }
  } catch (error) {
    console.error('Error fetching directory by ID:', error)
    return { data: null, error: 'Failed to fetch directory' }
  }
}

export async function updateDirectoryBlockValuesAction(directoryId: string, contentBlocks: Record<string, any>) {
  try {
    // Auth + row + site ownership (fast-fail helper; check runs on every call)
    const access = await requireOwnedContentRow<DirectoryRow>(directories, directoryId, 'Directory')
    if (!access.ok) {
      return { success: false, error: access.error }
    }
    const directory = access.row

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
    const derivedMetaDescription = directory.metaDescription
      ? null
      : deriveDirectoryMetaDescriptionFromBlocks(valueBlocks)
    const updates: Record<string, any> = {
      contentBlocks: valueBlocks,
      updatedAt: new Date(),
    }
    if (derivedMetaDescription) {
      updates.metaDescription = derivedMetaDescription
    }

    // Update the listing-specific block values
    await db.update(directories)
      .set(updates)
      .where(eq(directories.id, directoryId))
    await safeSyncSiteSearchDocument('directory', {
      ...directory,
      contentBlocks: valueBlocks,
      metaDescription: derivedMetaDescription || directory.metaDescription,
    })

    // Revalidate cache
    revalidateTag('directory')
    revalidateTag('listing-views')
    revalidateTag(`directory-${directoryId}`)
    revalidateTag(`site-${directory.siteId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('Error updating directory blocks:', error)
    return { success: false, error: 'Failed to update directory blocks' }
  }
}
