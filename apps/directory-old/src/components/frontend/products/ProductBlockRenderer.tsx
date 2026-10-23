import { type ReactNode } from "react"
import { ProductHeroBlock } from "@/components/frontend/products/hero/ProductHeroBlock"
import { ProductFeaturesBlock } from "@/components/frontend/products/features/ProductFeaturesBlock"
import { Product3StepsFeatureBlock } from "@/components/frontend/products/3-steps-feature/Product3StepsFeatureBlock"
import { ProductHotspotBlock } from "@/components/frontend/products/hotspot/ProductHotspotBlock"
import { ProductCheckoutBlock } from "@/components/frontend/products/checkout/ProductCheckoutBlock"
import { ProductFAQBlock } from "@/components/frontend/products/faq/ProductFAQBlock"
import { ProductTestimonialsBlock } from "@/components/frontend/products/testimonials/ProductTestimonialsBlock"
import { ProductListingViewBlock } from "@/components/frontend/products/listing-view/ProductListingViewBlock"
import { ProductLeadMagnetBlock } from "@/components/frontend/products/lead-magnet/ProductLeadMagnetBlock"
import { ProductEmailModalBlock } from "@/components/frontend/products/email-modal/ProductEmailModalBlock"
import { ProductJustBoughtBlock } from "@/components/frontend/products/just-bought/ProductJustBoughtBlock"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { FrontendBreadcrumbs } from "@/components/frontend/layout/FrontendBreadcrumbs"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { ProductWithBlocks } from "@/lib/actions/products/product-frontend-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { toPublicSiteClientProps } from "@/lib/utils/public-site-client"
import { getRenderBlockContent, prepareBlocksForRender } from '@/lib/utils/frontend-blocks'

interface ProductBlockRendererProps {
  site: SiteWithBlocks
  product: ProductWithBlocks
  breadcrumbs?: FrontendBreadcrumbItem[]
  isPreview?: boolean
  hideSiteChrome?: boolean
  renderLeadMagnetBody?: (block: ProductWithBlocks["blocks"][number], bodyHtml: string) => ReactNode
  renderBlockOverlay?: (block: ProductWithBlocks["blocks"][number]) => ReactNode
  // Server-prefetched listing data keyed by block id (pages pattern) — lets
  // listing-views blocks render with data in the initial HTML, no client fetch
  listingData?: Record<string, any>
}

export function ProductBlockRenderer({
  site,
  product,
  breadcrumbs = [],
  isPreview = false,
  hideSiteChrome = false,
  renderLeadMagnetBody,
  renderBlockOverlay,
  listingData,
}: ProductBlockRendererProps) {
  const { blocks: productBlocks = [] } = product
  const siteChrome = resolveSiteChrome(site.settings)

  const getBlockContent = (block: typeof productBlocks[number]) => getRenderBlockContent(block, isPreview)

  // Sorting + hidden-block rules live in the shared frontend-blocks helper
  const visibleBlocks = prepareBlocksForRender(productBlocks, isPreview)

  // Get site width from site settings
  const siteWidth = site.settings?.site_width || 'custom';
  const customWidth = site.settings?.custom_width;
  const publicSite = toPublicSiteClientProps(site)

  return (
      <SiteLayout navigation={siteChrome.navigation || undefined} footer={siteChrome.footer || undefined} site={publicSite} isPreview={isPreview} hideChrome={hideSiteChrome}>
      <div>
      <FrontendBreadcrumbs items={breadcrumbs} siteWidth={siteWidth as 'full' | 'custom'} customWidth={customWidth} />

      {visibleBlocks.map((block) => {
        const blockContent = getBlockContent(block)

        if (block.type === 'product-hero') {
          return (
            <div key={`product-hero-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
            <ProductHeroBlock
              {...blockContent}
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
              {...blockContent}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
            </div>
          )
        }

        if (block.type === 'product-3-steps-feature') {
          return (
            <div key={`product-3-steps-feature-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
            <Product3StepsFeatureBlock
              content={blockContent as any}
              siteWidth={siteWidth as 'full' | 'custom'}
              customWidth={customWidth}
            />
            </div>
          )
        }

        if (block.type === 'product-hotspot') {
          return (
            <div key={`product-hotspot-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
            <ProductHotspotBlock
              {...blockContent}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
            </div>
          )
        }

        if (block.type === 'product-checkout') {
          const tiers = blockContent.productPricingTiers || []

          // Transform admin tier structure to frontend tier structure
          const transformedTiers = tiers.map((tier: any) => ({
            id: tier.id,
            name: tier.name || '',
            description: tier.description || '',
            price: tier.price || '0',
            interval: tier.interval || '',
            buttonText: tier.buttonText || 'Get Started',
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
              header={blockContent.header}
              subheader={blockContent.subheader}
              headerAlign={blockContent.headerAlign}
              pricingTiers={transformedTiers}
              checkoutSettings={blockContent.checkoutSettings}
              productSlug={product.slug}
              visibility={blockContent.visibility}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
            </div>
          )
        }

        if (block.type === 'product-lead-magnet') {
          const bodyHtml = typeof blockContent.body === 'string'
            ? blockContent.body
            : typeof blockContent.content === 'string'
              ? blockContent.content
              : ''
          const inlineBody = renderLeadMagnetBody?.(block, bodyHtml)

          return (
            <div
              key={`product-lead-magnet-${block.id}`}
              data-block-id={block.id}
              data-block-type={block.type}
              className={renderBlockOverlay ? "relative group/product-preview-block" : undefined}
            >
            {renderBlockOverlay?.(block)}
            <ProductLeadMagnetBlock
              content={blockContent as any}
              siteId={site.id}
              productId={product.id}
              blockId={block.id}
              productTitle={product.title}
              featureImage={product.featured_image}
              imageAlt={product.title}
              isPreview={isPreview}
              siteWidth={siteWidth as 'full' | 'custom'}
              customWidth={customWidth}
            >
              {inlineBody}
            </ProductLeadMagnetBlock>
            </div>
          )
        }

        if (block.type === 'product-email-modal') {
          return (
            <div key={`product-email-modal-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
              <ProductEmailModalBlock
                content={blockContent as any}
                siteId={site.id}
                productId={product.id}
                blockId={block.id}
                isPreview={isPreview}
              />
            </div>
          )
        }

        if (block.type === 'product-just-bought') {
          return (
            <div key={`product-just-bought-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
              <ProductJustBoughtBlock
                content={blockContent as any}
                productTitle={product.title}
              />
            </div>
          )
        }

        if (block.type === 'product-faq') {
          return (
            <div key={`product-faq-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
            <ProductFAQBlock
              content={blockContent as any}
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
              content={blockContent as any}
              siteWidth={siteWidth}
              customWidth={customWidth}
            />
            </div>
          )
        }

        if (block.type === 'listing-views') {
          return (
            <div key={`listing-views-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
              <ProductListingViewBlock
                content={blockContent as any}
                siteId={site.id}
                urlPrefixes={{
                  products: 'products',
                  posts: 'posts'
                }}
                preloadedData={listingData?.[block.id]}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        // Additional block types can be added here as needed

        return null
      })}
      </div>
      </SiteLayout>
  )
}
