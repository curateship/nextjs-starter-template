'use server'

import { and, desc, eq, inArray } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { directories, directoryCustomBlocks, directoryTemplates, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { generateSlug } from '@/lib/utils/slug'
import {
  ensureUniqueTemplateSlug,
  normalizeDirectoryCustomBlockFields,
  pruneDirectoryCustomBlockValues,
} from './directory-custom-blocks/utils'
import type { DirectoryCustomBlockLayout, DirectoryCustomBlockTemplate } from './directory-custom-blocks/types'
import { UUID_REGEX } from '@/lib/utils/validation'

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)

  return !!site
}

function rowToTemplate(row: any, usedInCount = 0): DirectoryCustomBlockTemplate {
  return {
    id: row.id,
    site_id: row.siteId,
    name: row.name,
    slug: row.slug,
    layout: row.layout as DirectoryCustomBlockLayout,
    fields: Array.isArray(row.fields) ? row.fields : [],
    used_in_count: usedInCount,
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

async function getUsageCountsBySite(siteId: string) {
  const rows = await db
    .select({ contentBlocks: directoryTemplates.contentBlocks })
    .from(directoryTemplates)
    .where(eq(directoryTemplates.siteId, siteId))

  const counts = new Map<string, number>()

  rows.forEach(row => {
    const blocks = row.contentBlocks && typeof row.contentBlocks === 'object' ? row.contentBlocks as Record<string, any> : {}

    Object.values(blocks).forEach((block: any) => {
      if (block?.type !== 'directory-custom') return

      const templateId = block?.content?.templateId
      if (typeof templateId !== 'string' || !templateId) return

      counts.set(templateId, (counts.get(templateId) || 0) + 1)
    })
  })

  return counts
}

async function getUsedInCount(templateId: string, siteId: string) {
  const counts = await getUsageCountsBySite(siteId)
  return counts.get(templateId) || 0
}

async function getExistingSlugs(siteId: string, excludeId?: string) {
  const rows = await db
    .select({ id: directoryCustomBlocks.id, slug: directoryCustomBlocks.slug })
    .from(directoryCustomBlocks)
    .where(eq(directoryCustomBlocks.siteId, siteId))

  return new Set(rows.filter(row => row.id !== excludeId).map(row => row.slug))
}

async function syncTemplateUsage(siteId: string, templateId: string, updates: { name?: string; fields?: any[] }) {
  const templateRows = await db
    .select({ id: directoryTemplates.id, contentBlocks: directoryTemplates.contentBlocks })
    .from(directoryTemplates)
    .where(eq(directoryTemplates.siteId, siteId))

  const affectedTemplateBlockIds = new Map<string, string[]>()

  for (const row of templateRows) {
    const contentBlocks = row.contentBlocks && typeof row.contentBlocks === 'object'
      ? { ...(row.contentBlocks as Record<string, any>) }
      : {}
    const affectedBlockIds: string[] = []

    let changed = false

    Object.entries(contentBlocks).forEach(([blockId, block]) => {
      if (!block || typeof block !== 'object' || block.type !== 'directory-custom') return
      if (block?.content?.templateId !== templateId) return

      affectedBlockIds.push(blockId)
      const nextBlock = { ...block }
      let blockChanged = false

      if (updates.name !== undefined && nextBlock.title !== updates.name) {
        nextBlock.title = updates.name
        blockChanged = true
      }

      if (blockChanged) {
        contentBlocks[blockId] = nextBlock
        changed = true
      }
    })

    if (affectedBlockIds.length) {
      affectedTemplateBlockIds.set(row.id, affectedBlockIds)
    }

    if (changed) {
      await db
        .update(directoryTemplates)
        .set({
          contentBlocks,
          updatedAt: new Date(),
        })
        .where(eq(directoryTemplates.id, row.id))
    }
  }

  if (updates.fields === undefined || !affectedTemplateBlockIds.size) return

  const directoryRows = await db
    .select({ id: directories.id, templateId: directories.templateId, contentBlocks: directories.contentBlocks })
    .from(directories)
    .where(and(eq(directories.siteId, siteId), inArray(directories.templateId, Array.from(affectedTemplateBlockIds.keys()))))

  for (const row of directoryRows) {
    const affectedBlockIds = affectedTemplateBlockIds.get(row.templateId) || []
    const contentBlocks = row.contentBlocks && typeof row.contentBlocks === 'object'
      ? { ...(row.contentBlocks as Record<string, any>) }
      : {}
    let changed = false

    for (const blockId of affectedBlockIds) {
      const block = contentBlocks[blockId]
      if (!block || typeof block !== 'object') continue

      const currentValues = block?.content?.values
      const nextValues = pruneDirectoryCustomBlockValues(updates.fields as any[], currentValues)
      const previousSerialized = JSON.stringify(currentValues || {})
      const nextSerialized = JSON.stringify(nextValues)

      if (previousSerialized !== nextSerialized) {
        contentBlocks[blockId] = {
          ...block,
          content: {
            ...(block.content || {}),
            values: nextValues,
          },
        }
        changed = true
      }
    }

    if (changed) {
      await db
        .update(directories)
        .set({ contentBlocks, updatedAt: new Date() })
        .where(eq(directories.id, row.id))
    }
  }
}

export async function getDirectoryCustomBlocksBySite(siteId: string): Promise<{ data: DirectoryCustomBlockTemplate[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const [rows, usageCounts] = await Promise.all([
      db
        .select()
        .from(directoryCustomBlocks)
        .where(eq(directoryCustomBlocks.siteId, siteId))
        .orderBy(desc(directoryCustomBlocks.updatedAt)),
      getUsageCountsBySite(siteId),
    ])

    return {
      data: rows.map(row => rowToTemplate(row, usageCounts.get(row.id) || 0)),
      error: null,
    }
  } catch (error) {
    console.error('getDirectoryCustomBlocksBySite error:', error)
    return { data: null, error: 'Server error' }
  }
}

export async function getDirectoryCustomBlockById(templateId: string): Promise<{ data: DirectoryCustomBlockTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [row] = await db
      .select()
      .from(directoryCustomBlocks)
      .where(eq(directoryCustomBlocks.id, templateId))
      .limit(1)

    if (!row) return { data: null, error: 'Custom block not found' }

    if (!await verifySiteOwnership(row.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const usedInCount = await getUsedInCount(row.id, row.siteId)

    return { data: rowToTemplate(row, usedInCount), error: null }
  } catch (error) {
    console.error('getDirectoryCustomBlockById error:', error)
    return { data: null, error: 'Server error' }
  }
}

export async function createDirectoryCustomBlock(input: {
  siteId: string
  name: string
  layout?: DirectoryCustomBlockLayout
  fields?: any[]
}): Promise<{ data: DirectoryCustomBlockTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(input.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const name = input.name.trim()
    if (!name) return { data: null, error: 'Block name is required' }

    const fields = normalizeDirectoryCustomBlockFields(input.fields || [])
    const existingSlugs = await getExistingSlugs(input.siteId)
    const slug = ensureUniqueTemplateSlug(generateSlug(name) || 'custom-block', existingSlugs)

    const [row] = await db
      .insert(directoryCustomBlocks)
      .values({
        siteId: input.siteId,
        name,
        slug,
        layout: input.layout || 'stack',
        fields,
      })
      .returning()

    if (!row) return { data: null, error: 'Failed to create custom block' }

    revalidateTag('directory')
    revalidateTag(`site-${input.siteId}`)

    return { data: rowToTemplate(row), error: null }
  } catch (error) {
    console.error('createDirectoryCustomBlock error:', error)
    return { data: null, error: 'Server error' }
  }
}

export async function updateDirectoryCustomBlock(templateId: string, updates: {
  name?: string
  layout?: DirectoryCustomBlockLayout
  fields?: any[]
}): Promise<{ data: DirectoryCustomBlockTemplate | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { data: null, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [existing] = await db
      .select()
      .from(directoryCustomBlocks)
      .where(eq(directoryCustomBlocks.id, templateId))
      .limit(1)

    if (!existing) return { data: null, error: 'Custom block not found' }

    if (!await verifySiteOwnership(existing.siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const nextName = updates.name !== undefined ? updates.name.trim() : existing.name
    if (!nextName) return { data: null, error: 'Block name is required' }

    const existingSlugs = await getExistingSlugs(existing.siteId, existing.id)
    const nextSlug = ensureUniqueTemplateSlug(generateSlug(nextName) || 'custom-block', existingSlugs, existing.slug)
    const nextFields = updates.fields !== undefined
      ? normalizeDirectoryCustomBlockFields(updates.fields)
      : Array.isArray(existing.fields)
        ? existing.fields
        : []

    const [row] = await db
      .update(directoryCustomBlocks)
      .set({
        name: nextName,
        slug: nextSlug,
        layout: updates.layout || existing.layout,
        fields: nextFields,
        updatedAt: new Date(),
      })
      .where(eq(directoryCustomBlocks.id, templateId))
      .returning()

    if (!row) return { data: null, error: 'Failed to update custom block' }

    if (updates.name !== undefined || updates.fields !== undefined) {
      await syncTemplateUsage(existing.siteId, existing.id, {
        ...(updates.name !== undefined ? { name: nextName } : {}),
        ...(updates.fields !== undefined ? { fields: nextFields } : {}),
      })
    }

    const usedInCount = await getUsedInCount(existing.id, existing.siteId)

    revalidateTag('directory')
    revalidateTag(`site-${existing.siteId}`)

    return { data: rowToTemplate(row, usedInCount), error: null }
  } catch (error) {
    console.error('updateDirectoryCustomBlock error:', error)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteDirectoryCustomBlock(templateId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(templateId)) return { success: false, error: 'Invalid ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const [row] = await db
      .select()
      .from(directoryCustomBlocks)
      .where(eq(directoryCustomBlocks.id, templateId))
      .limit(1)

    if (!row) return { success: false, error: 'Custom block not found' }

    if (!await verifySiteOwnership(row.siteId, user.id)) {
      return { success: false, error: 'Access denied' }
    }

    const usedInCount = await getUsedInCount(templateId, row.siteId)
    if (usedInCount > 0) {
      return { success: false, error: 'Custom block is still used in directory templates' }
    }

    await db
      .delete(directoryCustomBlocks)
      .where(eq(directoryCustomBlocks.id, templateId))

    revalidateTag('directory')
    revalidateTag(`site-${row.siteId}`)

    return { success: true, error: null }
  } catch (error) {
    console.error('deleteDirectoryCustomBlock error:', error)
    return { success: false, error: 'Server error' }
  }
}
