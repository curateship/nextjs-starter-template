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
  const { blocks = {} } = site
  
  // Combine all content blocks and sort by display_order
  const allBlocks: Array<{ type: 'hero' | 'richText' | 'faq'; data: any; display_order: number }> = []
  
  // Add hero blocks
  if (blocks.hero) {
    blocks.hero.forEach(heroBlock => {
      allBlocks.push({
        type: 'hero',
        data: heroBlock,
        display_order: heroBlock.display_order
      })
    })
  }
  
  // Add rich text blocks
  if (blocks.richText) {
    blocks.richText.forEach(richTextBlock => {
      allBlocks.push({
        type: 'richText',
        data: richTextBlock,
        display_order: richTextBlock.display_order
      })
    })
  }
  
  // Add FAQ blocks
  if (blocks.faq) {
    blocks.faq.forEach(faqBlock => {
      allBlocks.push({
        type: 'faq',
        data: faqBlock,
        display_order: faqBlock.display_order
      })
    })
  }
  
  // Sort all blocks by display_order
  const sortedBlocks = allBlocks.sort((a, b) => a.display_order - b.display_order)
  
  return (
    <SiteLayout navigation={blocks.navigation} footer={blocks.footer}>
      {sortedBlocks.map((block, index) => {
        if (block.type === 'hero') {
          const heroBlock = block.data
          return (
            <PageHeroBlock
              key={`hero-${heroBlock.id}`}
              {...heroBlock}
            />
          )
        } else if (block.type === 'richText') {
          const richTextBlock = block.data
          return (
            <RichTextBlock 
              key={`richText-${richTextBlock.id}`}
              content={richTextBlock} 
            />
          )
        } else if (block.type === 'faq') {
          const faqBlock = block.data
          return (
            <FaqBlock 
              key={`faq-${faqBlock.id}`}
              content={faqBlock} 
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