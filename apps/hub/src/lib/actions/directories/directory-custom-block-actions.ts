'use server'

import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { directories, directoryCustomBlocks, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { generateSlug } from '@/lib/utils/slug'
import {
  ensureUniqueTemplateSlug,
  normalizeDirectoryCustomBlockFields,
  pruneDirectoryCustomBlockValues,
} from './directory-custom-blocks/utils'
import type { DirectoryCustomBlockLayout, DirectoryCustomBlockTemplate } from './directory-custom-blocks/types'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    .select({ contentBlocks: directories.contentBlocks })
    .from(directories)
    .where(eq(directories.siteId, siteId))

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
  const directoryRows = await db
    .select({ id: directories.id, contentBlocks: directories.contentBlocks })
    .from(directories)
    .where(eq(directories.siteId, siteId))

  for (const row of directoryRows) {
    const contentBlocks = row.contentBlocks && typeof row.contentBlocks === 'object'
      ? { ...(row.contentBlocks as Record<string, any>) }
      : {}

    let changed = false

    Object.entries(contentBlocks).forEach(([blockId, block]) => {
      if (!block || typeof block !== 'object' || block.type !== 'directory-custom') return
      if (block?.content?.templateId !== templateId) return

      const nextBlock = { ...block }

      if (updates.name !== undefined && nextBlock.title !== updates.name) {
        nextBlock.title = updates.name
        changed = true
      }

      if (updates.fields !== undefined) {
        const currentValues = nextBlock?.content?.values
        const nextValues = pruneDirectoryCustomBlockValues(updates.fields as any[], currentValues)
        const previousSerialized = JSON.stringify(currentValues || {})
        const nextSerialized = JSON.stringify(nextValues)

        if (previousSerialized !== nextSerialized) {
          nextBlock.content = {
            ...nextBlock.content,
            values: nextValues,
          }
          changed = true
        }
      }

      if (changed) {
        contentBlocks[blockId] = nextBlock
      }
    })

    if (changed) {
      await db
        .update(directories)
        .set({
          contentBlocks,
          updatedAt: new Date(),
        })
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

export async function getDirectoryCustomBlocksByIds(siteId: string, templateIds: string[]): Promise<{ data: DirectoryCustomBlockTemplate[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, error: 'Invalid site ID' }
    if (!templateIds.length) return { data: [], error: null }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    if (!await verifySiteOwnership(siteId, user.id)) {
      return { data: null, error: 'Access denied' }
    }

    const rows = await db
      .select()
      .from(directoryCustomBlocks)
      .where(and(eq(directoryCustomBlocks.siteId, siteId), inArray(directoryCustomBlocks.id, templateIds)))

    return { data: rows.map(row => rowToTemplate(row)), error: null }
  } catch (error) {
    console.error('getDirectoryCustomBlocksByIds error:', error)
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
      return { success: false, error: 'Custom block is still used in directory items' }
    }

    await db
      .delete(directoryCustomBlocks)
      .where(eq(directoryCustomBlocks.id, templateId))

    return { success: true, error: null }
  } catch (error) {
    console.error('deleteDirectoryCustomBlock error:', error)
    return { success: false, error: 'Server error' }
  }
}
