import { FileText, Link2, TableOfContents } from "lucide-react"
import { BlockTypeDefinition, findBlockType, getBlockIcon as _getBlockIcon, getBlockName as _getBlockName } from "@/lib/utils/block-types"

export type { BlockTypeDefinition }

export const POST_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'core',
    name: 'Core',
    icon: FileText,
    description: 'Post title, display options, and rich text content',
    defaultContent: {
      layoutColumn: 'main',
      showFeaturedImage: true,
      showExcerpt: true,
      showAuthor: true,
      showDate: true,
      body: '',
      format: 'html'
    }
  },
  {
    type: 'related-posts',
    name: 'Related Posts',
    icon: Link2,
    description: 'Display other posts from this site',
    defaultContent: {
      layoutColumn: 'main',
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
  },
  {
    type: 'table-of-contents',
    name: 'Table of Contents',
    icon: TableOfContents,
    description: 'Display links to H2 sections in the Core block',
    conflictsWith: ['table-of-contents'],
    defaultContent: {
      layoutColumn: 'sidebar',
      title: 'On this page',
      sticky: true,
      headingLevel: 'h2'
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
