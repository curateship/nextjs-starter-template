import { BadgeInfo, FileText } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/lib/utils/block-types"
import { DIRECTORY_CORE_BLOCK_TYPE } from "@/lib/actions/directories/directory-core"

export type { BlockTypeDefinition }

export const DIRECTORY_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: DIRECTORY_CORE_BLOCK_TYPE,
    name: 'Core',
    icon: BadgeInfo,
    description: 'Compact directory profile with social and action links',
    defaultContent: {
      layoutColumn: 'main',
      sticky: false,
      socialLinks: [],
      menuLinks: [],
      visibility: {},
    },
    conflictsWith: [DIRECTORY_CORE_BLOCK_TYPE],
  },
  {
    type: 'directory-rich-text',
    name: 'Rich Text Editor',
    icon: FileText,
    description: 'Add formatted text content with links and media',
    defaultContent: {
      body: '',
      format: 'html',
      layoutColumn: 'main',
      visibility: {},
    },
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(DIRECTORY_BLOCK_TYPES, type)
}

export function getBlockIcon(type: string) {
  return _getBlockIcon(DIRECTORY_BLOCK_TYPES, type, BadgeInfo)
}

export function getBlockName(type: string): string {
  return _getBlockName(DIRECTORY_BLOCK_TYPES, type)
}
