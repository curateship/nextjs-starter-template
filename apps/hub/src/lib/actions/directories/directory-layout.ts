export type DirectoryLayoutColumn = 'main' | 'sidebar'

interface DirectoryLayoutBlockLike {
  type: string
  content: Record<string, any>
}

export function getDirectoryLayoutColumn(type: string, content?: Record<string, any> | null): DirectoryLayoutColumn
export function getDirectoryLayoutColumn(block: DirectoryLayoutBlockLike): DirectoryLayoutColumn
export function getDirectoryLayoutColumn(
  blockOrType: DirectoryLayoutBlockLike | string,
  content?: Record<string, any> | null
): DirectoryLayoutColumn {
  const block = typeof blockOrType === 'string'
    ? { type: blockOrType, content: content ?? {} }
    : blockOrType

  if (block.type === 'directory-content') {
    return 'main'
  }

  return block.content?.layoutColumn === 'sidebar' ? 'sidebar' : 'main'
}

export function normalizeDirectoryBlockContent(type: string, content?: Record<string, any> | null): Record<string, any> {
  const nextContent = content && typeof content === 'object' ? content : {}
  const layoutColumn = getDirectoryLayoutColumn(type, nextContent)

  if (nextContent.layoutColumn === layoutColumn) {
    return nextContent
  }

  return {
    ...nextContent,
    layoutColumn,
  }
}
