import { NextRequest, NextResponse } from '@/lib/web-response'
import { revalidateTag } from '@/lib/cache'
import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { categories, contentCategoryRelationships } from '@/lib/db/schema/categories'
import { directories } from '@/lib/db/schema/directories'
import { directoryCustomBlocks } from '@/lib/db/schema/directory-custom-blocks'
import { directoryTemplates } from '@/lib/db/schema/directory-templates'
import { media } from '@/lib/db/schema/media'
import { sites } from '@/lib/db/schema/sites'
import { ensureDirectoryBlankTemplateForSite } from '@/lib/actions/directories/directory-template-ensure'
import { getDefaultCategoryTemplateIdForSite } from '@/lib/actions/categories/category-template-ensure'
import {
  deriveDirectoryMetaDescriptionFromBlocks,
  getDirectoryTemplateDefaultCategoryParentId,
  mergeDirectoryTemplateBlocks,
  pruneDirectoryValueBlocksForTemplate,
} from '@/lib/actions/directories/directory-template-inheritance'
import { generateSlug } from '@/lib/utils/slug'
import { isAuthorizedCoreBridgeRequest, isCoreBridgeSiteAllowed } from '@/lib/utils/core-bridge-auth'
import { deleteFromR2, uploadToR2 } from '@/lib/utils/r2'
import { UUID_REGEX } from '@/lib/utils/validation'

interface GoogleMapsImportRecord {
  google_maps_place_id?: unknown
  businessName?: unknown
  title?: unknown
  description?: unknown
  featuredImage?: unknown
}

interface GoogleMapsBlockMapping {
  sourceKey?: unknown
  targetBlockId?: unknown
  targetKind?: unknown
  targetFieldKey?: unknown
}

type NormalizedBlockMapping = {
  sourceKey: string
  targetBlockId: string
  targetKind: 'directoryTitle' | 'directoryFeaturedImage' | 'directoryCategory' | 'richTextBody' | 'googleMapLocationQuery' | 'openingHoursPlaceId' | 'openingHoursText' | 'customField' | 'coreContentField' | 'coreMenuLink' | 'coreSocialLink'
  targetFieldKey: string
}

type PublicAddress = { address: string; family: 4 | 6 }
type AssignableCategory = { id: string; title: string; parentId: string | null; isPublished: boolean }
type MappedDirectoryCategory = { title: string | null; parentCategoryId: string | null }

const TARGET_KINDS = new Set([
  'directoryTitle',
  'directoryFeaturedImage',
  'directoryCategory',
  'richTextBody',
  'googleMapLocationQuery',
  'openingHoursPlaceId',
  'openingHoursText',
  'customField',
  'coreContentField',
  'coreMenuLink',
  'coreSocialLink',
])
const FIELD_KEY_TARGET_KINDS = new Set(['customField', 'coreContentField', 'coreMenuLink', 'coreSocialLink'])
const DIRECTORY_TARGET_KINDS = new Set(['directoryTitle', 'directoryFeaturedImage', 'directoryCategory'])
const CORE_CONTENT_FIELD_TYPES: Record<string, 'text' | 'number'> = {
  address: 'text',
  rating: 'number',
}
const CORE_MENU_LINK_TYPES = new Set(['directions', 'phone', 'website', 'email'])
const CORE_SOCIAL_LINK_TYPES = new Set(['instagram', 'facebook', 'tiktok', 'twitter', 'linkedin', 'youtube'])

const MAX_ITEMS = 500
const MAX_BODY_BYTES = 2 * 1024 * 1024
const REMOTE_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const GOOGLE_MAPS_SOURCE_TYPE = 'google_maps'
const REMOTE_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'])
const REMOTE_IMAGE_EXTENSIONS = ['jpg', 'png', 'gif', 'webp']

export async function POST(request: NextRequest) {
  if (!isAuthorizedCoreBridgeRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payloadResult = await readLimitedJsonPayload(request)
  if (payloadResult.tooLarge) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 })
  }

  const payload = payloadResult.payload
  const siteId = typeof payload?.site_id === 'string' ? payload.site_id : ''
  const status: 'draft' | 'published' | null = payload?.status === 'published'
    ? 'published'
    : payload?.status === 'draft'
      ? 'draft'
      : null
  const items = Array.isArray(payload?.items) ? payload.items : []
  const mappings = normalizeMappings(payload?.mappings)

  if (!UUID_REGEX.test(siteId)) {
    return NextResponse.json({ error: 'Valid site_id is required' }, { status: 400 })
  }

  if (!isCoreBridgeSiteAllowed(siteId)) {
    return NextResponse.json({ error: 'Site is not allowed for this bridge' }, { status: 403 })
  }

  if (!status) {
    return NextResponse.json({ error: 'Status must be draft or published' }, { status: 400 })
  }

  if (!items.length || items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Items must contain 1-${MAX_ITEMS} records` }, { status: 400 })
  }

  const [site] = await db.select({ id: sites.id, userId: sites.userId }).from(sites).where(eq(sites.id, siteId)).limit(1)
  if (!site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  }

  let nextDisplayOrder = await getNextDisplayOrder(siteId)
  const defaultTemplate = await getDefaultDirectoryTemplateBlocks(siteId)
  const templateCache = new Map<string, Awaited<ReturnType<typeof getDirectoryTemplateBlocksById>>>()
  const customBlockTemplates = mappings.some((mapping) => mapping.targetKind === 'customField')
    ? await getDirectoryCustomBlockTemplates(siteId)
    : new Map<string, { fields: any[] }>()
  const categoryCache = new Map<string, AssignableCategory | null>()
  const results = []

  for (const item of items) {
    const record = normalizeRecord(item)
    const directoryMappingValues = getDirectoryMappingValues(item, mappings)
    const mappedTitle = cleanText(directoryMappingValues.title, 255)
    const mappedFeaturedImage = safeUrl(directoryMappingValues.featuredImage)
    const mappedCategories = directoryMappingValues.categories.map((category) => ({
      title: cleanText(category.title, 255),
      parentCategoryId: category.parentCategoryId,
    }))

    if (!record.placeId) {
      results.push({ source_type: GOOGLE_MAPS_SOURCE_TYPE, source_id: null, action: 'error', error: 'Missing Google Maps Place ID' })
      continue
    }

    if (!record.title && !mappedTitle) {
      results.push({ source_type: GOOGLE_MAPS_SOURCE_TYPE, source_id: record.placeId, action: 'error', error: 'Missing business name' })
      continue
    }

    const placeId = record.placeId
    const title = mappedTitle || record.title || ''
    const featuredImageSource = mappedFeaturedImage || record.featuredImage

    try {
      const existing = await findDirectoryBySource(siteId, GOOGLE_MAPS_SOURCE_TYPE, placeId)
      const template = existing?.templateId
        ? await getCachedDirectoryTemplateBlocks(siteId, existing.templateId, templateCache)
        : defaultTemplate
      const hubFeaturedImage = await importFeaturedImageToHub(featuredImageSource, {
        siteId: site.id,
        userId: site.userId,
        altText: title,
      })
      const sourceBlocks = existing
        ? mergeDirectoryTemplateBlocks(template.contentBlocks, (existing.contentBlocks || {}) as Record<string, any>)
        : cloneContentBlocks(template.contentBlocks)
      const contentBlocks = cleanContentBlocks(sourceBlocks)
      applyBlockMappings(contentBlocks, item, mappings, customBlockTemplates)
      const valueBlocks = pruneDirectoryValueBlocksForTemplate(contentBlocks, template.contentBlocks)
      const derivedMetaDescription = deriveDirectoryMetaDescriptionFromBlocks(valueBlocks)
      const values = {
        title,
        status,
        sourceType: GOOGLE_MAPS_SOURCE_TYPE,
        sourceId: placeId,
        contentBlocks: valueBlocks,
        updatedAt: new Date(),
        ...(!existing?.metaDescription && derivedMetaDescription ? { metaDescription: derivedMetaDescription } : {}),
        ...(featuredImageSource ? { featuredImage: hubFeaturedImage } : {}),
      }

      if (existing) {
        const [updated] = await db.update(directories)
          .set(values)
          .where(eq(directories.id, existing.id))
          .returning({ id: directories.id, slug: directories.slug })
        await assignMappedDirectoryCategories(siteId, updated.id, mappedCategories, template.defaultCategoryParentId, categoryCache)

        results.push({
          source_type: GOOGLE_MAPS_SOURCE_TYPE,
          source_id: placeId,
          action: 'updated',
          directory_id: updated.id,
          slug: updated.slug,
        })
        continue
      }

      const slug = await createUniqueSlug(siteId, title)
      const [created] = await db.insert(directories)
        .values({
          siteId,
          templateId: template.id,
          title,
          slug,
          status,
          displayOrder: nextDisplayOrder,
          featuredImage: hubFeaturedImage,
          sourceType: GOOGLE_MAPS_SOURCE_TYPE,
          sourceId: placeId,
          metaDescription: derivedMetaDescription || null,
          contentBlocks: valueBlocks,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: directories.id, slug: directories.slug })
      await assignMappedDirectoryCategories(siteId, created.id, mappedCategories, template.defaultCategoryParentId, categoryCache)

      nextDisplayOrder += 1
      results.push({
        source_type: GOOGLE_MAPS_SOURCE_TYPE,
        source_id: placeId,
        action: 'created',
        directory_id: created.id,
        slug: created.slug,
      })
    } catch (error) {
      const safeError = hubImportErrorMessage(error)
      console.error('Core Google Maps directory import failed:', { sourceId: placeId, error: safeError })
      results.push({
        source_type: GOOGLE_MAPS_SOURCE_TYPE,
        source_id: placeId,
        action: 'error',
        error: safeError,
      })
    }
  }

  revalidateTag('directory')
  revalidateTag('listing-views')
  revalidateTag(`site-${siteId}`)
  for (const result of results) {
    if (typeof result.directory_id === 'string') {
      revalidateTag(`directory-${result.directory_id}`)
    }
  }

  return NextResponse.json({
    results,
    created: results.filter((result) => result.action === 'created').length,
    updated: results.filter((result) => result.action === 'updated').length,
    errors: results.filter((result) => result.action === 'error').length,
  })
}

async function readLimitedJsonPayload(request: NextRequest) {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const size = Number(contentLength)
    if (!Number.isFinite(size) || size > MAX_BODY_BYTES) {
      return { payload: null, tooLarge: true }
    }
  }

  let body = ''
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  if (!reader) return { payload: null, tooLarge: false }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    body += decoder.decode(value, { stream: true })
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      return { payload: null, tooLarge: true }
    }
  }

  body += decoder.decode()

  try {
    return { payload: JSON.parse(body), tooLarge: false }
  } catch {
    return { payload: null, tooLarge: false }
  }
}

async function findDirectoryBySource(siteId: string, sourceType: string, sourceId: string) {
  const [row] = await db.select()
    .from(directories)
    .where(and(eq(directories.siteId, siteId), eq(directories.sourceType, sourceType), eq(directories.sourceId, sourceId)))
    .limit(1)

  return row ?? null
}

async function getDefaultDirectoryTemplateBlocks(siteId: string) {
  await ensureDirectoryBlankTemplateForSite(siteId)

  const [template] = await db.select({
    id: directoryTemplates.id,
    contentBlocks: directoryTemplates.contentBlocks,
  })
    .from(directoryTemplates)
    .where(eq(directoryTemplates.siteId, siteId))
    .orderBy(desc(directoryTemplates.isDefault), desc(directoryTemplates.updatedAt))
    .limit(1)

  const contentBlocks = cloneContentBlocks(template?.contentBlocks)

  return {
    id: template!.id,
    contentBlocks,
    defaultCategoryParentId: getValidTemplateDefaultCategoryParentId(contentBlocks),
  }
}

async function getDirectoryTemplateBlocksById(siteId: string, templateId: string) {
  const [template] = await db.select({
    id: directoryTemplates.id,
    contentBlocks: directoryTemplates.contentBlocks,
  })
    .from(directoryTemplates)
    .where(and(eq(directoryTemplates.siteId, siteId), eq(directoryTemplates.id, templateId)))
    .limit(1)

  if (!template) return getDefaultDirectoryTemplateBlocks(siteId)

  const contentBlocks = cloneContentBlocks(template.contentBlocks)

  return {
    id: template.id,
    contentBlocks,
    defaultCategoryParentId: getValidTemplateDefaultCategoryParentId(contentBlocks),
  }
}

async function getCachedDirectoryTemplateBlocks(
  siteId: string,
  templateId: string,
  cache: Map<string, Awaited<ReturnType<typeof getDirectoryTemplateBlocksById>>>
) {
  if (!cache.has(templateId)) {
    cache.set(templateId, await getDirectoryTemplateBlocksById(siteId, templateId))
  }

  return cache.get(templateId)!
}

function cloneContentBlocks(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return JSON.parse(JSON.stringify(value))
}

function getValidTemplateDefaultCategoryParentId(contentBlocks: Record<string, any>) {
  const parentId = getDirectoryTemplateDefaultCategoryParentId(contentBlocks)
  return parentId && UUID_REGEX.test(parentId) ? parentId : null
}

function normalizeMappings(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((item): NormalizedBlockMapping | null => {
      const mapping = item && typeof item === 'object' && !Array.isArray(item)
        ? item as GoogleMapsBlockMapping
        : {}
      const targetKind = typeof mapping.targetKind === 'string' ? mapping.targetKind : ''

      if (!TARGET_KINDS.has(targetKind)) {
        return null
      }

      const sourceKey = cleanText(mapping.sourceKey, 100)
      const targetBlockId = cleanText(mapping.targetBlockId, 255)
      const targetFieldKey = cleanText(mapping.targetFieldKey, 255) || ''

      if (!sourceKey || !targetBlockId) return null
      if (FIELD_KEY_TARGET_KINDS.has(targetKind) && !targetFieldKey) return null
      if (targetKind === 'coreContentField' && !CORE_CONTENT_FIELD_TYPES[targetFieldKey]) return null

      return { sourceKey, targetBlockId, targetKind: targetKind as NormalizedBlockMapping['targetKind'], targetFieldKey }
    })
    .filter((item): item is NormalizedBlockMapping => Boolean(item))
    .slice(0, 100)
}

async function getDirectoryCustomBlockTemplates(siteId: string) {
  const rows = await db.select({ id: directoryCustomBlocks.id, fields: directoryCustomBlocks.fields })
    .from(directoryCustomBlocks)
    .where(eq(directoryCustomBlocks.siteId, siteId))

  return new Map(rows.map((row) => [row.id, {
    fields: Array.isArray(row.fields) ? row.fields : [],
  }]))
}

function getDirectoryMappingValues(record: unknown, mappings: ReturnType<typeof normalizeMappings>) {
  const source = record && typeof record === 'object' && !Array.isArray(record)
    ? record as Record<string, unknown>
    : {}
  const values: { title?: unknown; featuredImage?: unknown; categories: Array<{ title: unknown; parentCategoryId: string | null }> } = {
    categories: [],
  }

  mappings.forEach((mapping) => {
    if (!DIRECTORY_TARGET_KINDS.has(mapping.targetKind)) return

    const sourceValue = source[mapping.sourceKey]
    if (sourceValue === undefined || sourceValue === null || sourceValue === '') return

    if (mapping.targetKind === 'directoryTitle') values.title = sourceValue
    if (mapping.targetKind === 'directoryFeaturedImage') values.featuredImage = sourceValue
    if (mapping.targetKind === 'directoryCategory') {
      categoryTitlesFromSource(sourceValue).forEach((title) => values.categories.push({
        title,
        parentCategoryId: UUID_REGEX.test(mapping.targetFieldKey) ? mapping.targetFieldKey : null,
      }))
    }
  })

  return values
}

function categoryTitlesFromSource(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(categoryTitlesFromSource)
  if (typeof value !== 'string') return []
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

async function assignMappedDirectoryCategories(
  siteId: string,
  directoryId: string,
  mappedCategories: MappedDirectoryCategory[],
  defaultParentCategoryId: string | null,
  categoryCache: Map<string, AssignableCategory | null>
) {
  const resolvedCategories: AssignableCategory[] = []

  for (const mappedCategory of mappedCategories) {
    if (!mappedCategory.title) continue

    const parentCategoryId = mappedCategory.parentCategoryId || defaultParentCategoryId
    const normalizedTitle = normalizeCategoryTitle(mappedCategory.title)
    if (!normalizedTitle) continue

    const cacheKey = `${parentCategoryId || ''}:${normalizedTitle}`
    if (!categoryCache.has(cacheKey)) {
      categoryCache.set(cacheKey, await findOrCreateAssignableCategory(siteId, mappedCategory.title, parentCategoryId, normalizedTitle))
    }

    const category = categoryCache.get(cacheKey)
    if (category && !resolvedCategories.some((item) => item.id === category.id)) {
      resolvedCategories.push(category)
    }
  }

  if (!resolvedCategories.length) return

  const importedParentIds = Array.from(new Set(resolvedCategories.map((category) => category.parentId).filter((id): id is string => Boolean(id))))
  const revalidatedCategoryIds = new Set(resolvedCategories.map((category) => category.id))

  await db.transaction(async (tx) => {
    const directoryRelationship = and(
      eq(contentCategoryRelationships.contentId, directoryId),
      eq(contentCategoryRelationships.contentType, 'directory')
    )

    await tx.update(contentCategoryRelationships)
      .set({ isPrimary: false })
      .where(and(directoryRelationship, eq(contentCategoryRelationships.isPrimary, true)))

    if (importedParentIds.length) {
      const existingImportedRelationships = await tx.select({
        id: contentCategoryRelationships.id,
        categoryId: contentCategoryRelationships.categoryId,
      })
        .from(contentCategoryRelationships)
        .innerJoin(categories, eq(categories.id, contentCategoryRelationships.categoryId))
        .where(and(
          directoryRelationship,
          inArray(categories.parentId, importedParentIds)
        ))

      if (existingImportedRelationships.length) {
        existingImportedRelationships.forEach((relationship) => revalidatedCategoryIds.add(relationship.categoryId))
        await tx.delete(contentCategoryRelationships)
          .where(inArray(contentCategoryRelationships.id, existingImportedRelationships.map((relationship) => relationship.id)))
      }
    }

    await tx.insert(contentCategoryRelationships).values(resolvedCategories.map((category, index) => ({
      contentId: directoryId,
      contentType: 'directory',
      categoryId: category.id,
      isPrimary: index === 0,
    })))
  })

  revalidateTag('content-categories')
  revalidatedCategoryIds.forEach((categoryId) => revalidateTag(`category-${categoryId}`))
}

async function findOrCreateAssignableCategory(siteId: string, title: string, parentCategoryId: string | null, normalizedTitle: string) {
  const rows = await db.select({
    id: categories.id,
    title: categories.title,
    parentId: categories.parentId,
    isPublished: categories.isPublished,
  })
    .from(categories)
    .where(eq(categories.siteId, siteId))

  const existing = rows
    .filter((category) => category.isPublished && category.parentId)
    .find((category) => {
      if (normalizeCategoryTitle(category.title) !== normalizedTitle) return false
      return parentCategoryId ? category.parentId === parentCategoryId : true
    })

  if (existing) return existing
  if (!parentCategoryId) return null

  const parentCategory = rows.find((category) => category.id === parentCategoryId && category.isPublished && !category.parentId)
  if (!parentCategory) return null

  return createHubCategory(siteId, title, parentCategoryId)
}

function normalizeCategoryTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function createHubCategory(siteId: string, title: string, parentCategoryId: string) {
  const slug = await createUniqueCategorySlug(siteId, title)
  const [maxOrderCategory] = await db.select({ displayOrder: categories.displayOrder })
    .from(categories)
    .where(eq(categories.siteId, siteId))
    .orderBy(desc(categories.displayOrder))
    .limit(1)

  const [category] = await db.insert(categories)
    .values({
      siteId,
      // categories.template_id is NOT NULL — auto-created categories get the site default
      templateId: await getDefaultCategoryTemplateIdForSite(siteId),
      title,
      slug,
      parentId: parentCategoryId,
      contentBlocks: {},
      isPublished: true,
      displayOrder: maxOrderCategory ? maxOrderCategory.displayOrder + 1 : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: categories.id, title: categories.title, parentId: categories.parentId, isPublished: categories.isPublished })

  revalidateTag('categories')
  revalidateTag(`site-${siteId}`)
  return category || null
}

async function createUniqueCategorySlug(siteId: string, title: string) {
  const baseSlug = generateSlug(title) || 'category'
  let slug = baseSlug
  let suffix = 2

  while (await categorySlugExists(siteId, slug)) {
    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }

  return slug
}

async function categorySlugExists(siteId: string, slug: string) {
  const [row] = await db.select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.siteId, siteId), eq(categories.slug, slug)))
    .limit(1)

  return Boolean(row)
}

function applyBlockMappings(
  contentBlocks: Record<string, any>,
  record: unknown,
  mappings: ReturnType<typeof normalizeMappings>,
  customBlockTemplates: Map<string, { fields: any[] }>
) {
  if (!mappings.length) return

  const source = record && typeof record === 'object' && !Array.isArray(record)
    ? record as Record<string, unknown>
    : {}

  for (const mapping of mappings) {
    if (DIRECTORY_TARGET_KINDS.has(mapping.targetKind)) continue

    const block = contentBlocks[mapping.targetBlockId]
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      throw new Error(`Mapped Hub block "${mapping.targetBlockId}" is missing. Add or restore that block in the directory template/listing.`)
    }

    const sourceValue = source[mapping.sourceKey]
    if (sourceValue === undefined || sourceValue === null || sourceValue === '') continue

    if (mapping.targetKind === 'richTextBody') {
      if (block.type !== 'directory-rich-text') {
        throw new Error(`Mapped block "${mapping.targetBlockId}" is not a rich text block.`)
      }

      block.content = {
        ...(block.content || {}),
        body: plainTextToHtml(String(sourceValue)),
        format: 'html',
      }
      continue
    }

    if (mapping.targetKind === 'googleMapLocationQuery') {
      if (block.type !== 'directory-google-map') {
        throw new Error(`Mapped block "${mapping.targetBlockId}" is not a Google Map block.`)
      }

      block.content = {
        ...(block.content || {}),
        locationQuery: String(sourceValue),
      }
      continue
    }

    if (mapping.targetKind === 'openingHoursPlaceId') {
      if (block.type !== 'directory-opening-hours') {
        throw new Error(`Mapped block "${mapping.targetBlockId}" is not an Opening Hours block.`)
      }

      block.content = {
        ...(block.content || {}),
        placeId: String(sourceValue),
      }
      continue
    }

    if (mapping.targetKind === 'openingHoursText') {
      if (block.type !== 'directory-opening-hours') {
        throw new Error(`Mapped block "${mapping.targetBlockId}" is not an Opening Hours block.`)
      }

      const hoursText = Array.isArray(sourceValue)
        ? sourceValue.filter((item) => typeof item === 'string' && item.trim()).join('\n')
        : typeof sourceValue === 'string' ? sourceValue.trim() : ''

      if (!hoursText) continue

      block.content = {
        ...(block.content || {}),
        sourceMode: 'text',
        hoursText,
      }
      continue
    }

    if (mapping.targetKind === 'coreContentField') {
      applyCoreContentFieldMapping(block, mapping, sourceValue)
      continue
    }

    if (mapping.targetKind === 'coreMenuLink') {
      applyCoreMenuLinkMapping(block, mapping, sourceValue)
      continue
    }

    if (mapping.targetKind === 'coreSocialLink') {
      applyCoreSocialLinkMapping(block, mapping, sourceValue)
      continue
    }

    applyCustomFieldMapping(block, mapping, sourceValue, customBlockTemplates)
  }
}

function applyCoreContentFieldMapping(
  block: Record<string, any>,
  mapping: ReturnType<typeof normalizeMappings>[number],
  sourceValue: unknown
) {
  if (block.type !== 'directory-core') {
    throw new Error(`Mapped block "${mapping.targetBlockId}" is not a Core block.`)
  }

  const fieldType = CORE_CONTENT_FIELD_TYPES[mapping.targetFieldKey]
  if (!fieldType) {
    throw new Error(`Mapped Core field "${mapping.targetFieldKey}" is not supported.`)
  }

  const value = fieldType === 'number'
    ? numberValue(sourceValue)
    : cleanText(sourceValue, 2000)
  if (value === null) return

  block.content = {
    ...(block.content || {}),
    [mapping.targetFieldKey]: value,
  }
}

function applyCoreMenuLinkMapping(
  block: Record<string, any>,
  mapping: ReturnType<typeof normalizeMappings>[number],
  sourceValue: unknown
) {
  if (block.type !== 'directory-core') {
    throw new Error(`Mapped block "${mapping.targetBlockId}" is not a Core block.`)
  }

  const menuLinks = Array.isArray(block.content?.menuLinks) ? block.content.menuLinks : []
  if (!CORE_MENU_LINK_TYPES.has(mapping.targetFieldKey)) {
    throw new Error(`Mapped Core menu link "${mapping.targetFieldKey}" is not supported.`)
  }

  const index = menuLinks.findIndex((link: unknown) => {
    return link && typeof link === 'object' && !Array.isArray(link) && (link as { type?: unknown }).type === mapping.targetFieldKey
  })

  const nextLinks = [...menuLinks]
  const nextLink = {
    ...(index >= 0 ? nextLinks[index] || {} : {}),
    id: index >= 0 ? nextLinks[index]?.id : `core-menu-${mapping.targetFieldKey}`,
    type: mapping.targetFieldKey,
    value: valueForCoreLink(sourceValue),
  }
  if (index >= 0) nextLinks[index] = nextLink
  else nextLinks.push(nextLink)

  block.content = {
    ...(block.content || {}),
    menuLinks: nextLinks,
  }
}

function applyCoreSocialLinkMapping(
  block: Record<string, any>,
  mapping: ReturnType<typeof normalizeMappings>[number],
  sourceValue: unknown
) {
  if (block.type !== 'directory-core') {
    throw new Error(`Mapped block "${mapping.targetBlockId}" is not a Core block.`)
  }

  const socialLinks = Array.isArray(block.content?.socialLinks) ? block.content.socialLinks : []
  if (!CORE_SOCIAL_LINK_TYPES.has(mapping.targetFieldKey)) {
    throw new Error(`Mapped Core social link "${mapping.targetFieldKey}" is not supported.`)
  }

  const index = socialLinks.findIndex((link: unknown) => {
    const platform = link && typeof link === 'object' && !Array.isArray(link)
      ? (link as { platform?: unknown }).platform
      : ''
    return typeof platform === 'string' && platform.trim().toLowerCase() === mapping.targetFieldKey
  })

  const nextLinks = [...socialLinks]
  const nextLink = {
    ...(index >= 0 ? nextLinks[index] || {} : {}),
    id: index >= 0 ? nextLinks[index]?.id : `core-social-${mapping.targetFieldKey}`,
    platform: mapping.targetFieldKey,
    url: valueForCoreLink(sourceValue),
  }
  if (index >= 0) nextLinks[index] = nextLink
  else nextLinks.push(nextLink)

  block.content = {
    ...(block.content || {}),
    socialLinks: nextLinks,
  }
}

function applyCustomFieldMapping(
  block: Record<string, any>,
  mapping: ReturnType<typeof normalizeMappings>[number],
  sourceValue: unknown,
  customBlockTemplates: Map<string, { fields: any[] }>
) {
  if (block.type !== 'directory-custom') {
    throw new Error(`Mapped block "${mapping.targetBlockId}" is not a custom block.`)
  }

  const templateId = typeof block.content?.templateId === 'string' ? block.content.templateId : ''
  const template = templateId ? customBlockTemplates.get(templateId) : undefined
  const field = template?.fields.find((item) => {
    return item && typeof item === 'object' && !Array.isArray(item) && (item as { key?: unknown }).key === mapping.targetFieldKey
  }) as { type?: string; key?: string } | undefined

  if (!field || field.type === 'repeater') {
    throw new Error(`Mapped custom field "${mapping.targetFieldKey}" is missing. Update the custom block field before exporting.`)
  }

  block.content = {
    ...(block.content || {}),
    values: {
      ...(block.content?.values || {}),
      [mapping.targetFieldKey]: valueForCustomField(sourceValue, field.type),
    },
  }
}

function valueForCustomField(value: unknown, type?: string) {
  if (type === 'number') {
    const numberValue = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(numberValue) ? numberValue : ''
  }

  if (type === 'toggle') return value === true || value === 'true' || value === '1'
  if (type === 'rich-text') return plainTextToHtml(String(value))
  if (Array.isArray(value)) return value.join(', ')

  return String(value)
}

function valueForCoreLink(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(', ')
  return String(value).trim()
}

function plainTextToHtml(value: string) {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function hubImportErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return message.startsWith('Mapped ') ? message : 'Import failed'
}

async function getNextDisplayOrder(siteId: string) {
  const [row] = await db.select({ displayOrder: directories.displayOrder })
    .from(directories)
    .where(eq(directories.siteId, siteId))
    .orderBy(desc(directories.displayOrder))
    .limit(1)

  return row ? row.displayOrder + 1 : 1
}

async function createUniqueSlug(siteId: string, title: string) {
  const baseSlug = generateSlug(title) || 'directory'
  let slug = baseSlug
  let suffix = 2

  while (await slugExists(siteId, slug)) {
    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }

  return slug
}

async function slugExists(siteId: string, slug: string) {
  const [row] = await db.select({ id: directories.id })
    .from(directories)
    .where(and(eq(directories.siteId, siteId), eq(directories.slug, slug)))
    .limit(1)

  return Boolean(row)
}

function normalizeRecord(value: unknown) {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as GoogleMapsImportRecord
    : {}

  return {
    placeId: cleanText(record.google_maps_place_id, 255),
    title: cleanText(record.businessName, 255) || cleanText(record.title, 255),
    description: cleanText(record.description, 2000),
    featuredImage: safeUrl(record.featuredImage),
  }
}

async function importFeaturedImageToHub(
  sourceUrl: string | null,
  scope: { siteId: string; userId: string; altText: string }
) {
  if (!sourceUrl) return null

  const sourceHash = createHash('sha1').update(sourceUrl).digest('hex')
  const existingImport = await findImportedFeaturedImage(scope, sourceHash)
  if (existingImport) return existingImport

  try {
    const image = await downloadRemoteImage(sourceUrl)
    const extension = extensionForImageMimeType(image.mimeType)
    const storagePath = `${scope.userId}/imports/google-maps/${sourceHash}.${extension}`
    const existingStorage = await findMediaByStoragePath(scope, storagePath)
    if (existingStorage) return existingStorage

    const publicUrl = await uploadToR2(storagePath, image.data, image.mimeType)
    const filename = `${sourceHash}.${extension}`
    const originalName = `${cleanFilenameBase(scope.altText || 'google-maps-image')}.${extension}`

    try {
      const [row] = await db.insert(media)
        .values({
          userId: scope.userId,
          siteId: scope.siteId,
          filename,
          originalName,
          altText: cleanText(scope.altText, 500),
          fileSize: image.data.length,
          mimeType: image.mimeType,
          fileType: 'image',
          storagePath,
          publicUrl,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ publicUrl: media.publicUrl })

      return row?.publicUrl || publicUrl
    } catch (error) {
      await deleteFromR2(storagePath).catch(() => {})
      throw error
    }
  } catch {
    return null
  }
}

async function findImportedFeaturedImage(scope: { siteId: string; userId: string }, sourceHash: string) {
  const storagePaths = REMOTE_IMAGE_EXTENSIONS.map((extension) => `${scope.userId}/imports/google-maps/${sourceHash}.${extension}`)
  const [row] = await db.select({ publicUrl: media.publicUrl })
    .from(media)
    .where(and(eq(media.userId, scope.userId), eq(media.siteId, scope.siteId), inArray(media.storagePath, storagePaths)))
    .limit(1)

  return row?.publicUrl || null
}

async function findMediaByStoragePath(scope: { siteId: string; userId: string }, storagePath: string) {
  const [row] = await db.select({ publicUrl: media.publicUrl })
    .from(media)
    .where(and(eq(media.userId, scope.userId), eq(media.siteId, scope.siteId), eq(media.storagePath, storagePath)))
    .limit(1)

  return row?.publicUrl || null
}

async function downloadRemoteImage(sourceUrl: string) {
  const url = new URL(sourceUrl)
  const pinnedAddress = await assertPublicRemoteUrl(url)
  const image = await requestPinnedRemoteImage(url, pinnedAddress)
  validateImageContent(image.mimeType, image.data)

  return image
}

async function assertPublicRemoteUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid image URL')
  }

  const hostname = remoteHostname(url)
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || isPrivateAddress(hostname)) {
    throw new Error('Invalid image host')
  }

  const addresses = await lookup(hostname, { all: true })
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Invalid image host')
  }

  const address = addresses.find((item) => item.family === 4) || addresses[0]
  return {
    address: address.address,
    family: address.family === 6 ? 6 : 4,
  } satisfies PublicAddress
}

async function requestPinnedRemoteImage(url: URL, pinnedAddress: PublicAddress) {
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest
  const hostname = remoteHostname(url)

  return new Promise<{ data: Buffer; mimeType: string }>((resolve, reject) => {
    const req = request({
      protocol: url.protocol,
      hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: { Accept: 'image/jpeg,image/png,image/gif,image/webp' },
      servername: isIP(hostname) ? undefined : hostname,
      lookup: (_hostname, options, callback) => {
        if (options.all) {
          callback(null, [pinnedAddress])
          return
        }

        callback(null, pinnedAddress.address, pinnedAddress.family)
      },
    }, (res) => {
      if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
        res.resume()
        reject(new Error('Image download failed'))
        return
      }

      const mimeType = normalizedContentType(res.headers)
      if (!REMOTE_IMAGE_TYPES.has(mimeType)) {
        res.resume()
        reject(new Error('Unsupported image type'))
        return
      }

      const contentLength = Number(headerValue(res.headers['content-length']) || 0)
      if (contentLength > REMOTE_IMAGE_MAX_BYTES) {
        res.resume()
        reject(new Error('Image is too large'))
        return
      }

      const chunks: Buffer[] = []
      let totalBytes = 0

      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.byteLength
        if (totalBytes > REMOTE_IMAGE_MAX_BYTES) {
          req.destroy(new Error('Image is too large'))
          return
        }

        chunks.push(Buffer.from(chunk))
      })

      res.on('end', () => {
        resolve({ data: Buffer.concat(chunks, totalBytes), mimeType })
      })
      res.on('error', reject)
    })

    req.setTimeout(10_000, () => {
      req.destroy(new Error('Image download timed out'))
    })
    req.on('error', reject)
    req.end()
  })
}

function remoteHostname(url: URL) {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

function normalizedContentType(headers: IncomingHttpHeaders) {
  return headerValue(headers['content-type'])?.split(';')[0]?.trim().toLowerCase() || ''
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function validateImageContent(mimeType: string, data: Buffer) {
  const valid =
    ((mimeType === 'image/jpeg' || mimeType === 'image/jpg') && hasPrefix(data, [0xff, 0xd8, 0xff])) ||
    (mimeType === 'image/png' && hasPrefix(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (mimeType === 'image/gif' && (hasAscii(data, 0, 'GIF87a') || hasAscii(data, 0, 'GIF89a'))) ||
    (mimeType === 'image/webp' && hasAscii(data, 0, 'RIFF') && hasAscii(data, 8, 'WEBP'))

  if (!valid) {
    throw new Error('File content does not match the selected media type')
  }
}

function hasPrefix(data: Buffer, prefix: number[]) {
  return data.length >= prefix.length && prefix.every((byte, index) => data[index] === byte)
}

function hasAscii(data: Buffer, offset: number, value: string) {
  if (data.length < offset + value.length) return false
  return Array.from(value).every((character, index) => data[offset + index] === character.charCodeAt(0))
}

function extensionForImageMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

function cleanFilenameBase(value: string) {
  return value
    .trim()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9.-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120) || 'google-maps-image'
}

function isPrivateAddress(address: string) {
  const ipVersion = isIP(address)
  if (ipVersion === 4) return isPrivateIpv4(address)
  if (ipVersion === 6) return isPrivateIpv6(address)
  return false
}

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true

  const [a, b, c] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase()
  const mappedIpv4 = normalized.match(/(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1] || ''
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4)

  if (normalized === '::' || normalized === '::1') return true
  if (/^(?:0+:){7}(?:0+|1)$/.test(normalized)) return true

  const firstSegment = normalized.split(':')[0]
  const firstValue = Number.parseInt(firstSegment, 16)
  if (!Number.isFinite(firstValue)) return false

  return (
    (firstValue & 0xfe00) === 0xfc00 ||
    (firstValue & 0xffc0) === 0xfe80 ||
    (firstValue & 0xff00) === 0xff00 ||
    normalized.startsWith('2001:db8:')
  )
}

function cleanContentBlocks(existingBlocks: unknown) {
  const blocks = existingBlocks && typeof existingBlocks === 'object' && !Array.isArray(existingBlocks)
    ? { ...(existingBlocks as Record<string, any>) }
    : {}

  delete blocks._googleMaps
  delete blocks._settings

  return blocks
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : null
}

function safeUrl(value: unknown) {
  const textValue = cleanText(value, 2000)
  if (!textValue) return null

  try {
    const url = new URL(textValue)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}
