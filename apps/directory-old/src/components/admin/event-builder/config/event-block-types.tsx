import FileText from "lucide-react/dist/esm/icons/file-text.js"
import { BlockTypeDefinition, findBlockType, getBlockName as _getBlockName } from "@/lib/utils/block-types"

export type { BlockTypeDefinition }

export const EVENT_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'event-content',
    name: 'Core',
    icon: FileText,
    description: 'Event title, date, time, and rich text content',
    defaultContent: {
      eventContentStyle: 'default',
      body: '',
      format: 'html',
      visibility: {},
    }
  }
]

const EVENT_BLOCK_TYPE_SET = new Set(EVENT_BLOCK_TYPES.map(blockType => blockType.type))

export function isEventBuilderBlockType(type: string | null | undefined) {
  return !!type && EVENT_BLOCK_TYPE_SET.has(type)
}

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(EVENT_BLOCK_TYPES, type)
}

export function getBlockName(type: string): string {
  return _getBlockName(EVENT_BLOCK_TYPES, type)
}
