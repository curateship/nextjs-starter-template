import { FileText } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockName as _getBlockName } from "@/lib/utils/block-types"

export type { BlockTypeDefinition }

export const EVENT_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'event-content',
    name: 'Content',
    icon: FileText,
    description: 'Display event details and information',
    defaultContent: {
      body: '',
      format: 'html'
    }
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(EVENT_BLOCK_TYPES, type)
}

export function getBlockName(type: string): string {
  return _getBlockName(EVENT_BLOCK_TYPES, type)
}
