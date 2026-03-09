import { FileText, LucideIcon } from "lucide-react"

export interface BlockTypeDefinition {
  type: string
  name: string
  icon: LucideIcon
  description: string
  defaultContent: Record<string, any>
  conflictsWith?: string[]
}

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
  return DIRECTORY_BLOCK_TYPES.find(block => block.type === type)
}

export function getBlockIcon(type: string): LucideIcon {
  const definition = getBlockTypeDefinition(type)
  return definition?.icon || FileText
}

export function getBlockName(type: string): string {
  const definition = getBlockTypeDefinition(type)
  return definition?.name || 'Block'
}
