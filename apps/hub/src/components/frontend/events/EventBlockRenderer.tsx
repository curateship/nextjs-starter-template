import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { FrontendBreadcrumbs } from "@/components/frontend/layout/FrontendBreadcrumbs"
import { EVENT_CONTENT_STYLE_RENDERERS } from "./event-content-styles"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { toPublicSiteClientProps } from "@/lib/utils/public-site-client"
import { getRenderBlockContent, prepareBlocksForRender } from '@/lib/utils/frontend-blocks'

interface EventWithBlocks {
  id: string
  title: string
  slug: string
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
  breadcrumbs?: FrontendBreadcrumbItem[]
  isPreview?: boolean
  hideSiteChrome?: boolean
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
            featuredImage: event.featured_image,
            showFeaturedImage: block.content.visibility?.showFeaturedImage !== false,
            eventDate: block.content.eventDate,
            eventTime: block.content.eventTime,
            externalCtaUrl: block.content.externalCtaUrl,
            body: block.content.body,
          }}
        />
      </div>
    </BlockContainer>
  )
}

export function EventBlockRenderer({ site, event, breadcrumbs = [], isPreview = false, hideSiteChrome = false }: EventBlockRendererProps) {
  const { blocks: eventBlocks = [] } = event
  const siteChrome = resolveSiteChrome(site.settings)
  const getBlockContent = (block: typeof eventBlocks[number]) => getRenderBlockContent(block, isPreview)

  // Sorting + hidden-block rules live in the shared frontend-blocks helper
  const visibleBlocks = prepareBlocksForRender(eventBlocks, isPreview)

  // Get site width from site settings
  const siteWidth = (site.settings?.site_width || 'custom') as 'full' | 'custom';
  const customWidth = site.settings?.custom_width;
  const publicSite = toPublicSiteClientProps(site)

  return (
      <SiteLayout navigation={siteChrome.navigation || undefined} footer={siteChrome.footer || undefined} site={publicSite} isPreview={isPreview} hideChrome={hideSiteChrome}>
        <FrontendBreadcrumbs items={breadcrumbs} siteWidth={siteWidth} customWidth={customWidth} />
        {/* Event Blocks */}
        {visibleBlocks.map((block) => {
          const blockContent = getBlockContent(block)

          if (block.type === 'event-content') {
            return (
              <div key={`event-content-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
              <EventContentStyled
                block={{ ...block, content: blockContent }}
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
  )
}
