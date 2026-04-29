import type { DirectoryCustomBlockTemplate } from '@/lib/actions/directories/directory-custom-blocks/types'
import { getDirectoryLayoutColumn, normalizeDirectoryBlockContent } from '@/lib/actions/directories/directory-layout'
import {
  DIRECTORY_CORE_BLOCK_TYPE,
  normalizeDirectoryCoreContent,
} from '@/lib/actions/directories/directory-core'
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { getBlockName } from './directory-block-types'

export interface DirectoryEditorBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

function isSupportedDirectoryBlockType(type: string) {
  return type === DIRECTORY_CORE_BLOCK_TYPE || type === 'directory-custom' || type === 'directory-rich-text'
}

export function normalizeDirectoryEditorBlock(block: DirectoryEditorBlock): DirectoryEditorBlock {
  const content = block.type === DIRECTORY_CORE_BLOCK_TYPE
    ? normalizeDirectoryCoreContent(block.content)
    : block.content

  return {
    ...block,
    title: block.type === 'directory-custom' ? block.title : getBlockName(block.type),
    content: normalizeDirectoryBlockContent(block.type, content),
  }
}

export function orderDirectoryEditorBlocks(blocks: DirectoryEditorBlock[]): DirectoryEditorBlock[] {
  const normalizedBlocks = blocks.map(normalizeDirectoryEditorBlock)
  return [
    ...normalizedBlocks.filter((block) => getDirectoryLayoutColumn(block) === 'main'),
    ...normalizedBlocks.filter((block) => getDirectoryLayoutColumn(block) === 'sidebar'),
  ]
}

export function parseDirectoryBlocksFromJson(
  contentBlocks: Record<string, any>,
  customBlockTemplates: DirectoryCustomBlockTemplate[] = []
): DirectoryEditorBlock[] {
  const templateMap = new Map(customBlockTemplates.map((template) => [template.id, template]))

  return orderDirectoryEditorBlocks(
    convertContentBlocksToArray(contentBlocks || {}, '')
      .map((block) => {
        if (block.type === 'directory-custom') {
          const templateId = block.content?.templateId
          const template = typeof templateId === 'string' ? templateMap.get(templateId) : undefined

          return {
            id: block.id,
            type: block.type,
            title: template?.name || block.title || 'Custom Block',
            content: block.content,
          }
        }

        if (!isSupportedDirectoryBlockType(block.type)) {
          return null
        }

        return {
          id: block.id,
          type: block.type,
          title: block.title || getBlockName(block.type),
          content: block.type === DIRECTORY_CORE_BLOCK_TYPE
            ? normalizeDirectoryCoreContent(block.content)
            : block.content,
        }
      })
      .filter((block): block is DirectoryEditorBlock => Boolean(block))
  )
}

export function directoryBlocksToJson(
  blocks: DirectoryEditorBlock[],
  existingContentBlocks: Record<string, any> = {}
): Record<string, any> {
  const preservedSettings: Record<string, any> = {}

  Object.entries(existingContentBlocks).forEach(([key, value]) => {
    if (typeof value !== 'object' || value === null) {
      preservedSettings[key] = value
    } else if (key.startsWith('_')) {
      preservedSettings[key] = value
    }
  })

  const jsonBlocks: Record<string, any> = {}

  const orderedBlocks = orderDirectoryEditorBlocks(blocks)

  orderedBlocks
    .filter((block) => isSupportedDirectoryBlockType(block.type))
    .forEach((block, index) => {
      jsonBlocks[block.id] = {
        id: block.id,
        type: block.type,
        content: block.content,
        display_order: index,
        ...(block.title ? { title: block.title } : {}),
      }
    })

  return {
    ...preservedSettings,
    ...jsonBlocks,
  }
}
