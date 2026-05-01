import { convertContentBlocksToArray } from "@/lib/utils/block-utils"
import { normalizeProductLeadMagnetContent } from "@/lib/products/lead-magnet"
import { getBlockName, PRODUCT_BLOCK_TYPES } from "./product-block-types"

export interface ProductBuilderBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
  display_order?: number
}

const SUPPORTED_PRODUCT_BLOCK_TYPES = PRODUCT_BLOCK_TYPES.map((blockType) => blockType.type)

function normalizeProductBlockContent(type: string, content?: Record<string, any> | null): Record<string, any> {
  if (type === "product-lead-magnet") {
    return normalizeProductLeadMagnetContent(content)
  }

  return content && typeof content === "object" ? content : {}
}

export function parseProductBlocksFromJson(contentBlocks: Record<string, any>): ProductBuilderBlock[] {
  return convertContentBlocksToArray(contentBlocks || {}, "", SUPPORTED_PRODUCT_BLOCK_TYPES)
    .map((block) => ({
      id: block.id,
      type: block.type,
      title: getBlockName(block.type),
      content: normalizeProductBlockContent(block.type, block.content),
      display_order: block.display_order,
    }))
    .sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0))
}

export function productBlocksToJson(
  blocks: ProductBuilderBlock[],
  existingContentBlocks: Record<string, any> = {}
): Record<string, any> {
  const preservedSettings: Record<string, any> = {}

  Object.entries(existingContentBlocks || {}).forEach(([key, value]) => {
    if (typeof value !== "object" || value === null) {
      preservedSettings[key] = value
    } else if (key.startsWith("_")) {
      preservedSettings[key] = value
    }
  })

  const jsonBlocks: Record<string, any> = {}
  blocks.forEach((block, index) => {
    jsonBlocks[block.id] = {
      id: block.id,
      type: block.type,
      content: normalizeProductBlockContent(block.type, block.content),
      display_order: index,
    }
  })

  return {
    ...preservedSettings,
    ...jsonBlocks,
  }
}
