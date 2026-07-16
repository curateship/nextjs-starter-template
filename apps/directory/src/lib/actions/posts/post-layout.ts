export type PostLayoutColumn = 'main' | 'sidebar'

interface PostLayoutBlockLike {
  type: string
  content: Record<string, any>
}

export function getPostLayoutColumn(type: string, content?: Record<string, any> | null): PostLayoutColumn
export function getPostLayoutColumn(block: PostLayoutBlockLike): PostLayoutColumn
export function getPostLayoutColumn(
  blockOrType: PostLayoutBlockLike | string,
  content?: Record<string, any> | null
): PostLayoutColumn {
  const block = typeof blockOrType === 'string'
    ? { type: blockOrType, content: content ?? {} }
    : blockOrType

  return block.content?.layoutColumn === 'sidebar' ? 'sidebar' : 'main'
}

export function normalizePostBlockContent(type: string, content?: Record<string, any> | null): Record<string, any> {
  const nextContent = content && typeof content === 'object' ? content : {}
  const layoutColumn = getPostLayoutColumn(type, nextContent)

  if (nextContent.layoutColumn === layoutColumn) {
    return nextContent
  }

  return {
    ...nextContent,
    layoutColumn,
  }
}
