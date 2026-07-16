export interface TemplateValueTransformArgs {
  content: Record<string, any>
  key: string
  type: string
  value: unknown
}

type TemplateValueTransformResult =
  | { include: true; value: any }
  | { include: false }

export interface TemplateInheritanceConfig {
  getInitialValueEntries?: (valueBlocks: Record<string, any>) => Record<string, any>
  shouldCopyTemplateEntry?: (key: string, value: unknown) => boolean
  templateContentKeys: Record<string, string[]>
  transformValue?: (args: TemplateValueTransformArgs) => TemplateValueTransformResult | undefined
  valueKeys: Record<string, string[]>
}

export function isTemplateBlockEntry(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof (value as any).type === 'string')
}

function cloneTemplateValue<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

export function hasTemplateValue(value: unknown) {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

export function getTemplateNonBlockEntries(
  contentBlocks: Record<string, any> = {},
  shouldPreserveEntry: (key: string, value: unknown) => boolean
) {
  const entries: Record<string, any> = {}

  Object.entries(contentBlocks || {}).forEach(([key, value]) => {
    if (shouldPreserveEntry(key, value)) {
      entries[key] = cloneTemplateValue(value)
    }
  })

  return entries
}

function getTemplateBlockValueContent(
  type: string,
  content: Record<string, any> = {},
  config: Pick<TemplateInheritanceConfig, 'transformValue' | 'valueKeys'>
) {
  const keys = config.valueKeys[type] || []
  const values: Record<string, any> = {}

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(content, key)) continue
    const value = content[key]
    if (!hasTemplateValue(value)) continue

    const transformed = config.transformValue?.({ content, key, type, value })
    if (transformed) {
      if (transformed.include) values[key] = transformed.value
      continue
    }

    values[key] = cloneTemplateValue(value)
  }

  return values
}

export function sanitizeTemplateBlocks(
  contentBlocks: Record<string, any> = {},
  config: Pick<TemplateInheritanceConfig, 'templateContentKeys'>
) {
  const sanitizedBlocks: Record<string, any> = {}

  Object.entries(contentBlocks || {}).forEach(([key, value]) => {
    if (key.startsWith('_')) {
      sanitizedBlocks[key] = cloneTemplateValue(value)
      return
    }

    if (!isTemplateBlockEntry(value)) return

    const content = value.content && typeof value.content === 'object' && !Array.isArray(value.content)
      ? value.content
      : {}
    const templateKeys = config.templateContentKeys[value.type]
    if (!templateKeys) return

    const sanitizedContent: Record<string, any> = {}
    templateKeys.forEach((contentKey) => {
      if (!Object.prototype.hasOwnProperty.call(content, contentKey)) return
      sanitizedContent[contentKey] = cloneTemplateValue(content[contentKey])
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

export function blocksToTemplateValueJson(
  blocks: Array<{ id: string; type: string; content: Record<string, any> }>,
  config: Pick<TemplateInheritanceConfig, 'transformValue' | 'valueKeys'>
) {
  const jsonBlocks: Record<string, any> = {}

  for (const block of blocks) {
    const content = getTemplateBlockValueContent(block.type, block.content || {}, config)
    if (!Object.keys(content).length) continue

    jsonBlocks[block.id] = {
      id: block.id,
      type: block.type,
      content,
    }
  }

  return jsonBlocks
}

export function pruneTemplateValueBlocks(
  valueBlocks: Record<string, any>,
  templateBlocks: Record<string, any>,
  config: Pick<TemplateInheritanceConfig, 'getInitialValueEntries' | 'transformValue' | 'valueKeys'>
) {
  const prunedBlocks: Record<string, any> = config.getInitialValueEntries?.(valueBlocks) ?? {}

  Object.entries(templateBlocks || {}).forEach(([key, templateBlock]) => {
    if (!isTemplateBlockEntry(templateBlock)) return

    const blockId = typeof templateBlock.id === 'string' && templateBlock.id ? templateBlock.id : key
    const valueBlock = valueBlocks?.[blockId] || valueBlocks?.[key]
    if (!valueBlock || typeof valueBlock !== 'object' || Array.isArray(valueBlock)) return

    const content = getTemplateBlockValueContent(templateBlock.type, valueBlock.content || {}, config)
    if (!Object.keys(content).length) return

    prunedBlocks[blockId] = {
      id: blockId,
      type: templateBlock.type,
      content,
    }
  })

  return prunedBlocks
}

export function mergeTemplateBlocks(
  templateBlocks: Record<string, any>,
  valueBlocks: Record<string, any>,
  config: Pick<
    TemplateInheritanceConfig,
    'getInitialValueEntries' | 'shouldCopyTemplateEntry' | 'transformValue' | 'valueKeys'
  >
) {
  const mergedBlocks: Record<string, any> = config.getInitialValueEntries?.(valueBlocks) ?? {}

  Object.entries(templateBlocks || {}).forEach(([key, value]) => {
    if (config.shouldCopyTemplateEntry?.(key, value)) {
      mergedBlocks[key] = cloneTemplateValue(value)
      return
    }

    if (!isTemplateBlockEntry(value)) return

    const block = cloneTemplateValue(value)
    const blockId = typeof block.id === 'string' && block.id ? block.id : key
    const valueBlock = valueBlocks?.[blockId] || valueBlocks?.[key]
    const valueContent = valueBlock && typeof valueBlock === 'object' && !Array.isArray(valueBlock)
      ? getTemplateBlockValueContent(block.type, valueBlock.content || {}, config)
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
