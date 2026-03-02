import { FileText, Image as ImageIcon, Code, Quote, Minus, LucideIcon } from "lucide-react"

export interface BlockTypeDefinition {
  type: string
  name: string
  icon: LucideIcon
  description: string
  defaultContent: Record<string, any>
  conflictsWith?: string[]
}

export const POST_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'post-content',
    name: 'Post Content',
    icon: FileText,
    description: 'Post title, display options, and rich text content',
    defaultContent: {
      showAuthor: true,
      showDate: true,
      body: '<p>Start writing your content here...</p>',
      format: 'html'
    }
  },
  {
    type: 'image',
    name: 'Image Block',
    icon: ImageIcon,
    description: 'Add images with captions and alt text',
    defaultContent: {
      url: '',
      alt: '',
      caption: ''
    }
  },
  {
    type: 'code',
    name: 'Code Block',
    icon: Code,
    description: 'Display code snippets with syntax highlighting',
    defaultContent: {
      code: '',
      language: 'javascript'
    }
  },
  {
    type: 'quote',
    name: 'Quote Block',
    icon: Quote,
    description: 'Highlight quotes or important text',
    defaultContent: {
      text: '',
      author: '',
      citation: ''
    }
  },
  {
    type: 'divider',
    name: 'Divider',
    icon: Minus,
    description: 'Add a visual separator between content sections',
    defaultContent: {
      style: 'solid'
    }
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return POST_BLOCK_TYPES.find(block => block.type === type)
}

export function getBlockIcon(type: string): LucideIcon {
  const definition = getBlockTypeDefinition(type)
  return definition?.icon || FileText
}

export function getBlockName(type: string): string {
  const definition = getBlockTypeDefinition(type)
  return definition?.name || 'Block'
}
