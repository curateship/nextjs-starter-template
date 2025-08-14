"use client"

import { ProductHeroBlock } from "@/components/frontend/layout/products/ProductHeroBlock"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import type { SiteWithBlocks } from "@/lib/actions/frontend-actions"
import type { ProductWithBlocks } from "@/lib/actions/product-frontend-actions"

interface ProductBlockRendererProps {
  site: SiteWithBlocks
  product: ProductWithBlocks
}

export function ProductBlockRenderer({ site, product }: ProductBlockRendererProps) {
  const { blocks: siteBlocks = {} } = site
  const { blocks: productBlocks = [] } = product
  
  // For testing: Create a mock product-hero block if no blocks exist
  const mockBlocks = productBlocks.length === 0 ? [{
    id: 'mock-hero',
    type: 'product-hero',
    content: {
      title: product.title,
      subtitle: product.meta_description || 'This is a sample product built with the Product Builder',
      primaryButton: 'Get Started',
      secondaryButton: 'Learn More',
      primaryButtonLink: '',
      secondaryButtonLink: '',
      backgroundColor: '#ffffff',
      showRainbowButton: false,
      rainbowButtonText: 'Get Access to Everything',
      rainbowButtonIcon: 'github',
      githubLink: '',
      showParticles: true,
      trustedByText: '',
      trustedByTextColor: '#6b7280',
      trustedByCount: '',
      trustedByAvatars: [],
      backgroundPattern: 'dots',
      backgroundPatternSize: 'medium',
      backgroundPatternOpacity: 80,
      backgroundPatternColor: '#a3a3a3'
    },
    display_order: 0
  }] : productBlocks
  
  // Sort product blocks by display_order
  const sortedBlocks = mockBlocks.sort((a, b) => a.display_order - b.display_order)
  
  return (
    <SiteLayout navigation={siteBlocks.navigation} footer={siteBlocks.footer}>
      {sortedBlocks.map((block) => {
        if (block.type === 'product-hero') {
          return (
            <ProductHeroBlock
              key={`product-hero-${block.id}`}
              title={block.content?.title}
              subtitle={block.content?.subtitle}
              primaryButton={block.content?.primaryButton}
              secondaryButton={block.content?.secondaryButton}
              primaryButtonLink={block.content?.primaryButtonLink}
              secondaryButtonLink={block.content?.secondaryButtonLink}
              backgroundColor={block.content?.backgroundColor}
              showRainbowButton={block.content?.showRainbowButton}
              rainbowButtonText={block.content?.rainbowButtonText}
              rainbowButtonIcon={block.content?.rainbowButtonIcon}
              githubLink={block.content?.githubLink}
              showParticles={block.content?.showParticles}
              trustedByText={block.content?.trustedByText}
              trustedByTextColor={block.content?.trustedByTextColor}
              trustedByCount={block.content?.trustedByCount}
              trustedByAvatars={block.content?.trustedByAvatars}
              backgroundPattern={block.content?.backgroundPattern}
              backgroundPatternSize={block.content?.backgroundPatternSize}
              backgroundPatternOpacity={block.content?.backgroundPatternOpacity}
              backgroundPatternColor={block.content?.backgroundPatternColor}
              heroImage={block.content?.heroImage}
              showHeroImage={block.content?.showHeroImage}
              showTrustedByBadge={block.content?.showTrustedByBadge}
            />
          )
        }
        
        // Additional block types can be added here as needed
        
        return null
      })}
      
      {/* Fallback: If no blocks, show a simple product hero */}
      {sortedBlocks.length === 0 && (
        <ProductHeroBlock
          title={product.title}
          subtitle="This product is under construction"
          primaryButton="Notify Me"
          secondaryButton="Learn More"
          backgroundColor="#ffffff"
          showParticles={true}
          trustedByAvatars={[]}
        />
      )}
    </SiteLayout>
  )
}