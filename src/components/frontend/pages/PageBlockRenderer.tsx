"use client"

import { PageHeroBlock } from "@/components/frontend/pages/PageHeroBlock"
import { PostGridBlock } from "@/components/frontend/posts/PostGridBlock"
import { FaqBlock } from "@/components/frontend/pages/PageFaqBlock"
import { ProductGridBlock } from "@/components/frontend/products/ProductGridBlock"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { RichTextBlock } from "@/components/frontend/pages/PageRichTextBlock"
import { ListingViewsBlock } from "@/components/frontend/pages/PageListingViewBlock"
import { DividerBlock } from "@/components/frontend/pages/PageDividerBlock"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"

interface BlockRendererProps {
  site: SiteWithBlocks
}

export function BlockRenderer({ site }: BlockRendererProps) {
  const { blocks = [] } = site
  
  // Sort blocks by display_order with proper type handling
  const sortedBlocks = blocks.sort((a, b) => {
    const orderA = typeof a.display_order === 'number' ? a.display_order : 0
    const orderB = typeof b.display_order === 'number' ? b.display_order : 0
    return orderA - orderB
  })
  
  // Find navigation and footer blocks for layout
  const navigationBlock = blocks.find(block => block.type === 'navigation')
  const footerBlock = blocks.find(block => block.type === 'footer')
  
  return (
    <SiteLayout 
      navigation={navigationBlock?.content} 
      footer={footerBlock?.content}
      site={site}
    >
      {sortedBlocks.map((block) => {
        // Skip navigation and footer blocks as they're handled by SiteLayout
        if (block.type === 'navigation' || block.type === 'footer') {
          return null
        }
        
        if (block.type === 'hero') {
          return (
            <PageHeroBlock
              key={`hero-${block.id}`}
              {...block.content}
            />
          )
        }
        
        if (block.type === 'rich-text') {
          return (
            <RichTextBlock 
              key={`richText-${block.id}`}
              content={{
                title: block.content.title,
                subtitle: block.content.subtitle,
                headerAlign: block.content.headerAlign || 'left',
                content: block.content.content || ''
              }} 
            />
          )
        }
        
        if (block.type === 'faq') {
          return (
            <FaqBlock 
              key={`faq-${block.id}`}
              content={block.content} 
            />
          )
        }
        
        if (block.type === 'listing-views') {
          return (
            <ListingViewsBlock 
              key={`listing-views-${block.id}`}
              content={block.content}
              siteId={site.id}
              urlPrefixes={{
                products: site.settings?.url_prefixes?.products || '',
                posts: site.settings?.url_prefixes?.posts || ''
              }}
            />
          )
        }
        
        if (block.type === 'divider') {
          return (
            <DividerBlock 
              key={`divider-${block.id}`}
              content={block.content}
            />
          )
        }
        
        return null
      })}
      
      {/* Static content blocks - preserved components for future phases but not rendered */}
      {/* <ProductGridBlock />
      <PostGridBlock />
      <FaqBlock /> */}
    </SiteLayout>
  )
}