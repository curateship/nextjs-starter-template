"use client"

import { PageHeroBlock } from "@/components/frontend/layout/pages/PageHeroBlock"
import { PostGridBlock } from "@/components/frontend/layout/posts/PostGridBlock"
import { FaqBlock } from "@/components/frontend/layout/pages/FaqBlock"
import { ProductGridBlock } from "@/components/frontend/layout/products/ProductGridBlock"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { RichTextBlock } from "@/components/frontend/layout/pages/RichTextBlock"
import type { SiteWithBlocks } from "@/lib/actions/frontend-actions"

interface BlockRendererProps {
  site: SiteWithBlocks
}

export function BlockRenderer({ site }: BlockRendererProps) {
  const { blocks = [] } = site
  
  // Sort blocks by display_order (simple like products)
  const sortedBlocks = blocks.sort((a, b) => a.display_order - b.display_order)
  
  // Find navigation and footer blocks for layout
  const navigationBlock = blocks.find(block => block.type === 'navigation')
  const footerBlock = blocks.find(block => block.type === 'footer')
  
  return (
    <SiteLayout 
      navigation={navigationBlock?.content} 
      footer={footerBlock?.content}
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
        
        return null
      })}
      
      {/* Static content blocks - preserved components for future phases but not rendered */}
      {/* <ProductGridBlock />
      <PostGridBlock />
      <FaqBlock /> */}
    </SiteLayout>
  )
}