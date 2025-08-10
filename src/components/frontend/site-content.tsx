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
      {blocks.hero && (
        <HeroRuixenBlock
          title={blocks.hero.title}
          subtitle={blocks.hero.subtitle}
          primaryButton={blocks.hero.primaryButton}
          secondaryButton={blocks.hero.secondaryButton}
          primaryButtonLink={blocks.hero.primaryButtonLink}
          secondaryButtonLink={blocks.hero.secondaryButtonLink}
          backgroundColor={blocks.hero.backgroundColor}
          showRainbowButton={blocks.hero.showRainbowButton}
          githubLink={blocks.hero.githubLink}
          showParticles={blocks.hero.showParticles}
          trustedByText={blocks.hero.trustedByText}
          trustedByCount={blocks.hero.trustedByCount}
          trustedByAvatars={blocks.hero.trustedByAvatars}
        />
      )}
      
      {/* Static content blocks - preserved components for future phases but not rendered */}
      {/* <ProductGridBlock />
      <PostGridBlock />
      <FaqBlock /> */}
    </SiteLayout>
  )
}