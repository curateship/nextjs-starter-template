"use client"

import { ProductDefaultBlock } from "@/components/frontend/products/ProductDefaultBlock"
import { ProductHeroBlock } from "@/components/frontend/products/ProductHeroBlock"
import { ProductFeaturesBlock } from "@/components/frontend/products/ProductFeaturesBlock"
import { ProductHotspotBlock } from "@/components/frontend/products/ProductHotspotBlock"
import { ProductPricingBlock } from "@/components/frontend/products/ProductPricingBlock"
import { ProductFAQBlock } from "@/components/frontend/products/ProductFAQBlock"
import { ProductListingViewBlock } from "@/components/frontend/products/ProductListingViewBlock"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { AnimationProvider } from "@/contexts/animation-context"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { ProductWithBlocks } from "@/lib/actions/products/product-frontend-actions"

interface ProductBlockRendererProps {
  site: SiteWithBlocks
  product: ProductWithBlocks
}

export function ProductBlockRenderer({ site, product }: ProductBlockRendererProps) {
  const { blocks: siteBlocks = [] } = site
  const { blocks: productBlocks = [] } = product
  
  
  // Sort product blocks by display_order
  const sortedBlocks = productBlocks.sort((a, b) => a.display_order - b.display_order)
  
  // Find navigation and footer from site blocks
  const navigationBlock = siteBlocks.find((block: any) => block.type === 'navigation')
  const footerBlock = siteBlocks.find((block: any) => block.type === 'footer')
  
  // Get animation settings from site settings
  const animationSettings = site.settings?.animations || {
    enabled: false,
    preset: 'fade',
    duration: 0.6,
    stagger: 0.1,
    intensity: 'medium'
  };
  
  return (
    <AnimationProvider settings={animationSettings}>
      <SiteLayout navigation={navigationBlock?.content} footer={footerBlock?.content} site={site}>
      
      {sortedBlocks.map((block) => {
        // Skip navigation and footer blocks as they're handled by SiteLayout
        if (block.type === 'navigation' || block.type === 'footer') {
          return null
        }
        
        if (block.type === 'product-default') {
          return (
            <ProductDefaultBlock
              key={`product-default-${block.id}`}
              title={product.title}
              richText={product.description || ''}
              featuredImage={product.featured_image || ''}
            />
          )
        }
        
        if (block.type === 'product-hero') {
          return (
            <ProductHeroBlock
              key={`product-hero-${block.id}`}
              {...block.content}
            />
          )
        }
        
        if (block.type === 'product-features') {
          return (
            <ProductFeaturesBlock
              key={`product-features-${block.id}`}
              {...block.content}
            />
          )
        }
        
        if (block.type === 'product-hotspot') {
          return (
            <ProductHotspotBlock
              key={`product-hotspot-${block.id}`}
              {...block.content}
            />
          )
        }
        
        if (block.type === 'product-pricing') {
          const tiers = block.content.tiers || block.content.pricingTiers || []
          
          // Transform admin tier structure to frontend tier structure
          const transformedTiers = tiers.map((tier: any) => ({
            id: tier.id,
            name: tier.name || '',
            description: tier.description || '',
            price: tier.price || '0',
            interval: tier.period || tier.interval || 'month',
            buttonText: tier.buttonText || 'Get Started',
            buttonUrl: tier.buttonUrl || '',
            buttonVariant: 'default' as const,
            features: tier.features || [],
            comparison: '', // Not used in admin
            isPopular: tier.highlighted || tier.isPopular || false
          }))
          
          return (
            <ProductPricingBlock
              key={`product-pricing-${block.id}`}
              title={block.content.headerTitle || block.content.title}
              subtitle={block.content.headerSubtitle || block.content.subtitle}
              pricingTiers={transformedTiers}
            />
          )
        }
        
        if (block.type === 'faq') {
          return (
            <ProductFAQBlock
              key={`product-faq-${block.id}`}
              content={block.content}
            />
          )
        }
        
        if (block.type === 'listing-views') {
          return (
            <ProductListingViewBlock
              key={`listing-views-${block.id}`}
              content={block.content}
              siteId={site.id}
              urlPrefixes={{
                products: 'products',
                posts: 'posts'
              }}
            />
          )
        }
        
        // Additional block types can be added here as needed
        
        return null
      })}
      </SiteLayout>
    </AnimationProvider>
  )
}