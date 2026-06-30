// Event template inheritance (mirrors category-template-inheritance.ts):
// templates own block structure + settings, event rows store only values.
// Like categories, event rows keep row-level settings (_settings.is_private,
// show_featured_image) inside content_blocks, so every helper here preserves
// non-block entries from the VALUE side, not the template.

import { sanitizeExternalHttpUrl } from '@/lib/utils/url-validator'

export const EVENT_BLANK_TEMPLATE_NAME = 'Blank'
export const EVENT_CONTENT_BLOCK_TYPE = 'event-content'

// Per-event value keys. The rich text body/format and event date/time are
// edited per event; the title/featured image are event row fields.
const EVENT_VALUE_KEYS: Record<string, string[]> = {
  [EVENT_CONTENT_BLOCK_TYPE]: ['body', 'format', 'eventDate', 'eventTime', 'externalCtaUrl'],
}

// Template-owned config keys per block type (everything the template editor sets).
const EVENT_TEMPLATE_CONTENT_KEYS: Record<string, string[]> = {
  [EVENT_CONTENT_BLOCK_TYPE]: ['eventContentStyle', 'styleConfig', 'visibility'],
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

// Row-level settings stored alongside blocks in events.content_blocks:
// _-prefixed objects (_settings.is_private) and bare scalars (show_featured_image).
// These must survive every prune/merge or private events silently go public.
export function getEventNonBlockEntries(contentBlocks: Record<string, any> = {}) {
  const entries: Record<string, any> = {}

  Object.entries(contentBlocks || {}).forEach(([key, value]) => {
    if (key.startsWith('_') || typeof value !== 'object' || value === null) {
      entries[key] = cloneValue(value)
    }
  })

  return entries
}

function getEventBlockValueContent(type: string, content: Record<string, any> = {}) {
  const keys = EVENT_VALUE_KEYS[type] || []
  const values: Record<string, any> = {}

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(content, key)) continue
    const value = content[key]
    if (!hasValue(value)) continue
    if (key === 'externalCtaUrl') {
      const externalCtaUrl = sanitizeExternalHttpUrl(String(value))
      if (!externalCtaUrl) continue
      values[key] = externalCtaUrl
      continue
    }
    values[key] = cloneValue(value)
  }

  return values
}

// Strip per-event value keys from template blocks so templates only store structure
export function sanitizeEventTemplateBlocks(contentBlocks: Record<string, any> = {}) {
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
    const templateKeys = EVENT_TEMPLATE_CONTENT_KEYS[value.type]
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

// Convert builder blocks to the value-only JSON stored on the event row
export function eventBlocksToValueJson(blocks: Array<{ id: string; type: string; content: Record<string, any> }>) {
  const jsonBlocks: Record<string, any> = {}

  for (const block of blocks) {
    const content = getEventBlockValueContent(block.type, block.content || {})
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
export function pruneEventValueBlocksForTemplate(
  valueBlocks: Record<string, any>,
  templateBlocks: Record<string, any>
) {
  const prunedBlocks: Record<string, any> = getEventNonBlockEntries(valueBlocks)

  Object.entries(templateBlocks || {}).forEach(([key, templateBlock]) => {
    if (!isBlockEntry(templateBlock)) return

    const blockId = typeof templateBlock.id === 'string' && templateBlock.id ? templateBlock.id : key
    const valueBlock = valueBlocks?.[blockId] || valueBlocks?.[key]
    if (!valueBlock || typeof valueBlock !== 'object' || Array.isArray(valueBlock)) return

    const content = getEventBlockValueContent(templateBlock.type, valueBlock.content || {})
    if (!Object.keys(content).length) return

    prunedBlocks[blockId] = {
      id: blockId,
      type: templateBlock.type,
      content,
    }
  })

  return prunedBlocks
}

// Merge template structure with event values for rendering/editing
export function mergeEventTemplateBlocks(
  templateBlocks: Record<string, any>,
  valueBlocks: Record<string, any>
) {
  // Row settings come from the event row (value side), not the template
  const mergedBlocks: Record<string, any> = getEventNonBlockEntries(valueBlocks)

  Object.entries(templateBlocks || {}).forEach(([key, value]) => {
    if (!isBlockEntry(value)) return

    const block = cloneValue(value)
    const blockId = typeof block.id === 'string' && block.id ? block.id : key
    const valueBlock = valueBlocks?.[blockId] || valueBlocks?.[key]
    const valueContent = valueBlock && typeof valueBlock === 'object' && !Array.isArray(valueBlock)
      ? getEventBlockValueContent(block.type, valueBlock.content || {})
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

// Template-editor preview: per-event values are empty in templates, so the
// preview substitutes sample content (mirrors withCategoryTemplatePreviewValues).
const EVENT_TEMPLATE_PREVIEW_RICH_TEXT = `
<p>This is sample event content. Use this block to decide where the event description should appear in the template.</p>
<p>Real text is edited on each event.</p>
`.trim()

export const EVENT_TEMPLATE_PREVIEW_EVENT = {
  title: 'Preview Event',
  featuredImage: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
}

export function withEventTemplatePreviewValues<TBlock extends { type: string; content: Record<string, any> }>(
  blocks: TBlock[]
) {
  return blocks.map((block) => {
    if (block.type !== EVENT_CONTENT_BLOCK_TYPE) return block

    const content = {
      ...(block.content || {}),
      ...(!hasValue(block.content?.eventDate) ? { eventDate: '2026-08-15' } : {}),
      ...(!hasValue(block.content?.eventTime) ? { eventTime: '18:00' } : {}),
      ...(!hasValue(block.content?.externalCtaUrl) ? { externalCtaUrl: 'https://example.com/events/preview-rsvp' } : {}),
      ...(!hasValue(block.content?.body) ? { body: EVENT_TEMPLATE_PREVIEW_RICH_TEXT } : {}),
    }

    return {
      ...block,
      content,
    }
  })
}
