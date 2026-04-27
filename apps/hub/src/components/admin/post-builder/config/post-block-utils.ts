import type { PostBlock } from "@/lib/actions/posts/post-actions"
import { getPostLayoutColumn, normalizePostBlockContent } from "@/lib/actions/posts/post-layout"
import { convertContentBlocksToArray } from "@/lib/utils/block-utils"

const SUPPORTED_POST_BLOCK_TYPES: PostBlock['type'][] = ['post-content', 'related-posts', 'table-of-contents']

function isSupportedPostBlockType(type: string): type is PostBlock['type'] {
  return SUPPORTED_POST_BLOCK_TYPES.includes(type as PostBlock['type'])
}

export function normalizePostBuilderBlock(block: PostBlock, displayOrder = block.display_order): PostBlock {
  return {
    ...block,
    display_order: displayOrder,
    content: normalizePostBlockContent(block.type, block.content),
  }
}

export function orderPostBuilderBlocks(blocks: PostBlock[]): PostBlock[] {
  const normalizedBlocks = blocks
    .map((block) => normalizePostBuilderBlock(block))
    .sort((a, b) => Number(a.display_order) - Number(b.display_order))

  return groupPostBuilderBlocks(normalizedBlocks)
}

function groupPostBuilderBlocks(blocks: PostBlock[]): PostBlock[] {
  return [
    ...blocks.filter((block) => getPostLayoutColumn(block) === "main"),
    ...blocks.filter((block) => getPostLayoutColumn(block) === "sidebar"),
  ]
}

export function postBuilderBlocksToRecord(blocks: PostBlock[]): Record<string, PostBlock> {
  const nextBlocks: Record<string, PostBlock> = {}

  groupPostBuilderBlocks(blocks).forEach((block, index) => {
    nextBlocks[block.id] = normalizePostBuilderBlock(block, index)
  })

  return nextBlocks
}

export function parsePostBlocksFromJson(contentBlocks: Record<string, any>): PostBlock[] {
  return orderPostBuilderBlocks(
    convertContentBlocksToArray(contentBlocks || {}, '', SUPPORTED_POST_BLOCK_TYPES)
      .filter((block): block is PostBlock => isSupportedPostBlockType(block.type))
      .map((block) => normalizePostBuilderBlock({
        id: block.id,
        type: block.type,
        content: block.content,
        display_order: block.display_order,
      }))
  )
}

export function postBlocksToJson(
  blocks: PostBlock[],
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

  return {
    ...preservedSettings,
    ...postBuilderBlocksToRecord(blocks),
  }
}
