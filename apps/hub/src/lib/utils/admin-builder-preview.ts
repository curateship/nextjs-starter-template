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
 * Create a mock SiteWithBlocks object for preview rendering with navigation and footer from site settings
 * @param blocks - The blocks to preview
 * @param site - The site object with settings
 * @param navigationType - Type of navigation to use: 'public_pages' (default) or 'user_pages'
 */
export function createPreviewSite(
  blocks: PreviewBlock[],
  site?: { id: string; name: string; subdomain: string; settings?: { favicon?: string; navigation?: any; footer?: any; [key: string]: any } },
  navigationType: 'public_pages' | 'user_pages' = 'public_pages'
): SiteWithBlocks {
  // Add navigation and footer from site settings if they exist
  let allBlocks = [...blocks]

  // Get navigation and footer from the appropriate path in settings
  const navSettings = site?.settings?.[navigationType]
  const navigation = navSettings?.navigation
  const footer = navSettings?.footer

  // Add navigation block from site settings if it exists and isn't already in blocks
  if (navigation && !blocks.some(b => b.type === 'navigation')) {
    const navigationBlock: PreviewBlock = {
      id: `${navigationType}-navigation`,
      type: 'navigation',
      content: navigation,
      display_order: -1
    }
    allBlocks.unshift(navigationBlock)
  }

  // Add footer block from site settings if it exists and isn't already in blocks
  if (footer && !blocks.some(b => b.type === 'footer')) {
    const footerBlock: PreviewBlock = {
      id: `${navigationType}-footer`,
      type: 'footer',
      content: footer,
      display_order: 999
    }
    allBlocks.push(footerBlock)
  }

  // Sort all blocks by display_order
  allBlocks.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))

  return {
    id: site?.id || 'preview',
    name: site?.name || 'Preview Site',
    subdomain: site?.subdomain || 'preview',
    custom_domain: null,
    settings: site?.settings || {},
    blocks: transformAdminBlocksToFrontend(allBlocks)
  }
}