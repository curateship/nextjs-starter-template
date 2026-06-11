import { DIRECTORY_CORE_BLOCK_TYPE } from './directory-core'
import { buildDirectoryCustomPreviewValues } from './directory-custom-blocks/utils'
import type { DirectoryCustomBlockTemplate } from './directory-custom-blocks/types'
import { DIRECTORY_GOOGLE_MAP_BLOCK_TYPE } from './directory-google-map'
import { DIRECTORY_OPENING_HOURS_BLOCK_TYPE } from './directory-opening-hours'

export const DIRECTORY_BLANK_TEMPLATE_NAME = 'Blank'
const DIRECTORY_TEMPLATE_DEFAULT_CATEGORY_PARENT_KEY = 'default_category_parent_id'
const DIRECTORY_TEMPLATE_LEGACY_DEFAULT_BREADCRUMB_PARENT_KEY = 'default_breadcrumb_parent_id'
const DIRECTORY_RELATED_LISTING_TEMPLATE_KEYS = ['layoutColumn', 'visibility', 'title', 'subtitle', 'parentCategoryId', 'itemsToShow']

const DIRECTORY_VALUE_KEYS: Record<string, string[]> = {
  [DIRECTORY_CORE_BLOCK_TYPE]: ['address', 'rating', 'menuLinks', 'socialLinks'],
  'directory-custom': ['values'],
  'directory-rich-text': ['body', 'format'],
  'directory-content': ['body', 'format'],
  [DIRECTORY_GOOGLE_MAP_BLOCK_TYPE]: ['locationQuery', 'caption'],
  [DIRECTORY_OPENING_HOURS_BLOCK_TYPE]: ['title', 'sourceMode', 'placeId', 'hoursText'],
  'directory-related-listing': [],
}

const DIRECTORY_TEMPLATE_CONTENT_KEYS: Record<string, string[]> = {
  [DIRECTORY_CORE_BLOCK_TYPE]: [
    'layoutColumn',
    'sticky',
    'claimEnabled',
    'claimButtonText',
    'claimPendingEmailText',
    'claimPendingReviewText',
    'claimApprovedText',
    'ownerEditPath',
    'saveIconOpacity',
    'visibility',
  ],
  'directory-custom': ['layoutColumn', 'visibility', 'templateId'],
  'directory-rich-text': ['layoutColumn', 'visibility'],
  'directory-content': ['layoutColumn', 'visibility'],
  [DIRECTORY_GOOGLE_MAP_BLOCK_TYPE]: ['layoutColumn', 'visibility', 'height'],
  [DIRECTORY_OPENING_HOURS_BLOCK_TYPE]: ['layoutColumn', 'visibility'],
  'directory-related-listing': DIRECTORY_RELATED_LISTING_TEMPLATE_KEYS,
}

const DIRECTORY_TEMPLATE_PREVIEW_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80'

const DIRECTORY_TEMPLATE_PREVIEW_RICH_TEXT = `
<p>This is sample listing content. Use this block to decide where longer directory copy should appear in the template.</p>
<p>Real text is edited on each directory listing.</p>
`.trim()

function isBlockEntry(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof (value as any).type === 'string')
}

function cloneValue<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

function hasValue(value: unknown) {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function getDirectoryTemplateSettings(contentBlocks: Record<string, any> = {}) {
  const settings = contentBlocks._settings
  return settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings as Record<string, any>
    : {}
}

export function getDirectoryTemplateDefaultCategoryParentId(contentBlocks: Record<string, any> = {}) {
  const settings = getDirectoryTemplateSettings(contentBlocks)
  const parentId = settings[DIRECTORY_TEMPLATE_DEFAULT_CATEGORY_PARENT_KEY]
    ?? settings[DIRECTORY_TEMPLATE_LEGACY_DEFAULT_BREADCRUMB_PARENT_KEY]

  return typeof parentId === 'string' && parentId.length > 0 ? parentId : null
}

export function getDirectoryBlockValueContent(type: string, content: Record<string, any> = {}) {
  const keys = DIRECTORY_VALUE_KEYS[type] || []
  const values: Record<string, any> = {}

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(content, key)) continue
    const value = content[key]
    if (!hasValue(value)) continue
    values[key] = cloneValue(value)
  }

  return values
}

export function deriveDirectoryMetaDescriptionFromBlocks(
  blocks: Record<string, any> | Array<{ type?: string; content?: Record<string, any> }>,
  maxLength = 160
) {
  const blockList = Array.isArray(blocks) ? blocks : Object.values(blocks || {})
  const richTextBlock = blockList.find((block: any) =>
    block?.type === 'directory-rich-text' || block?.type === 'directory-content'
  ) as { content?: Record<string, any> } | undefined
  const plainText = (typeof richTextBlock?.content?.body === 'string' ? richTextBlock.content.body : '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return plainText.length > maxLength ? `${plainText.slice(0, maxLength - 3).trim()}...` : plainText
}

export function sanitizeDirectoryTemplateBlocks(contentBlocks: Record<string, any> = {}) {
  const sanitizedBlocks: Record<string, any> = {}

  Object.entries(contentBlocks || {}).forEach(([key, value]) => {
    if (key.startsWith('_')) {
      sanitizedBlocks[key] = cloneValue(value)
      return
    }

    if (!isBlockEntry(value)) return

    const content = value.content && typeof value.content === 'object' && !Array.isArray(value.content)
      ? value.content
      : {}
    const blockType = value.type === 'directory-content' ? 'directory-rich-text' : value.type
    const templateKeys = DIRECTORY_TEMPLATE_CONTENT_KEYS[value.type]
    if (!templateKeys) return

    const sanitizedContent: Record<string, any> = {}

    templateKeys.forEach((contentKey) => {
      if (!Object.prototype.hasOwnProperty.call(content, contentKey)) return
      sanitizedContent[contentKey] = cloneValue(content[contentKey])
    })

    sanitizedBlocks[key] = {
      id: typeof value.id === 'string' && value.id ? value.id : key,
      type: blockType,
      ...(typeof value.title === 'string' && value.title ? { title: value.title } : {}),
      ...(typeof value.display_order === 'number' ? { display_order: value.display_order } : {}),
      content: sanitizedContent,
    }
  })

  return sanitizedBlocks
}

export function directoryBlocksToValueJson(blocks: Array<{ id: string; type: string; content: Record<string, any> }>) {
  const jsonBlocks: Record<string, any> = {}

  for (const block of blocks) {
    const content = getDirectoryBlockValueContent(block.type, block.content || {})
    if (!Object.keys(content).length) continue

    jsonBlocks[block.id] = {
      id: block.id,
      type: block.type,
      content,
    }
  }

  return jsonBlocks
}

export function pruneDirectoryValueBlocksForTemplate(
  valueBlocks: Record<string, any>,
  templateBlocks: Record<string, any>
) {
  const prunedBlocks: Record<string, any> = {}

  Object.entries(templateBlocks || {}).forEach(([key, templateBlock]) => {
    if (!isBlockEntry(templateBlock)) return

    const blockId = typeof templateBlock.id === 'string' && templateBlock.id ? templateBlock.id : key
    const valueBlock = valueBlocks?.[blockId] || valueBlocks?.[key]
    if (!valueBlock || typeof valueBlock !== 'object' || Array.isArray(valueBlock)) return

    const content = getDirectoryBlockValueContent(templateBlock.type, valueBlock.content || {})
    if (!Object.keys(content).length) return

    prunedBlocks[blockId] = {
      id: blockId,
      type: templateBlock.type,
      content,
    }
  })

  return prunedBlocks
}

export function mergeDirectoryTemplateBlocks(
  templateBlocks: Record<string, any>,
  valueBlocks: Record<string, any>
) {
  const mergedBlocks: Record<string, any> = {}

  Object.entries(templateBlocks || {}).forEach(([key, value]) => {
    if (key.startsWith('_')) {
      mergedBlocks[key] = cloneValue(value)
      return
    }

    if (!isBlockEntry(value)) return

    const block = cloneValue(value)
    const blockId = typeof block.id === 'string' && block.id ? block.id : key
    const valueBlock = valueBlocks?.[blockId] || valueBlocks?.[key]
    const valueContent = valueBlock && typeof valueBlock === 'object' && !Array.isArray(valueBlock)
      ? getDirectoryBlockValueContent(block.type, valueBlock.content || {})
      : {}

    mergedBlocks[blockId] = {
      ...block,
      id: blockId,
      content: {
        ...(block.content && typeof block.content === 'object' ? block.content : {}),
        ...valueContent,
      },
    }
  })

  return mergedBlocks
}

export function getDirectoryTemplateCustomBlockIds(contentBlocks: Record<string, any>) {
  return Array.from(new Set(
    Object.values(contentBlocks || {})
      .filter(isBlockEntry)
      .map((block) => block.content?.templateId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  ))
}

export function withDirectoryTemplatePreviewValues<TBlock extends { type: string; content: Record<string, any> }>(
  blocks: TBlock[],
  customBlockTemplates: DirectoryCustomBlockTemplate[] = []
) {
  const customTemplateMap = new Map(customBlockTemplates.map((template) => [template.id, template]))

  return blocks.map((block) => {
    const content = {
      ...(block.content || {}),
      ...getDirectoryTemplatePreviewValueContent(block.type, block.content || {}, customTemplateMap),
    }

    return {
      ...block,
      content,
    }
  })
}

export function getDirectoryTemplatePreviewBreadcrumbs(siteSettings?: { breadcrumbs?: Record<string, boolean> } | null) {
  if (siteSettings?.breadcrumbs?.directories === false) return []

  return [
    { label: 'Directory', href: '/directory' },
    { label: 'Sample Category', href: '/categories/sample-category' },
    { label: 'Preview Directory' },
  ]
}

function getDirectoryTemplatePreviewValueContent(
  type: string,
  content: Record<string, any>,
  customTemplateMap: Map<string, DirectoryCustomBlockTemplate>
) {
  if (type === DIRECTORY_CORE_BLOCK_TYPE) {
    return {
      address: '175 Bloor St E, Toronto, ON',
      rating: 4.6,
      socialLinks: [
        { id: 'preview-instagram', platform: 'instagram', url: 'https://instagram.com/example' },
        { id: 'preview-facebook', platform: 'facebook', url: 'https://facebook.com/example' },
        { id: 'preview-tiktok', platform: 'tiktok', url: 'https://tiktok.com/@example' },
        { id: 'preview-twitter', platform: 'twitter', url: 'https://x.com/example' },
        { id: 'preview-linkedin', platform: 'linkedin', url: 'https://linkedin.com/company/example' },
        { id: 'preview-youtube', platform: 'youtube', url: 'https://youtube.com/@example' },
      ],
      menuLinks: [
        { id: 'preview-directions', type: 'directions', label: 'Get Directions', value: '175 Bloor St E, Toronto, ON', icon: 'map' },
        { id: 'preview-phone', type: 'phone', label: 'Call', value: '+1 416 555 0198', icon: 'phone' },
        { id: 'preview-website', type: 'website', label: 'Website', value: 'https://example.com', icon: 'site' },
        { id: 'preview-email', type: 'email', label: 'Email', value: 'hello@example.com', icon: 'newsletters' },
        { id: 'preview-claim', type: 'claim', label: 'Claim Listing', value: '', icon: 'building' },
      ],
    }
  }

  if (type === 'directory-rich-text' || type === 'directory-content') {
    return {
      body: DIRECTORY_TEMPLATE_PREVIEW_RICH_TEXT,
      format: 'html',
    }
  }

  if (type === DIRECTORY_GOOGLE_MAP_BLOCK_TYPE) {
    return {
      locationQuery: '175 Bloor St E, Toronto, ON',
      caption: 'Sample map caption for this listing.',
    }
  }

  if (type === DIRECTORY_OPENING_HOURS_BLOCK_TYPE) {
    return {
      title: 'Business Hours',
      sourceMode: 'text',
      hoursText: [
        'Monday: 9:00 AM - 6:00 PM',
        'Tuesday: 9:00 AM - 6:00 PM',
        'Wednesday: 9:00 AM - 6:00 PM',
        'Thursday: 9:00 AM - 8:00 PM',
        'Friday: 9:00 AM - 8:00 PM',
        'Saturday: 10:00 AM - 5:00 PM',
        'Sunday: Closed',
      ].join('\n'),
    }
  }

  if (type === 'directory-custom') {
    const templateId = typeof content.templateId === 'string' ? content.templateId : ''
    const template = customTemplateMap.get(templateId)

    return {
      values: template ? buildDirectoryCustomPreviewValues(template.fields) : {},
    }
  }

  return {}
}

export const DIRECTORY_TEMPLATE_PREVIEW_DIRECTORY = {
  title: 'Preview Directory',
  featuredImage: DIRECTORY_TEMPLATE_PREVIEW_IMAGE,
}
