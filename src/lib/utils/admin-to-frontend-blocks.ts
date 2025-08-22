import type { Block } from "@/lib/types/blocks"
import type { SiteWithBlocks } from "@/lib/actions/frontend-actions"

/**
 * Transform admin block format to frontend block format for preview rendering
 * Now using simple unified structure like products
 */
export function transformAdminBlocksToFrontend(
  blocks: Block[],
  site?: { id: string; name: string; subdomain: string }
): SiteWithBlocks['blocks'] {
  // Simple transformation - no complex property mapping needed
  return blocks.map(block => ({
    id: block.id,
    type: block.type,
    content: block.content,
    display_order: block.display_order
  }))
}

/**
 * Create a mock SiteWithBlocks object for preview rendering
 */
export function createPreviewSite(
  blocks: Block[],
  site?: { id: string; name: string; subdomain: string }
): SiteWithBlocks {
  return {
    id: site?.id || 'preview',
    name: site?.name || 'Preview Site',
    subdomain: site?.subdomain || 'preview',
    custom_domain: null,
    theme_id: 'default',
    theme_name: 'Default Theme',
    settings: {},
    blocks: transformAdminBlocksToFrontend(blocks, site)
  }
}