import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { getBlockName, isCategoryBuilderBlockType } from './category-block-types'

export interface CategoryEditorBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

// Parse stored template JSON into ordered editor blocks (skips _settings/scalars)
export function parseCategoryBlocksFromJson(contentBlocks: Record<string, any>): CategoryEditorBlock[] {
  return convertContentBlocksToArray(contentBlocks || {}, '')
    .filter((block) => isCategoryBuilderBlockType(block.type))
    .map((block) => ({
      id: block.id,
      type: block.type,
      title: block.title || getBlockName(block.type),
      content: block.content,
    }))
}

// Serialize editor blocks back to JSON, preserving _-prefixed and scalar
// entries from the existing JSON (row settings like _settings.is_private)
export function categoryBlocksToJson(
  blocks: CategoryEditorBlock[],
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

  blocks
    .filter((block) => isCategoryBuilderBlockType(block.type))
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
