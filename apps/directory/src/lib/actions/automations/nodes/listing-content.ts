import { sanitizeRichHtml } from '@/lib/utils/html-sanitizer'

// Block-type identifiers are stable schema strings; kept local so this pure
// mapper does not pull the directory block/UI module graph into unit tests.
// The executor prunes the result against the template before persisting.
const DIRECTORY_CORE_BLOCK_TYPE = 'directory-core'
const DIRECTORY_RICH_TEXT_BLOCK_TYPE = 'directory-rich-text'

export interface ListingExtraction {
  name: string
  address: string
  metaDescription: string
  descriptionHtml: string
}

/** A directory template must have a Core block to hold the listing's address. */
export function hasDirectoryCoreBlock(templateBlocks: Record<string, any>): boolean {
  return Object.values(templateBlocks).some((value) => isRecord(value) && value.type === DIRECTORY_CORE_BLOCK_TYPE)
}

/**
 * Map an AI-extracted listing onto a directory template's value blocks: the
 * geocodable address goes into the required Core block, and any description
 * fills the template's rich-text block (when it has one). Returns raw value
 * blocks keyed by the template's block ids; callers prune against the template.
 */
export function buildAutomationListingContent(templateBlocks: Record<string, any>, listing: ListingExtraction) {
  const coreEntry = Object.entries(templateBlocks).find(
    ([, value]) => isRecord(value) && value.type === DIRECTORY_CORE_BLOCK_TYPE
  )
  if (!coreEntry) throw new Error('Directory template needs a Core block')
  const [coreId, coreBlock] = coreEntry

  const blocks: Record<string, any> = {
    [coreId]: {
      id: coreId,
      type: DIRECTORY_CORE_BLOCK_TYPE,
      display_order: Number((coreBlock as Record<string, any>).display_order ?? 0),
      content: { address: listing.address },
    },
  }

  const richTextEntry = Object.entries(templateBlocks).find(
    ([, value]) => isRecord(value) && value.type === DIRECTORY_RICH_TEXT_BLOCK_TYPE
  )
  if (richTextEntry) {
    const sanitized = sanitizeRichHtml(listing.descriptionHtml)
    if (sanitized.trim()) {
      const [richId, richBlock] = richTextEntry
      blocks[richId] = {
        id: richId,
        type: DIRECTORY_RICH_TEXT_BLOCK_TYPE,
        display_order: Number((richBlock as Record<string, any>).display_order ?? 0),
        content: { body: sanitized, format: 'html' },
      }
    }
  }

  return blocks
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
