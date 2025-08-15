import type { Block } from "@/lib/actions/page-blocks-actions"
import type { SiteWithBlocks } from "@/lib/actions/frontend-actions"

/**
 * Transform admin block format to frontend block format for preview rendering
 */
export function transformAdminBlocksToFrontend(
  blocks: Block[],
  site?: { id: string; name: string; subdomain: string }
): SiteWithBlocks['blocks'] {
  const frontendBlocks: SiteWithBlocks['blocks'] = {}

  blocks.forEach((block) => {
    if (block.type === 'navigation') {
      frontendBlocks.navigation = {
        logo: block.content.logo || '/images/logo.png',
        links: block.content.links || [],
        buttons: block.content.buttons || [],
        style: block.content.style || {
          backgroundColor: '#ffffff',
          textColor: '#000000'
        }
      }
    } else if (block.type === 'hero') {
      if (!frontendBlocks.hero) {
        frontendBlocks.hero = []
      }
      frontendBlocks.hero.push({
        id: block.id,
        title: block.content.title || 'Welcome to Our Site',
        subtitle: block.content.subtitle || 'Build something amazing',
        primaryButton: typeof block.content.primaryButton === 'object' && block.content.primaryButton?.text 
          ? block.content.primaryButton.text 
          : (block.content.primaryButton || 'Get Started'),
        secondaryButton: typeof block.content.secondaryButton === 'object' && block.content.secondaryButton?.text 
          ? block.content.secondaryButton.text 
          : (block.content.secondaryButton || 'Learn More'),
        primaryButtonLink: typeof block.content.primaryButton === 'object' && block.content.primaryButton?.url 
          ? block.content.primaryButton.url 
          : (block.content.primaryButtonLink || ''),
        secondaryButtonLink: typeof block.content.secondaryButton === 'object' && block.content.secondaryButton?.url 
          ? block.content.secondaryButton.url 
          : (block.content.secondaryButtonLink || ''),
        backgroundColor: block.content.backgroundColor || '#ffffff',
        showRainbowButton: block.content.showRainbowButton || false,
        rainbowButtonText: block.content.rainbowButtonText || 'Get Access to Everything',
        rainbowButtonIcon: block.content.rainbowButtonIcon || 'github',
        githubLink: block.content.githubLink || '',
        showParticles: block.content.showParticles !== false, // default true
        trustedByText: block.content.trustedByText || '',
        trustedByTextColor: block.content.trustedByTextColor || '#6b7280',
        trustedByCount: block.content.trustedByCount || '',
        trustedByAvatars: block.content.trustedByAvatars || [],
        display_order: block.display_order
      })
    } else if (block.type === 'footer') {
      frontendBlocks.footer = {
        logo: block.content.logo || '/images/logo.png',
        copyright: block.content.copyright || '© 2024 Your Company. All rights reserved.',
        links: block.content.links || [],
        socialLinks: block.content.socialLinks || [],
        style: block.content.style || {
          backgroundColor: '#1f2937',
          textColor: '#ffffff'
        }
      }
    } else if (block.type === 'rich-text') {
      if (!frontendBlocks.richText) {
        frontendBlocks.richText = []
      }
      
      // Handle rich text content format
      let richTextContent = {
        title: block.content.title || undefined,
        subtitle: block.content.subtitle || undefined,
        headerAlign: (block.content.headerAlign as 'left' | 'center') || 'left',
        content: block.content.content || ''
      }
      
      frontendBlocks.richText.push({
        ...richTextContent,
        id: block.id,
        display_order: block.display_order
      })
    } else if (block.type === 'faq') {
      if (!frontendBlocks.faq) {
        frontendBlocks.faq = []
      }
      
      frontendBlocks.faq.push({
        id: block.id,
        title: block.content.title || 'Frequently Asked Questions',
        subtitle: block.content.subtitle || 'Discover quick and comprehensive answers to common questions about our platform, services, and features.',
        faqItems: block.content.faqItems || [],
        display_order: block.display_order
      })
    }
  })

  return frontendBlocks
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