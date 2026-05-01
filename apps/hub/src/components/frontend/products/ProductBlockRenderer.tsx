import { Suspense } from "react"
import { ProductHeroBlock } from "@/components/frontend/products/hero/ProductHeroBlock"
import { ProductFeaturesBlock } from "@/components/frontend/products/features/ProductFeaturesBlock"
import { ProductHotspotBlock } from "@/components/frontend/products/hotspot/ProductHotspotBlock"
import { ProductCheckoutBlock } from "@/components/frontend/products/checkout/ProductCheckoutBlock"
import { ProductFAQBlock } from "@/components/frontend/products/faq/ProductFAQBlock"
import { ProductTestimonialsBlock } from "@/components/frontend/products/testimonials/ProductTestimonialsBlock"
import { ProductListingViewBlock } from "@/components/frontend/products/listing-view/ProductListingViewBlock"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { FrontendBreadcrumbs } from "@/components/frontend/layout/FrontendBreadcrumbs"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { ProductWithBlocks } from "@/lib/actions/products/product-frontend-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { toPublicSiteClientProps } from "@/lib/utils/public-site-client"

interface ProductBlockRendererProps {
  site: SiteWithBlocks
  product: ProductWithBlocks
  breadcrumbs?: FrontendBreadcrumbItem[]
  isPreview?: boolean
  hideSiteChrome?: boolean
}

export function ProductBlockRenderer({ site, product, breadcrumbs = [], isPreview = false, hideSiteChrome = false }: ProductBlockRendererProps) {
  const { blocks: productBlocks = [] } = product
  const siteChrome = resolveSiteChrome(site.settings)
  
  const isBlockHidden = (block: typeof productBlocks[number]) => block.content?.visibility?.hideBlock === true
  
  // Sort product blocks by display_order
  const sortedBlocks = productBlocks.sort((a, b) => a.display_order - b.display_order)
  const visibleBlocks = sortedBlocks.filter((block) => !isBlockHidden(block))
  
  // Get site width from site settings
  const siteWidth = site.settings?.site_width || 'custom';
  const customWidth = site.settings?.custom_width;
  const publicSite = toPublicSiteClientProps(site)
  
  return (
      <SiteLayout navigation={siteChrome.navigation || undefined} footer={siteChrome.footer || undefined} site={publicSite} isPreview={isPreview} hideChrome={hideSiteChrome}>
      <FrontendBreadcrumbs items={breadcrumbs} siteWidth={siteWidth as 'full' | 'custom'} customWidth={customWidth} />
      
      {visibleBlocks.map((block) => {
        if (block.type === 'product-hero') {
          return (
            <div key={`product-hero-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
            <ProductHeroBlock
              {...block.content}
              siteWidth={siteWidth as 'full' | 'custom'}
              customWidth={customWidth}
            />
            </div>
          )
        }

        if (block.type === 'product-features') {
          return (
            <div key={`product-features-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
            <ProductFeaturesBlock
              {...block.content}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
            </div>
          )
        }

        if (block.type === 'product-hotspot') {
          return (
            <div key={`product-hotspot-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
            <ProductHotspotBlock
              {...block.content}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
            </div>
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
            <div key={`product-checkout-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
            <ProductCheckoutBlock
              header={block.content.header}
              subheader={block.content.subheader}
              headerAlign={block.content.headerAlign}
              pricingTiers={transformedTiers}
              checkoutSettings={block.content.checkoutSettings}
              productSlug={product.slug}
              visibility={block.content.visibility}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
            </div>
          )
        }

        if (block.type === 'product-faq') {
          return (
            <div key={`product-faq-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
            <ProductFAQBlock
              content={block.content as any}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
            </div>
          )
        }

        if (block.type === 'product-testimonials') {
          return (
            <div key={`product-testimonials-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
            <ProductTestimonialsBlock
              content={block.content as any}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
            </div>
          )
        }

        if (block.type === 'listing-views') {
          return (
            <div key={`listing-views-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
            <Suspense>
              <ProductListingViewBlock
                content={block.content as any}
                siteId={site.id}
                urlPrefixes={{
                  products: 'products',
                  posts: 'posts'
                }}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </Suspense>
            </div>
          )
        }

        // Additional block types can be added here as needed

        return null
      })}
      </SiteLayout>
  )
}
