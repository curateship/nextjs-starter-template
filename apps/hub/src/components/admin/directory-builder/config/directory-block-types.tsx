import { FileText } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/components/admin/shared/block-types"

export type { BlockTypeDefinition }

export const DIRECTORY_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'directory-content',
    name: 'Content',
    icon: FileText,
    description: 'Display directory details and information',
    defaultContent: {
      showFeaturedImage: true,
      body: '',
      format: 'html'
    }
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(DIRECTORY_BLOCK_TYPES, type)
}

export function getBlockIcon(type: string) {
  return _getBlockIcon(DIRECTORY_BLOCK_TYPES, type, FileText)
}

export function getBlockName(type: string): string {
  return _getBlockName(DIRECTORY_BLOCK_TYPES, type)
}
