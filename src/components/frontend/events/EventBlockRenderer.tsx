"use client"

import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { AnimationProvider } from "@/contexts/animation-context"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"

interface EventWithBlocks {
  id: string
  title: string
  slug: string
  description?: string | null
  featured_image?: string | null
  blocks: Array<{
    id: string
    type: string
    content: Record<string, any>
    display_order: number
  }>
}

interface EventBlockRendererProps {
  site: SiteWithBlocks
  event: EventWithBlocks
}

export function EventBlockRenderer({ site, event }: EventBlockRendererProps) {
  const { blocks: siteBlocks = [] } = site
  const { blocks: eventBlocks = [] } = event

  // Sort event blocks by display_order
  const sortedBlocks = eventBlocks.sort((a, b) => a.display_order - b.display_order)

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
        {/* Event Header */}
        <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
          <div className="py-12 px-4">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-4xl font-bold mb-4">{event.title}</h1>
              {event.description && (
                <div
                  className="prose prose-sm max-w-none mb-6 dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: event.description }}
                />
              )}
              {event.featured_image && (
                <img
                  src={event.featured_image}
                  alt={event.title}
                  className="w-full h-64 object-cover rounded-lg"
                />
              )}
            </div>
          </div>
        </BlockContainer>

        {/* Event Blocks */}
        {sortedBlocks.map((block) => {
          // Skip navigation and footer blocks as they're handled by SiteLayout
          if (block.type === 'navigation' || block.type === 'footer') {
            return null
          }

          // Render event-specific blocks here
          if (block.type === 'event-default') {
            return (
              <BlockContainer
                key={`event-default-${block.id}`}
                siteWidth={siteWidth}
                customWidth={customWidth}
              >
                <div className="py-8 px-4">
                  <div className="max-w-4xl mx-auto">
                    <div className="border rounded-lg p-6 bg-card text-card-foreground">
                      <h3 className="text-lg font-semibold mb-2">Event Information</h3>
                      <p className="text-sm text-muted-foreground">
                        This is an event default block. Additional content can be added here.
                      </p>
                    </div>
                  </div>
                </div>
              </BlockContainer>
            )
          }

          return null
        })}
      </SiteLayout>
    </AnimationProvider>
  )
}
