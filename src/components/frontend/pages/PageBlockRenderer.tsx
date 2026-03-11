"use client"

import { PageHeroBlock } from "@/components/frontend/pages/hero/PageHeroBlock"
import { FaqBlock } from "@/components/frontend/pages/faq/PageFaqBlock"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { RichTextBlock } from "@/components/frontend/pages/rich-text/PageRichTextBlock"
import { ListingViewsBlock } from "@/components/frontend/pages/listing-view/PageListingViewBlock"
import { DividerBlock } from "@/components/frontend/pages/divider/PageDividerBlock"
import { AuthBlock } from "@/components/frontend/pages/auth/AuthBlock"
import { EmbeddedBlock } from "@/components/frontend/pages/embedded/PageEmbeddedBlock"
import { TestimonialsBlock } from "@/components/frontend/pages/testimonials/PageTestimonialsBlock"
import { UserProfileBlock } from "@/components/frontend/user-pages/UserProfileBlock"
import { AnimationProvider } from "@/contexts/animation-context"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"

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
  
  // Get animation settings from site settings
  const animationSettings = site.settings?.animations || {
    enabled: false,
    preset: 'fade',
    duration: 0.6,
    stagger: 0.1,
    intensity: 'medium'
  };

  // Get site width from site settings
  const siteWidth = site.settings?.site_width || 'custom';
  const customWidth = site.settings?.custom_width;

  return (
    <AnimationProvider settings={animationSettings}>
      <SiteLayout 
        navigation={navigationBlock?.content} 
        footer={footerBlock?.content}
        site={site}
      >
      {sortedBlocks.map((block) => {
        // Skip navigation and footer blocks as they're handled by SiteLayout
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
              <AuthBlock
                {...block.content}
              />
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
      
      {/* Static content blocks - preserved components for future phases but not rendered */}
      {/* <ProductGridBlock />
      <PostGridBlock />
      <FaqBlock /> */}
      </SiteLayout>
    </AnimationProvider>
  )
}