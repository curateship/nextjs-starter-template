import { type ReactNode } from "react"
import { PageHeroBlock } from "@/components/frontend/pages/hero/PageHeroBlock"
import { FaqBlock } from "@/components/frontend/pages/faq/PageFaqBlock"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { RichTextBlock } from "@/components/frontend/pages/rich-text/PageRichTextBlock"
import { ListingViewsBlock } from "@/components/frontend/pages/listing-view/PageListingViewBlock"
import { DividerBlock } from "@/components/frontend/pages/divider/PageDividerBlock"
import { AuthBlock } from "@/components/frontend/pages/auth/AuthBlockClient"
import { AccountCoreBlock } from "@/components/frontend/account/core/AccountCoreBlock"
import { AccountEditProfileBlock } from "@/components/frontend/account/edit-profile/AccountEditProfileBlock"
// Imported statically on purpose. This is a server component, so a "use client"
// module must be referenced directly for the RSC build to create a client
// boundary for it. Wrapping it in dynamic() (a client-only helper) resolves it
// in the server environment instead, where React has no forwardRef, and every
// Radix component inside it throws. The editor weight is split out inside the
// block itself, which is already a client component.
import { AccountClaimedListingsBlock } from "@/components/frontend/account/claimed-listings/AccountClaimedListingsBlock"
import { EmbeddedBlock } from "@/components/frontend/pages/embedded/PageEmbeddedBlock"
import { TestimonialsBlock } from "@/components/frontend/pages/testimonials/PageTestimonialsBlock"
import { PageCategoriesListingBlock } from "@/components/frontend/pages/categories-listing/PageCategoriesListingBlock"
import { PageSiteSearchBlock } from "@/components/frontend/pages/site-search/PageSiteSearchBlock"
import { PageMemberDirectoryBlock } from "@/components/frontend/pages/member-directory/PageMemberDirectoryBlock"
import { PageEventsCalendarBlock } from "@/components/frontend/pages/events-calendar/PageEventsCalendarBlock"
import { PageEventSubmissionBlock } from "@/components/frontend/pages/event-submission/PageEventSubmissionBlock"
import { PageListingSubmissionBlock } from "@/components/frontend/pages/listing-submission/PageListingSubmissionBlock"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { PublicProfileData } from "@/lib/actions/profiles/public-profile-actions"
import { toCdnUrl } from "@/lib/utils/cdn"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { toPublicSiteClientProps } from "@/lib/utils/public-site-client"
import { getHeroNavigationBackgroundColor } from "@/lib/utils/page-hero-background"
import { getRenderBlockContent, prepareBlocksForRender } from '@/lib/utils/frontend-blocks'

interface BlockRendererProps {
  site: SiteWithBlocks
  isPreview?: boolean
  hideSiteChrome?: boolean
  accountContext?: boolean
  publicProfileContext?: Pick<PublicProfileData, "profile" | "collections">
  renderRichTextBody?: (block: SiteWithBlocks["blocks"][number], bodyHtml: string) => ReactNode
  renderBlockOverlay?: (block: SiteWithBlocks["blocks"][number]) => ReactNode
  // Whether a platform Google OAuth app is configured. Computed server-side by
  // the caller and forwarded to any auth block so the client never reads secrets.
  googleEnabled?: boolean
}

export function BlockRenderer({
  site,
  isPreview = false,
  hideSiteChrome = false,
  accountContext = false,
  publicProfileContext,
  renderRichTextBody,
  renderBlockOverlay,
  googleEnabled = false,
}: BlockRendererProps) {
  const { blocks = [] } = site
  const siteChrome = resolveSiteChrome(site.settings)

  const getBlockContent = (block: typeof blocks[number]) => getRenderBlockContent(block, isPreview)

  // Sorting + hidden-block rules live in the shared frontend-blocks helper
  const visibleBlocks = prepareBlocksForRender(blocks, isPreview)
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
                blockId={block.id}
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
              <ListingViewsBlock
                content={blockContent}
                siteId={site.id}
                urlPrefixes={{
                  products: 'products',
                  posts: 'posts',
                  directory: 'directory'
                }}
                preloadedData={site.listingData?.[block.id]}
                preloadedMapApiKey={site.mapApiKey}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        if (block.type === 'categories-listing') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <PageCategoriesListingBlock
                content={blockContent}
                siteId={site.id}
                preloadedData={site.categoryListingData?.[block.id]}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        if (block.type === 'site-search') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <PageSiteSearchBlock
                content={blockContent}
                siteId={site.id}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        if (block.type === 'member-directory') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <PageMemberDirectoryBlock
                content={blockContent}
                siteId={site.id}
                preloadedData={site.memberDirectoryData?.[block.id]}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        if (block.type === 'events-calendar') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <PageEventsCalendarBlock
                content={blockContent}
                siteId={site.id}
                preloadedData={site.eventsCalendarData?.[block.id]}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        if (block.type === 'event-submission') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <PageEventSubmissionBlock
                content={blockContent}
                siteId={site.id}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        if (block.type === 'listing-submission') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <PageListingSubmissionBlock
                content={blockContent}
                siteId={site.id}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
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
              <AuthBlock
                {...blockContent}
                siteId={site.id}
                googleEnabled={googleEnabled}
              />
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

        if (block.type === 'account-core') {
          if (!accountContext && !publicProfileContext) return null

          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <AccountCoreBlock
                siteId={site.id}
                content={blockContent}
                siteWidth={siteWidth}
                customWidth={customWidth}
                isPreview={isPreview}
                profileData={publicProfileContext?.profile}
                collectionsData={publicProfileContext?.collections}
              />
            </div>
          )
        }

        if (block.type === 'account-edit-profile') {
          if (!accountContext || publicProfileContext) return null

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
          if (!accountContext || publicProfileContext) return null

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
