// Category template inheritance (mirrors directory-template-inheritance.ts):
// templates own block structure + settings, category rows store only values.
// One key difference from directories: category rows keep row-level settings
// (_settings.is_private, show_featured_image) inside content_blocks, so every
// helper here preserves non-block entries from the VALUE side, not the template.

export const CATEGORY_BLANK_TEMPLATE_NAME = 'Blank'
export const CATEGORY_LISTINGS_BLOCK_TYPE = 'category-listings'

// Per-category value keys. The Listings block is fully template-configured
// (the rendered category is injected at runtime), so it has no value keys.
const CATEGORY_VALUE_KEYS: Record<string, string[]> = {
  [CATEGORY_LISTINGS_BLOCK_TYPE]: [],
}

// Template-owned config keys per block type (everything the admin editor sets).
// categoryIds is intentionally absent — it is derived from the rendered category.
const CATEGORY_TEMPLATE_CONTENT_KEYS: Record<string, string[]> = {
  [CATEGORY_LISTINGS_BLOCK_TYPE]: [
    'title',
    'subtitle',
    'headerAlign',
    'mobileHeaderAlign',
    'contentType',
    'listingStyle',
    'imageFit',
    'imageHeight',
    'imageQuality',
    'saveIconOpacity',
    'categoryChipParentIds',
    'displayMode',
    'itemsToShow',
    'mobileColumns',
    'columns',
    'sortBy',
    'sortOrder',
    'isPaginated',
    'itemsPerPage',
    'viewAllText',
    'viewAllLink',
    'visibility',
  ],
}

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

// Row-level settings stored alongside blocks in categories.content_blocks:
// _-prefixed objects (_settings.is_private) and bare scalars (show_featured_image).
// These must survive every prune/merge or private categories silently go public.
export function getCategoryNonBlockEntries(contentBlocks: Record<string, any> = {}) {
  const entries: Record<string, any> = {}

  Object.entries(contentBlocks || {}).forEach(([key, value]) => {
    if (key.startsWith('_') || typeof value !== 'object' || value === null) {
      entries[key] = cloneValue(value)
    }
  })

  return entries
}

function getCategoryBlockValueContent(type: string, content: Record<string, any> = {}) {
  const keys = CATEGORY_VALUE_KEYS[type] || []
  const values: Record<string, any> = {}

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(content, key)) continue
    const value = content[key]
    if (!hasValue(value)) continue
    values[key] = cloneValue(value)
  }

  return values
}

// Strip per-category value keys from template blocks so templates only store structure
export function sanitizeCategoryTemplateBlocks(contentBlocks: Record<string, any> = {}) {
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
    const templateKeys = CATEGORY_TEMPLATE_CONTENT_KEYS[value.type]
    if (!templateKeys) return

    const sanitizedContent: Record<string, any> = {}

    templateKeys.forEach((contentKey) => {
      if (!Object.prototype.hasOwnProperty.call(content, contentKey)) return
      sanitizedContent[contentKey] = cloneValue(content[contentKey])
    })

    sanitizedBlocks[key] = {
      id: typeof value.id === 'string' && value.id ? value.id : key,
      type: value.type,
      ...(typeof value.title === 'string' && value.title ? { title: value.title } : {}),
      ...(typeof value.display_order === 'number' ? { display_order: value.display_order } : {}),
      content: sanitizedContent,
    }
  })

  return sanitizedBlocks
}

// Convert builder blocks to the value-only JSON stored on the category row
export function categoryBlocksToValueJson(blocks: Array<{ id: string; type: string; content: Record<string, any> }>) {
  const jsonBlocks: Record<string, any> = {}

  for (const block of blocks) {
    const content = getCategoryBlockValueContent(block.type, block.content || {})
    if (!Object.keys(content).length) continue

    jsonBlocks[block.id] = {
      id: block.id,
      type: block.type,
      content,
    }
  }

  return jsonBlocks
}

// Drop value entries for blocks no longer in the template, keeping row settings
export function pruneCategoryValueBlocksForTemplate(
  valueBlocks: Record<string, any>,
  templateBlocks: Record<string, any>
) {
  const prunedBlocks: Record<string, any> = getCategoryNonBlockEntries(valueBlocks)

  Object.entries(templateBlocks || {}).forEach(([key, templateBlock]) => {
    if (!isBlockEntry(templateBlock)) return

    const blockId = typeof templateBlock.id === 'string' && templateBlock.id ? templateBlock.id : key
    const valueBlock = valueBlocks?.[blockId] || valueBlocks?.[key]
    if (!valueBlock || typeof valueBlock !== 'object' || Array.isArray(valueBlock)) return

    const content = getCategoryBlockValueContent(templateBlock.type, valueBlock.content || {})
    if (!Object.keys(content).length) return

    prunedBlocks[blockId] = {
      id: blockId,
      type: templateBlock.type,
      content,
    }
  })

  return prunedBlocks
}

// Merge template structure with category values for rendering/editing
export function mergeCategoryTemplateBlocks(
  templateBlocks: Record<string, any>,
  valueBlocks: Record<string, any>
) {
  // Row settings come from the category row (value side), not the template
  const mergedBlocks: Record<string, any> = getCategoryNonBlockEntries(valueBlocks)

  Object.entries(templateBlocks || {}).forEach(([key, value]) => {
    if (!isBlockEntry(value)) return

    const block = cloneValue(value)
    const blockId = typeof block.id === 'string' && block.id ? block.id : key
    const valueBlock = valueBlocks?.[blockId] || valueBlocks?.[key]
    const valueContent = valueBlock && typeof valueBlock === 'object' && !Array.isArray(valueBlock)
      ? getCategoryBlockValueContent(block.type, valueBlock.content || {})
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

// No template-editor preview value helpers are needed (unlike directories):
// the Listings block has no value keys and fetches real site data itself.
