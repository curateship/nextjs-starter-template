"use client"

import { HeroRuixenBlock } from "@/components/frontend/layout/shared/HeroRuixenBlock"
import { PostGridBlock } from "@/components/frontend/layout/posts/PostGridBlock"
import { FaqBlock } from "@/components/frontend/layout/shared/FaqBlock"
import { ProductGridBlock } from "@/components/frontend/layout/products/ProductGridBlock"
import { SiteLayout } from "@/components/frontend/site-layout"
import type { SiteWithBlocks } from "@/lib/actions/frontend-actions"

interface SiteContentProps {
  site: SiteWithBlocks
}

export function SiteContent({ site }: SiteContentProps) {
  const { blocks = {} } = site
  
  return (
    <SiteLayout navigation={blocks.navigation} footer={blocks.footer}>
      {/* Hero Section */}
      {blocks.hero && blocks.hero.map((heroBlock, index) => (
        <HeroRuixenBlock
          key={index}
          title={heroBlock.title}
          subtitle={heroBlock.subtitle}
          primaryButton={heroBlock.primaryButton}
          secondaryButton={heroBlock.secondaryButton}
          primaryButtonLink={heroBlock.primaryButtonLink}
          secondaryButtonLink={heroBlock.secondaryButtonLink}
          backgroundColor={heroBlock.backgroundColor}
          showRainbowButton={heroBlock.showRainbowButton}
          githubLink={heroBlock.githubLink}
          showParticles={heroBlock.showParticles}
          trustedByText={heroBlock.trustedByText}
          trustedByCount={heroBlock.trustedByCount}
          trustedByAvatars={heroBlock.trustedByAvatars}
        />
      ))}
      
      {/* Static content blocks - preserved components for future phases but not rendered */}
      {/* <ProductGridBlock />
      <PostGridBlock />
      <FaqBlock /> */}
    </SiteLayout>
  )
}