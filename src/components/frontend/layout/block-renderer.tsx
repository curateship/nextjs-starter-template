"use client"

import { HeroRuixenBlock } from "@/components/frontend/layout/shared/HeroRuixenBlock"
import { PostGridBlock } from "@/components/frontend/layout/posts/PostGridBlock"
import { FaqBlock } from "@/components/frontend/layout/shared/FaqBlock"
import { ProductGridBlock } from "@/components/frontend/layout/products/ProductGridBlock"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { RichTextBlock } from "@/components/frontend/layout/shared/RichTextBlock"
import type { SiteWithBlocks } from "@/lib/actions/frontend-actions"

interface BlockRendererProps {
  site: SiteWithBlocks
}

export function BlockRenderer({ site }: BlockRendererProps) {
  const { blocks = {} } = site
  
  // Combine all content blocks and sort by display_order
  const allBlocks: Array<{ type: 'hero' | 'richText'; data: any; display_order: number }> = []
  
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
  
  // Sort all blocks by display_order
  const sortedBlocks = allBlocks.sort((a, b) => a.display_order - b.display_order)
  
  return (
    <SiteLayout navigation={blocks.navigation} footer={blocks.footer}>
      {sortedBlocks.map((block, index) => {
        if (block.type === 'hero') {
          const heroBlock = block.data
          return (
            <HeroRuixenBlock
              key={`hero-${heroBlock.id}`}
              title={heroBlock.title}
              subtitle={heroBlock.subtitle}
              primaryButton={heroBlock.primaryButton}
              secondaryButton={heroBlock.secondaryButton}
              primaryButtonLink={heroBlock.primaryButtonLink}
              secondaryButtonLink={heroBlock.secondaryButtonLink}
              backgroundColor={heroBlock.backgroundColor}
              showRainbowButton={heroBlock.showRainbowButton}
              rainbowButtonText={heroBlock.rainbowButtonText}
              rainbowButtonIcon={heroBlock.rainbowButtonIcon}
              githubLink={heroBlock.githubLink}
              showParticles={heroBlock.showParticles}
              trustedByText={heroBlock.trustedByText}
              trustedByTextColor={heroBlock.trustedByTextColor}
              trustedByCount={heroBlock.trustedByCount}
              trustedByAvatars={heroBlock.trustedByAvatars}
              backgroundPattern={heroBlock.backgroundPattern}
              backgroundPatternSize={heroBlock.backgroundPatternSize}
              backgroundPatternOpacity={heroBlock.backgroundPatternOpacity}
              backgroundPatternColor={heroBlock.backgroundPatternColor}
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