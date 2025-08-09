"use client"

import { HeroRuixenBlock } from "@/components/frontend/layout/shared/HeroRuixenBlock"
import { PostGridBlock } from "@/components/frontend/layout/posts/PostGridBlock"
import { FaqBlock } from "@/components/frontend/layout/shared/FaqBlock"
import { ProductGridBlock } from "@/components/frontend/layout/products/ProductGridBlock"
import { SiteLayout } from "@/components/frontend/site-layout"

interface SiteContentProps {
  navigation?: {
    logo?: string
    links?: Array<{ text: string; url: string }>
    style?: { backgroundColor: string; textColor: string }
  }
  hero?: {
    title: string
    subtitle: string
    primaryButton: string
    secondaryButton: string
    showRainbowButton: boolean
    githubLink: string
    showParticles: boolean
  }
  footer?: {
    copyright?: string
    links?: Array<{ text: string; url: string }>
    socialLinks?: Array<{ platform: string; url: string }>
    style?: { backgroundColor: string; textColor: string }
  }
}

export function SiteContent({ navigation, hero, footer }: SiteContentProps) {
  return (
    <SiteLayout navigation={navigation} footer={footer}>
      {/* Hero Section */}
      {hero && (
        <HeroRuixenBlock
          title={hero.title}
          subtitle={hero.subtitle}
          primaryButton={hero.primaryButton}
          secondaryButton={hero.secondaryButton}
          showRainbowButton={hero.showRainbowButton}
          githubLink={hero.githubLink}
          showParticles={hero.showParticles}
        />
      )}
      
      {/* Static content blocks - these will be made dynamic in future phases */}
      <ProductGridBlock />
      <PostGridBlock />
      <FaqBlock />
    </SiteLayout>
  )
}