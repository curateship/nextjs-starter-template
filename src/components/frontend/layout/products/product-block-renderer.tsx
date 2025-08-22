"use client"

import { ProductDefaultBlock } from "@/components/frontend/layout/products/ProductDefaultBlock"
import { ProductHeroBlock } from "@/components/frontend/layout/products/ProductHeroBlock"
import { ProductFeaturesBlock } from "@/components/frontend/layout/products/ProductFeaturesBlock"
import { ProductHotspotBlock } from "@/components/ui/product-hotspot-block"
import { ProductPricingBlock } from "@/components/frontend/layout/products/ProductPricingBlock"
import { ProductFAQBlock } from "@/components/frontend/layout/products/ProductFAQBlock"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import type { SiteWithBlocks } from "@/lib/actions/frontend-actions"
import type { ProductWithBlocks } from "@/lib/actions/product-frontend-actions"

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
  
  return (
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
          return (
            <ProductPricingBlock
              key={`product-pricing-${block.id}`}
              title={block.content.title}
              subtitle={block.content.subtitle}
              pricingTiers={block.content.pricingTiers}
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
        
        // Additional block types can be added here as needed
        
        return null
      })}
    </SiteLayout>
  )
}