import { FileText } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockName as _getBlockName } from "@/lib/utils/block-types"

export type { BlockTypeDefinition }

export const CATEGORY_BLOCK_TYPES: BlockTypeDefinition[] = []

const CATEGORY_BLOCK_TYPE_SET = new Set(CATEGORY_BLOCK_TYPES.map(blockType => blockType.type))

export function isCategoryBuilderBlockType(type: string | null | undefined) {
  return !!type && CATEGORY_BLOCK_TYPE_SET.has(type)
}

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(CATEGORY_BLOCK_TYPES, type)
}

export function getBlockName(type: string): string {
  return _getBlockName(CATEGORY_BLOCK_TYPES, type)
}
