import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"

/**
 * Generic preview block interface - works with any domain's block format
 */
export interface PreviewBlock {
  id: string
  type: string
  content: Record<string, any>
  display_order?: number
}

interface PreviewSiteInput {
  id: string
  name: string
  subdomain: string
  settings?: {
    favicon?: string
    navigation?: any
    footer?: any
    [key: string]: any
  }
}

export function normalizePreviewBlocks<TBlock extends PreviewBlock>(
  blocks: TBlock[]
): PreviewBlock[] {
  return blocks.map((block, index) => ({
    id: block.id,
    type: block.type,
    content: block.content,
    display_order: typeof block.display_order === "number" ? block.display_order : index,
  }))
}

export function createPreviewEntityBlocks(blocks: PreviewBlock[]) {
  return blocks.map(block => ({
    id: block.id,
    type: block.type,
    content: block.content,
    display_order: block.display_order || 0,
  }))
}

/**
 * Transform admin block format to frontend block format for preview rendering
 * Now using generic structure that works with pages, products, and posts
 */
export function transformAdminBlocksToFrontend(
  blocks: PreviewBlock[]
): SiteWithBlocks['blocks'] {
  // Simple transformation - no complex property mapping needed
  return blocks.map(block => ({
    id: block.id,
    type: block.type,
    content: block.content,
    display_order: block.display_order || 0
  }))
}

/**
 * Create a mock SiteWithBlocks object for preview rendering.
 * Navigation and footer are resolved by the frontend layout from site settings.
 */
export function createPreviewSite(
  blocks: PreviewBlock[],
  site?: PreviewSiteInput
): SiteWithBlocks {
  return {
    id: site?.id || 'preview',
    name: site?.name || 'Preview Site',
    subdomain: site?.subdomain || 'preview',
    custom_domain: null,
    settings: site?.settings || {},
    blocks: transformAdminBlocksToFrontend(blocks)
  }
}
