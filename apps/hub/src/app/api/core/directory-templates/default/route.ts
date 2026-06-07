import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { directoryCustomBlocks } from '@/lib/db/schema/directory-custom-blocks'
import { directoryTemplates } from '@/lib/db/schema/directory-templates'
import { isAuthorizedCoreBridgeRequest, isCoreBridgeSiteAllowed } from '@/lib/utils/core-bridge-auth'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  if (!isAuthorizedCoreBridgeRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const siteId = request.nextUrl.searchParams.get('site_id') || ''
  if (!UUID_REGEX.test(siteId)) {
    return NextResponse.json({ error: 'Valid site_id is required' }, { status: 400 })
  }

  if (!isCoreBridgeSiteAllowed(siteId)) {
    return NextResponse.json({ error: 'Site is not allowed for this bridge' }, { status: 403 })
  }

  const [template] = await db.select({
    id: directoryTemplates.id,
    name: directoryTemplates.name,
    contentBlocks: directoryTemplates.contentBlocks,
  })
    .from(directoryTemplates)
    .where(and(eq(directoryTemplates.siteId, siteId), eq(directoryTemplates.isDefault, true)))
    .orderBy(desc(directoryTemplates.updatedAt))
    .limit(1)

  const contentBlocks = template?.contentBlocks && typeof template.contentBlocks === 'object' && !Array.isArray(template.contentBlocks)
    ? template.contentBlocks as Record<string, any>
    : {}
  const customTemplateIds = Array.from(new Set(Object.values(contentBlocks)
    .map((block) => block?.content?.templateId)
    .filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id))))
  const customTemplates = customTemplateIds.length
    ? await db.select({
        id: directoryCustomBlocks.id,
        name: directoryCustomBlocks.name,
        fields: directoryCustomBlocks.fields,
      })
        .from(directoryCustomBlocks)
        .where(and(eq(directoryCustomBlocks.siteId, siteId), inArray(directoryCustomBlocks.id, customTemplateIds)))
    : []
  const customTemplateMap = new Map(customTemplates.map((item) => [item.id, item]))

  return NextResponse.json({
    template: template ? { id: template.id, name: template.name } : null,
    blocks: Object.values(contentBlocks)
      .filter((block) => block && typeof block === 'object' && !Array.isArray(block))
      .sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0))
      .map((block) => {
        const type = typeof block.type === 'string' ? block.type : ''
        const content = block.content && typeof block.content === 'object' && !Array.isArray(block.content)
          ? block.content as Record<string, any>
          : {}
        const customTemplate = typeof content.templateId === 'string' ? customTemplateMap.get(content.templateId) : undefined

        return {
          id: String(block.id || ''),
          type,
          title: String(block.title || blockName(type, customTemplate?.name)),
          display_order: Number(block.display_order ?? 0),
          layout_column: content.layoutColumn === 'sidebar' ? 'sidebar' : 'main',
          targets: blockTargets(type, customTemplate),
        }
      }),
  })
}

function blockName(type: string, customName?: string) {
  if (customName) return customName
  if (type === 'directory-rich-text') return 'Rich Text Editor'
  if (type === 'directory-google-map') return 'Google Map'
  if (type === 'directory-opening-hours') return 'Opening Hours'
  if (type === 'directory-core') return 'Core'
  return type || 'Block'
}

function blockTargets(type: string, customTemplate?: { fields: unknown }) {
  if (type === 'directory-rich-text') {
    return [{ kind: 'richTextBody', field_key: 'body', label: 'Body', value_type: 'rich-text' }]
  }

  if (type === 'directory-google-map') {
    return [{ kind: 'googleMapLocationQuery', field_key: 'locationQuery', label: 'Location query', value_type: 'text' }]
  }

  if (type === 'directory-opening-hours') {
    return [{ kind: 'openingHoursPlaceId', field_key: 'placeId', label: 'Place ID', value_type: 'text' }]
  }

  if (type === 'directory-core') {
    return coreBlockTargets()
  }

  if (type !== 'directory-custom' || !Array.isArray(customTemplate?.fields)) return []

  return customTemplate.fields
    .filter((field) => {
      return field && typeof field === 'object' && !Array.isArray(field) && (field as { type?: string }).type !== 'repeater'
    })
    .map((field) => {
      const record = field as { key?: string; label?: string; type?: string }
      return {
        kind: 'customField',
        field_key: record.key || '',
        label: record.label || record.key || 'Field',
        value_type: record.type || 'text',
      }
    })
    .filter((field) => field.field_key)
}

function coreBlockTargets() {
  const menuTargets = ['directions', 'phone', 'website', 'email'].map((type) => ({
    kind: 'coreMenuLink',
    field_key: type,
    label: `Menu: ${coreMenuLabel(type)}`,
    value_type: 'text',
  }))
  const socialTargets = ['instagram', 'facebook', 'tiktok', 'twitter', 'linkedin', 'youtube'].map((platform) => ({
    kind: 'coreSocialLink',
    field_key: platform,
    label: `Social: ${socialLabel(platform)}`,
    value_type: 'url',
  }))

  return [...menuTargets, ...socialTargets]
}

function coreMenuLabel(type: string) {
  if (type === 'directions') return 'Directions'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

function socialLabel(platform: string) {
  if (platform === 'tiktok') return 'TikTok'
  if (platform === 'youtube') return 'YouTube'
  if (platform === 'linkedin') return 'LinkedIn'
  if (platform === 'twitter') return 'X/Twitter'
  return platform.charAt(0).toUpperCase() + platform.slice(1)
}
