import { Suspense } from "react"
import { PageHeroBlock } from "@/components/frontend/pages/hero/PageHeroBlock"
import { FaqBlock } from "@/components/frontend/pages/faq/PageFaqBlock"
import { NavBlock } from "@/components/frontend/pages/navigation/PageNavigationBlock"
import { FooterBlock } from "@/components/frontend/pages/footer/PageFooterBlock"
import { RichTextBlock } from "@/components/frontend/pages/rich-text/PageRichTextBlock"
import { ListingViewsBlock } from "@/components/frontend/pages/listing-view/PageListingViewBlock"
import { DividerBlock } from "@/components/frontend/pages/divider/PageDividerBlock"
import dynamic from "next/dynamic"
const AuthBlock = dynamic(() => import("@/components/frontend/pages/auth/AuthBlock").then(m => ({ default: m.AuthBlock })))
import { EmbeddedBlock } from "@/components/frontend/pages/embedded/PageEmbeddedBlock"
import { TestimonialsBlock } from "@/components/frontend/pages/testimonials/PageTestimonialsBlock"
import { UserProfileBlock } from "@/components/frontend/user-pages/UserProfileBlock"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import { toCdnUrl } from "@/lib/utils/cdn"

interface BlockRendererProps {
  site: SiteWithBlocks
}

export function BlockRenderer({ site }: BlockRendererProps) {
  const { blocks = [] } = site
  
  // Sort blocks by display_order with proper type handling
  const sortedBlocks = blocks.sort((a, b) => {
    const orderA = typeof a.display_order === 'number' ? a.display_order : 0
    const orderB = typeof b.display_order === 'number' ? b.display_order : 0
    return orderA - orderB
  })
  
  // Find navigation and footer blocks for layout
  const navigationBlock = blocks.find(block => block.type === 'navigation')
  const footerBlock = blocks.find(block => block.type === 'footer')

  // Convert R2 URLs to cached /cdn/ paths for navigation logo
  if (navigationBlock?.content?.logo) {
    navigationBlock.content.logo = toCdnUrl(navigationBlock.content.logo)
  }
  
  // Get site width from site settings
  const siteWidth = site.settings?.site_width || 'custom';
  const customWidth = site.settings?.custom_width;

  return (
      <>
      {navigationBlock?.content && (
        <NavBlock {...navigationBlock.content} site={site} />
      )}
      <main className={navigationBlock ? "pt-16" : ""}>
      {sortedBlocks.map((block) => {
        if (block.type === 'navigation' || block.type === 'footer') {
          return null
        }

        if (block.type === 'hero') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <PageHeroBlock
                {...block.content}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        if (block.type === 'rich-text') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <RichTextBlock
                content={{
                  title: block.content.title,
                  subtitle: block.content.subtitle,
                  headerAlign: block.content.headerAlign || 'left',
                  content: block.content.content || ''
                }}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        if (block.type === 'faq') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <FaqBlock
                content={block.content}
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
                  content={block.content}
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
                content={block.content}
              />
            </div>
          )
        }

        if (block.type === 'user-profile') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <UserProfileBlock
                {...block.content}
              />
            </div>
          )
        }

        if (block.type === 'auth') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <Suspense>
                <AuthBlock
                  {...block.content}
                />
              </Suspense>
            </div>
          )
        }

        if (block.type === 'testimonials') {
          return (
            <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
              <TestimonialsBlock
                content={block.content}
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
                content={block.content}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            </div>
          )
        }

        return null
      })}
      </main>
      {footerBlock?.content && (
        <div data-block-type="footer">
          <FooterBlock {...footerBlock.content} site={site} />
        </div>
      )}
      </>
  )
}