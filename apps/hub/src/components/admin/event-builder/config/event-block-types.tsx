import { FileText } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/lib/utils/block-types"

export type { BlockTypeDefinition }

export const EVENT_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'event-content',
    name: 'Content',
    icon: FileText,
    description: 'Display event details and information',
    defaultContent: {
      showFeaturedImage: true,
      body: '',
      format: 'html'
    }
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(EVENT_BLOCK_TYPES, type)
}

export function getBlockIcon(type: string) {
  return _getBlockIcon(EVENT_BLOCK_TYPES, type, FileText)
}

export function getBlockName(type: string): string {
  return _getBlockName(EVENT_BLOCK_TYPES, type)
}
