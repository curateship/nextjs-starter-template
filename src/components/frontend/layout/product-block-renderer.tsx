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
      price: '$99.99',
      ctaText: 'Add to Cart'
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
              price={block.content?.price}
              ctaText={block.content?.ctaText}
            />
          )
        }
        
        // Add more product block types here as they're implemented
        // if (block.type === 'product-details') { ... }
        // if (block.type === 'product-gallery') { ... }
        
        return null
      })}
      
      {/* Fallback: If no blocks, show a simple product hero */}
      {sortedBlocks.length === 0 && (
        <ProductHeroBlock
          title={product.title}
          subtitle="This product is under construction"
          price="Coming Soon"
          ctaText="Notify Me"
        />
      )}
    </SiteLayout>
  )
}