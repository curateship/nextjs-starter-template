/**
 * Utility functions for taxonomy content blocks
 */

interface TaxonomyBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

/**
 * Convert JSON content_blocks to array of blocks for the builder
 */
function convertJsonToBlocks(contentBlocks: Record<string, any>): TaxonomyBlock[] {
  const blocks: TaxonomyBlock[] = []

  // Filter out _settings and other meta keys
  const blockEntries = Object.entries(contentBlocks).filter(
    ([key]) => !key.startsWith('_')
  )

  // Sort by display_order if available
  blockEntries.sort((a, b) => {
    const orderA = a[1]?.display_order ?? 999
    const orderB = b[1]?.display_order ?? 999
    return orderA - orderB
  })

  blockEntries.forEach(([blockType, blockData]: [string, any]) => {
    // Generate a unique ID for the block
    const blockId = `${blockType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    // Create a clean copy of block data without display_order
    const { display_order, ...content } = blockData

    // Map block type to human-readable title
    const title = getBlockTitle(blockType)

    blocks.push({
      id: blockId,
      type: blockType,
      title,
      content
    })
  })

  return blocks
}

/**
 * Get human-readable title for block type
 */
function getBlockTitle(blockType: string): string {
  const titleMap: Record<string, string> = {
    'taxonomy-default': 'Taxonomy Information',
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

export const taxonomyBlockUtils = {
  convertJsonToBlocks,
  getBlockTitle,
  getDefaultBlockContent,
  validateBlockContent
}
