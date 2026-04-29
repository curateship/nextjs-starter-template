import { FileText } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/lib/utils/block-types"

export type { BlockTypeDefinition }

export const ACCOUNT_PAGE_BLOCK_TYPES: BlockTypeDefinition[] = []

const ACCOUNT_PAGE_BUILDER_BLOCK_TYPE_SET = new Set(ACCOUNT_PAGE_BLOCK_TYPES.map(blockType => blockType.type))

export function isAccountPageBuilderBlockType(type: string | null | undefined) {
  return !!type && ACCOUNT_PAGE_BUILDER_BLOCK_TYPE_SET.has(type)
}

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(ACCOUNT_PAGE_BLOCK_TYPES, type)
}

export function getBlockIcon(type: string) {
  return _getBlockIcon(ACCOUNT_PAGE_BLOCK_TYPES, type, FileText)
}

export function getBlockName(type: string): string {
  return _getBlockName(ACCOUNT_PAGE_BLOCK_TYPES, type)
}
