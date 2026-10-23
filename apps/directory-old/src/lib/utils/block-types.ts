/**
 * Shared BlockTypeDefinition interface used by all builder block-type configs.
 * Each builder defines its own BLOCK_TYPES array using this interface.
 */
import type { LucideIcon } from "lucide-react"

export interface BlockTypeDefinition {
  type: string
  name: string
  icon: LucideIcon
  description: string
  defaultContent: Record<string, any>
  conflictsWith?: string[]
}

/** Look up a block type definition from an array by type string */
export function findBlockType(blockTypes: BlockTypeDefinition[], type: string): BlockTypeDefinition | undefined {
  return blockTypes.find(block => block.type === type)
}

/** Get the icon for a block type, with a fallback */
export function getBlockIcon(blockTypes: BlockTypeDefinition[], type: string, fallback: LucideIcon): LucideIcon {
  return findBlockType(blockTypes, type)?.icon || fallback
}

/** Get the display name for a block type */
export function getBlockName(blockTypes: BlockTypeDefinition[], type: string, fallback = 'Block'): string {
  return findBlockType(blockTypes, type)?.name || fallback
}
