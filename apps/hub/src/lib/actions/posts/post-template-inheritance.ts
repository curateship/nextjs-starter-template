// Post template inheritance:
// templates own block structure + settings, post rows store only post values.

export const POST_BLANK_TEMPLATE_NAME = 'Blank'
export const POST_CORE_BLOCK_TYPE = 'core'
export const POST_RELATED_BLOCK_TYPE = 'related-posts'
export const POST_TABLE_OF_CONTENTS_BLOCK_TYPE = 'table-of-contents'

const POST_VALUE_KEYS: Record<string, string[]> = {
  [POST_CORE_BLOCK_TYPE]: ['body', 'text', 'format'],
  [POST_RELATED_BLOCK_TYPE]: [],
  [POST_TABLE_OF_CONTENTS_BLOCK_TYPE]: [],
}

const POST_TEMPLATE_CONTENT_KEYS: Record<string, string[]> = {
  [POST_CORE_BLOCK_TYPE]: ['layoutColumn', 'coreStyle', 'styleConfig', 'visibility'],
  [POST_RELATED_BLOCK_TYPE]: [
    'layoutColumn',
    'title',
    'subtitle',
    'displayMode',
    'columns',
    'itemsToShow',
    'sortBy',
    'sortOrder',
    'visibility',
  ],
  [POST_TABLE_OF_CONTENTS_BLOCK_TYPE]: ['layoutColumn', 'title', 'sticky', 'headingLevel', 'visibility'],
}

const POST_TEMPLATE_PREVIEW_BODY = `
<h2>Sample section</h2>
<p>This is sample post content. Use this block to decide how articles should appear in the template.</p>
<p>Real article text is edited on each post.</p>
`.trim()

export const POST_TEMPLATE_PREVIEW_POST = {
  title: 'Preview Post',
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

export function getPostNonBlockEntries(contentBlocks: Record<string, any> = {}) {
  const entries: Record<string, any> = {}

  Object.entries(contentBlocks || {}).forEach(([key, value]) => {
    if (key.startsWith('_') || !isBlockEntry(value)) {
      entries[key] = cloneValue(value)
    }
  })

  return entries
}

function getPostBlockValueContent(type: string, content: Record<string, any> = {}) {
  const keys = POST_VALUE_KEYS[type] || []
  const values: Record<string, any> = {}

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(content, key)) continue
    const value = content[key]
    if (!hasValue(value)) continue
    values[key] = cloneValue(value)
  }

  return values
}

export function sanitizePostTemplateBlocks(contentBlocks: Record<string, any> = {}) {
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
    const templateKeys = POST_TEMPLATE_CONTENT_KEYS[value.type]
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

export function postBlocksToValueJson(blocks: Array<{ id: string; type: string; content: Record<string, any>; display_order?: number }>) {
  const jsonBlocks: Record<string, any> = {}

  for (const block of blocks) {
    const content = getPostBlockValueContent(block.type, block.content || {})
    if (!Object.keys(content).length) continue

    jsonBlocks[block.id] = {
      id: block.id,
      type: block.type,
      content,
    }
  }

  return jsonBlocks
}

export function prunePostValueBlocksForTemplate(
  valueBlocks: Record<string, any>,
  templateBlocks: Record<string, any>
) {
  const prunedBlocks: Record<string, any> = getPostNonBlockEntries(valueBlocks)

  Object.entries(templateBlocks || {}).forEach(([key, templateBlock]) => {
    if (!isBlockEntry(templateBlock)) return

    const blockId = typeof templateBlock.id === 'string' && templateBlock.id ? templateBlock.id : key
    const valueBlock = valueBlocks?.[blockId] || valueBlocks?.[key]
    if (!valueBlock || typeof valueBlock !== 'object' || Array.isArray(valueBlock)) return

    const content = getPostBlockValueContent(templateBlock.type, valueBlock.content || {})
    if (!Object.keys(content).length) return

    prunedBlocks[blockId] = {
      id: blockId,
      type: templateBlock.type,
      content,
    }
  })

  return prunedBlocks
}

export function mergePostTemplateBlocks(
  templateBlocks: Record<string, any>,
  valueBlocks: Record<string, any>
) {
  const mergedBlocks: Record<string, any> = getPostNonBlockEntries(valueBlocks)

  Object.entries(templateBlocks || {}).forEach(([key, value]) => {
    if (!isBlockEntry(value)) return

    const block = cloneValue(value)
    const blockId = typeof block.id === 'string' && block.id ? block.id : key
    const valueBlock = valueBlocks?.[blockId] || valueBlocks?.[key]
    const valueContent = valueBlock && typeof valueBlock === 'object' && !Array.isArray(valueBlock)
      ? getPostBlockValueContent(block.type, valueBlock.content || {})
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

export function withPostTemplatePreviewValues<TBlock extends { type: string; content: Record<string, any> }>(
  blocks: TBlock[]
) {
  return blocks.map((block) => {
    if (block.type !== POST_CORE_BLOCK_TYPE || hasValue(block.content?.body) || hasValue(block.content?.text)) {
      return block
    }

    return {
      ...block,
      content: {
        ...(block.content || {}),
        body: POST_TEMPLATE_PREVIEW_BODY,
        format: 'html',
      },
    }
  })
}
