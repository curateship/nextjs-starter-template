import type { DirectoryCustomBlockTemplate } from '@/lib/actions/directories/directory-custom-blocks/types'
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { getBlockName } from './directory-block-types'

export interface DirectoryEditorBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

export function parseDirectoryBlocksFromJson(
  contentBlocks: Record<string, any>,
  customBlockTemplates: DirectoryCustomBlockTemplate[] = []
): DirectoryEditorBlock[] {
  const templateMap = new Map(customBlockTemplates.map((template) => [template.id, template]))

  return convertContentBlocksToArray(contentBlocks || {}, '')
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

      return {
        id: block.id,
        type: block.type,
        title: block.title || getBlockName(block.type),
        content: block.content,
      }
    })
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

  blocks.forEach((block, index) => {
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
