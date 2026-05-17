import { Suspense, type ReactNode } from "react"
import { PageHeroBlock } from "@/components/frontend/pages/hero/PageHeroBlock"
import { FaqBlock } from "@/components/frontend/pages/faq/PageFaqBlock"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { RichTextBlock } from "@/components/frontend/pages/rich-text/PageRichTextBlock"
import { ListingViewsBlock } from "@/components/frontend/pages/listing-view/PageListingViewBlock"
import { DividerBlock } from "@/components/frontend/pages/divider/PageDividerBlock"
import dynamic from "next/dynamic"
const AuthBlock = dynamic(() => import("@/components/frontend/pages/auth/AuthBlock").then(m => ({ default: m.AuthBlock })))
const AccountEditProfileBlock = dynamic(() => import("@/components/frontend/account/edit-profile/AccountEditProfileBlock").then(m => ({ default: m.AccountEditProfileBlock })))
const AccountClaimedListingsBlock = dynamic(() => import("@/components/frontend/account/claimed-listings/AccountClaimedListingsBlock").then(m => ({ default: m.AccountClaimedListingsBlock })))
import { EmbeddedBlock } from "@/components/frontend/pages/embedded/PageEmbeddedBlock"
import { TestimonialsBlock } from "@/components/frontend/pages/testimonials/PageTestimonialsBlock"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import { toCdnUrl } from "@/lib/utils/cdn"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { toPublicSiteClientProps } from "@/lib/utils/public-site-client"
import { getHeroNavigationBackgroundColor } from "@/lib/utils/page-hero-background"

interface BlockRendererProps {
  site: SiteWithBlocks
  isPreview?: boolean
  hideSiteChrome?: boolean
  accountContext?: boolean
  renderRichTextBody?: (block: SiteWithBlocks["blocks"][number], bodyHtml: string) => ReactNode
  renderBlockOverlay?: (block: SiteWithBlocks["blocks"][number]) => ReactNode
}

export function BlockRenderer({
  site,
  isPreview = false,
  hideSiteChrome = false,
  accountContext = false,
  renderRichTextBody,
  renderBlockOverlay,
}: BlockRendererProps) {
  const { blocks = [] } = site
  const siteChrome = resolveSiteChrome(site.settings)

  const isBlockHidden = (block: typeof blocks[number]) => block.content?.visibility?.hideBlock === true
  const getBlockContent = (block: typeof blocks[number]) => {
    if (!isPreview || !block.content?.visibility?.hideBlock) return block.content

    return {
      ...block.content,
      visibility: {
        ...block.content.visibility,
        hideBlock: false,
      },
    }
  }

  // Sort blocks by display_order with proper type handling
  const sortedBlocks = [...blocks].sort((a, b) => {
    const orderA = typeof a.display_order === 'number' ? a.display_order : 0
    const orderB = typeof b.display_order === 'number' ? b.display_order : 0
    return orderA - orderB
  })

  const visibleBlocks = isPreview ? sortedBlocks : sortedBlocks.filter((block) => !isBlockHidden(block))
  const navigationBackgroundColor = getHeroNavigationBackgroundColor(visibleBlocks)
  const navigation = siteChrome.navigation || undefined
  const footer = siteChrome.footer || undefined
  const publicSite = toPublicSiteClientProps(site)

  // Convert R2 URLs to cached /cdn/ paths for navigation logo
  if (navigation?.logo) {
    navigation.logo = toCdnUrl(navigation.logo)
  }
  
  // Get site width from site settings
  const siteWidth = site.settings?.site_width || 'custom';
  const customWidth = site.settings?.custom_width;

  return (
      <SiteLayout
        navigation={navigation}
        footer={footer}
        site={publicSite}
        isPreview={isPreview}
        hideChrome={hideSiteChrome}
        navigationBackgroundColor={navigationBackgroundColor}
      >
      {visibleBlocks.map((block) => {
        const blockContent = getBlockContent(block)

        if (block.type === 'hero') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <PageHeroBlock
                {...blockContent}
                siteId={site.id}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        if (block.type === 'rich-text') {
          const bodyHtml = typeof blockContent.body === 'string'
            ? blockContent.body
            : typeof blockContent.content === 'string'
              ? blockContent.content
              : ''
          const visibility = blockContent?.visibility && typeof blockContent.visibility === 'object'
            ? blockContent.visibility as Record<string, boolean>
            : {}

          if (visibility.body === false || (!renderRichTextBody && !bodyHtml.trim())) {
            return null
          }

          const inlineBody = renderRichTextBody?.(block, bodyHtml)

          return (
            <div
              key={block.id}
              data-block-id={block.id}
              data-block-type={block.type}
              className={renderBlockOverlay ? "relative group/page-preview-block" : undefined}
            >
              {renderBlockOverlay?.(block)}
              <RichTextBlock
                content={blockContent}
                siteWidth={siteWidth}
                customWidth={customWidth}
              >
                {inlineBody}
              </RichTextBlock>
            </div>
          )
        }

        if (block.type === 'faq') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <FaqBlock
                content={blockContent}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        if (block.type === 'listing-views') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <Suspense>
                <ListingViewsBlock
                  content={blockContent}
                  siteId={site.id}
                  urlPrefixes={{
                    products: 'products',
                    posts: 'posts'
                  }}
                  preloadedData={site.listingData?.[block.id]}
                  siteWidth={siteWidth}
                  customWidth={customWidth}
                />
              </Suspense>
            </div>
          )
        }

        if (block.type === 'divider') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <DividerBlock
                content={blockContent}
              />
            </div>
          )
        }

        if (block.type === 'auth') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <Suspense>
                <AuthBlock
                  {...blockContent}
                />
              </Suspense>
            </div>
          )
        }

        if (block.type === 'testimonials') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <TestimonialsBlock
                content={blockContent}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        if (block.type === 'embedded') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <EmbeddedBlock
                content={blockContent}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        if (block.type === 'account-edit-profile') {
          if (!accountContext) return null

          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <AccountEditProfileBlock
                content={blockContent}
                siteWidth={siteWidth}
                customWidth={customWidth}
                isPreview={isPreview}
              />
            </div>
          )
        }

        if (block.type === 'account-claimed-listings') {
          if (!accountContext) return null

          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <AccountClaimedListingsBlock
                siteId={site.id}
                content={blockContent}
                siteWidth={siteWidth}
                customWidth={customWidth}
                isPreview={isPreview}
              />
            </div>
          )
        }

        return null
      })}
      </SiteLayout>
  )
}
