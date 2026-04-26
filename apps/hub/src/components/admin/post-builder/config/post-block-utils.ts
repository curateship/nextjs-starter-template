import type { PostBlock } from "@/lib/actions/posts/post-actions"
import { getPostLayoutColumn, normalizePostBlockContent } from "@/lib/actions/posts/post-layout"

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
