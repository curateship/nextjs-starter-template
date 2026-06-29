import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { getBlockName, isEventBuilderBlockType } from './event-block-types'

export interface EventEditorBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

// Parse stored template JSON into ordered editor blocks (skips _settings/scalars)
export function parseEventBlocksFromJson(contentBlocks: Record<string, any>): EventEditorBlock[] {
  return convertContentBlocksToArray(contentBlocks || {}, '')
    .filter((block) => isEventBuilderBlockType(block.type))
    .map((block) => ({
      id: block.id,
      type: block.type,
      title: getBlockName(block.type),
      content: block.content,
    }))
}

// Serialize editor blocks back to JSON, preserving _-prefixed and scalar
// entries from the existing JSON (row settings like _settings.is_private)
export function eventBlocksToJson(
  blocks: EventEditorBlock[],
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
    .filter((block) => isEventBuilderBlockType(block.type))
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
