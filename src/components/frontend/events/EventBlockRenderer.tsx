import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { AnimationProvider } from "@/contexts/animation-context"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { EVENT_CONTENT_STYLE_RENDERERS } from "./event-content-styles"
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

function EventContentStyled({
  block,
  event,
  siteWidth,
  customWidth,
}: {
  block: { id: string; type: string; content: Record<string, any> }
  event: EventWithBlocks
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}) {
  const styleName = block.content.eventContentStyle || 'default'
  const styleConfig = block.content.styleConfig || {}
  const config = styleConfig[styleName] || {}

  const Renderer = EVENT_CONTENT_STYLE_RENDERERS[styleName] || EVENT_CONTENT_STYLE_RENDERERS.default

  return (
    <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
      <div className="py-2 px-4">
        <Renderer
          config={config}
          sharedContent={{
            title: event.title,
            description: event.description,
            featuredImage: event.featured_image,
            showFeaturedImage: block.content.showFeaturedImage ?? true,
            body: block.content.body,
          }}
        />
      </div>
    </BlockContainer>
  )
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
  const siteWidth = (site.settings?.site_width || 'custom') as 'full' | 'custom';
  const customWidth = site.settings?.custom_width;

  return (
    <AnimationProvider settings={animationSettings}>
      <SiteLayout navigation={navigationBlock?.content} footer={footerBlock?.content} site={site}>
        {/* Event Blocks */}
        {sortedBlocks.map((block) => {
          // Skip navigation and footer blocks as they're handled by SiteLayout
          if (block.type === 'navigation' || block.type === 'footer') {
            return null
          }

          if (block.type === 'event-content') {
            return (
              <div key={`event-content-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
              <EventContentStyled
                block={block}
                event={event}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
              </div>
            )
          }

          return null
        })}
      </SiteLayout>
    </AnimationProvider>
  )
}
