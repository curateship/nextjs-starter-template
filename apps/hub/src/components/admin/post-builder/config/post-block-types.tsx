import { FileText, Image as ImageIcon, Code, Quote, Minus, Link2 } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/lib/utils/block-types"

export type { BlockTypeDefinition }

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
  },
  {
    type: 'related-posts',
    name: 'Related Posts',
    icon: Link2,
    description: 'Display other posts from this site',
    defaultContent: {
      title: 'Related Posts',
      subtitle: '',
      displayMode: 'grid',
      columns: 3,
      itemsToShow: 3,
      sortBy: 'date',
      sortOrder: 'desc',
      showImage: true,
      showTitle: true,
      showExcerpt: true
    }
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(POST_BLOCK_TYPES, type)
}

export function getBlockIcon(type: string) {
  return _getBlockIcon(POST_BLOCK_TYPES, type, FileText)
}

export function getBlockName(type: string): string {
  return _getBlockName(POST_BLOCK_TYPES, type)
}
