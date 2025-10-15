/**
 * Utility functions for taxonomy content blocks
 */

export interface TaxonomyBlock {
  id: string
  type: string
  content: Record<string, any>
  display_order: number
}

/**
 * Helper function to get block title for taxonomy blocks
 */
export function getTaxonomyBlockTitle(blockType: string): string {
  switch (blockType) {
    case 'taxonomy-default':
      return 'Tag Information'
    default:
      return 'Taxonomy Block'
  }
}

/**
 * Sanitize string content to prevent XSS
 */
function sanitizeString(value: any): string {
  if (typeof value !== 'string') return ''
  // Remove script tags, javascript:, and event handlers
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:text\/html/gi, '')
}

/**
 * Recursively sanitize content object
 */
function sanitizeContent(content: any): any {
  if (typeof content === 'string') {
    return sanitizeString(content)
  }
  if (Array.isArray(content)) {
    return content.map(sanitizeContent)
  }
  if (content && typeof content === 'object') {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(content)) {
      sanitized[key] = sanitizeContent(value)
    }
    return sanitized
  }
  return content
}

/**
 * Convert JSON content_blocks to TaxonomyBlock array format
 */
export function convertContentBlocksToArray(contentBlocks: Record<string, any>, taxonomyId: string): TaxonomyBlock[] {
  const blocks: TaxonomyBlock[] = []

  // SECURITY: Validate taxonomyId to prevent injection
  if (!taxonomyId || typeof taxonomyId !== 'string') {
    return blocks
  }

  if (contentBlocks && typeof contentBlocks === 'object') {
    // SECURITY: Validate allowed block types
    const allowedBlockTypes = ['taxonomy-default']

    Object.entries(contentBlocks).forEach(([blockType, blockData]: [string, any]) => {
      // Skip _settings and other metadata fields
      if (blockType.startsWith('_')) {
        return
      }

      // SECURITY: Validate block type
      if (!allowedBlockTypes.includes(blockType)) {
        return // Skip invalid block types
      }

      if (blockData && typeof blockData === 'object') {
        const { display_order, ...content } = blockData

        // SECURITY: Sanitize all content to prevent XSS
        const sanitizedContent = sanitizeContent(content)

        blocks.push({
          id: `${blockType}-${taxonomyId}`,
          type: blockType,
          content: sanitizedContent,
          display_order: typeof display_order === 'number' ? display_order : 0
        })
      }
    })

    // Sort blocks by display_order
    blocks.sort((a, b) => a.display_order - b.display_order)
  }

  return blocks
}

/**
 * Get human-readable title for block type (for builder UI)
 */
function getBlockTitle(blockType: string): string {
  const titleMap: Record<string, string> = {
    'taxonomy-default': 'Tag Information',
    'taxonomy-hero': 'Hero Section',
    'taxonomy-stats': 'Statistics',
    'rich-text': 'Rich Text',
    'listing-views': 'Content Listings',
    'faq': 'FAQ',
    'gallery': 'Gallery'
  }

  return titleMap[blockType] || blockType
}

/**
 * Get the default content for a new block type
 */
function getDefaultBlockContent(blockType: string): Record<string, any> {
  const defaults: Record<string, Record<string, any>> = {
    'taxonomy-default': {
      viewOnly: true
    },
    'taxonomy-hero': {
      title: 'Taxonomy Hero',
      subtitle: 'Add your subtitle here',
      primaryButton: 'Learn More',
      secondaryButton: 'View All',
      primaryButtonLink: '',
      secondaryButtonLink: '',
      primaryButtonStyle: 'primary',
      secondaryButtonStyle: 'outline',
      backgroundColor: '#ffffff'
    },
    'taxonomy-stats': {
      headerTitle: 'Key Statistics',
      headerSubtitle: 'Important numbers and facts',
      stats: []
    },
    'rich-text': {
      content: '<p>Add your content here...</p>'
    },
    'listing-views': {
      title: 'Related Content',
      subtitle: 'Explore content in this category',
      headerAlign: 'left',
      contentType: 'directory',
      displayMode: 'grid',
      itemsToShow: 6,
      columns: 3,
      sortBy: 'date',
      sortOrder: 'desc',
      showImage: true,
      showTitle: true,
      showDescription: true,
      isPaginated: false,
      itemsPerPage: 12,
      viewAllText: '',
      viewAllLink: '',
      backgroundColor: '#ffffff',
      filterByCurrentTaxonomy: true
    },
    'faq': {
      title: 'Frequently Asked Questions',
      subtitle: 'Common questions about this category',
      faqItems: []
    }
  }

  return defaults[blockType] || {}
}

/**
 * Validate taxonomy block content
 */
function validateBlockContent(blockType: string, content: Record<string, any>): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  switch (blockType) {
    case 'taxonomy-hero':
      if (!content.title) {
        errors.push('Hero block requires a title')
      }
      break

    case 'taxonomy-stats':
      if (!content.stats || !Array.isArray(content.stats)) {
        errors.push('Stats block requires a stats array')
      }
      break

    case 'listing-views':
      if (!content.contentType) {
        errors.push('Listing views block requires a content type')
      }
      break

    case 'rich-text':
      if (!content.content) {
        errors.push('Rich text block requires content')
      }
      break
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}
