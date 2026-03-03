"use client"

import { ProductDefaultBlock } from "@/components/frontend/products/ProductDefaultBlock"
import { PRODUCT_CONTENT_STYLE_RENDERERS } from "@/components/frontend/products/product-content-styles"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { ProductHeroBlock } from "@/components/frontend/products/ProductHeroBlock"
import { ProductFeaturesBlock } from "@/components/frontend/products/ProductFeaturesBlock"
import { ProductHotspotBlock } from "@/components/frontend/products/ProductHotspotBlock"
import { ProductCheckoutBlock } from "@/components/frontend/products/ProductCheckoutBlock"
import ProductLeadMagnetBlock from "@/components/frontend/products/ProductLeadMagnetBlock"
import { ProductFAQBlock } from "@/components/frontend/products/ProductFAQBlock"
import { ProductListingViewBlock } from "@/components/frontend/products/ProductListingViewBlock"
import { ProductRichTextBlock } from "@/components/frontend/products/ProductRichTextBlock"
import { ProductVideoBlock } from "@/components/frontend/products/ProductVideoBlock"
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
  const animationSettings = site.settings?.animations;

  // Get site width from site settings
  const siteWidth = site.settings?.site_width || 'custom';
  const customWidth = site.settings?.custom_width;
  
  return (
    <AnimationProvider settings={animationSettings}>
      <SiteLayout navigation={navigationBlock?.content} footer={footerBlock?.content} site={site}>
      
      {sortedBlocks.map((block) => {
        // Skip navigation and footer blocks as they're handled by SiteLayout
        if (block.type === 'navigation' || block.type === 'footer') {
          return null
        }
        
        if (block.type === 'product-content' || block.type === 'product-default') {
          const styleName = block.content?.productContentStyle || 'default'
          const styleConfig = block.content?.styleConfig?.[styleName] || {}
          const Renderer = PRODUCT_CONTENT_STYLE_RENDERERS[styleName] || PRODUCT_CONTENT_STYLE_RENDERERS['default']

          return (
            <BlockContainer
              key={`product-content-${block.id}`}
              id="product-content"
              className="white"
              siteWidth={siteWidth}
              customWidth={customWidth}
            >
              <div className="max-w-6xl mx-auto">
                <Renderer
                  config={styleConfig}
                  sharedContent={{
                    title: product.title,
                    description: product.description || '',
                    featuredImage: product.featured_image || '',
                    showFeaturedImage: block.content?.showFeaturedImage ?? true,
                    downloadButtonText: block.content?.downloadButtonText,
                    downloadButtonStyle: block.content?.downloadButtonStyle,
                    downloadButtonUrl: block.content?.downloadButtonUrl,
                    body: block.content?.body,
                  }}
                />
              </div>
            </BlockContainer>
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
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
          )
        }
        
        if (block.type === 'product-hotspot') {
          return (
            <ProductHotspotBlock
              key={`product-hotspot-${block.id}`}
              {...block.content}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
          )
        }
        
        if (block.type === 'product-checkout') {
          const tiers = block.content.productPricingTiers || []

          // Transform admin tier structure to frontend tier structure
          const transformedTiers = tiers.map((tier: any) => ({
            id: tier.id,
            name: tier.name || '',
            description: tier.description || '',
            price: tier.price || '0',
            interval: tier.interval || '',
            buttonText: tier.buttonText || 'Get Started',
            buttonUrl: tier.buttonUrl || '',
            buttonVariant: 'default' as const,
            features: tier.features || [],
            comparison: '', // Not used in admin
            isPopular: tier.highlighted || tier.isPopular || false,
            ribbonText: tier.ribbonText || '',
            ribbonColor: tier.ribbonColor || 'blue',
            stripePriceId: tier.stripePriceId || ''
          }))

          return (
            <ProductCheckoutBlock
              key={`product-checkout-${block.id}`}
              header={block.content.header}
              subheader={block.content.subheader}
              headerAlign={block.content.headerAlign}
              pricingTiers={transformedTiers}
              checkoutSettings={block.content.checkoutSettings}
              productSlug={product.slug}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
          )
        }

        if (block.type === 'product-lead-magnet') {
          return (
            <ProductLeadMagnetBlock
              key={`product-lead-magnet-${block.id}`}
              content={block.content as any}
              product={product}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
          )
        }

        if (block.type === 'product-faq') {
          return (
            <ProductFAQBlock
              key={`product-faq-${block.id}`}
              content={block.content as any}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
          )
        }
        
        if (block.type === 'listing-views') {
          return (
            <ProductListingViewBlock
              key={`listing-views-${block.id}`}
              content={block.content as any}
              siteId={site.id}
              urlPrefixes={{
                products: 'products',
                posts: 'posts'
              }}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
          )
        }

        if (block.type === 'product-rich-text') {
          return (
            <ProductRichTextBlock
              key={`product-rich-text-${block.id}`}
              content={block.content as any}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
          )
        }

        if (block.type === 'product-video') {
          return (
            <ProductVideoBlock
              key={`product-video-${block.id}`}
              content={block.content as any}
              siteWidth={siteWidth}
              customWidth={customWidth}
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