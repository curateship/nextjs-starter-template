"use client"

import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { AnimationProvider } from "@/contexts/animation-context"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { TAXONOMY_CONTENT_STYLE_RENDERERS } from "./taxonomy-content-styles"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"

interface TaxonomyWithBlocks {
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

interface TaxonomyBlockRendererProps {
  site: SiteWithBlocks
  taxonomy: TaxonomyWithBlocks
}

function TaxonomyContentStyled({
  block,
  taxonomy,
  siteWidth,
  customWidth,
}: {
  block: { id: string; type: string; content: Record<string, any> }
  taxonomy: TaxonomyWithBlocks
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}) {
  const styleName = block.content.taxonomyContentStyle || 'default'
  const styleConfig = block.content.styleConfig || {}
  const config = styleConfig[styleName] || {}

  const Renderer = TAXONOMY_CONTENT_STYLE_RENDERERS[styleName] || TAXONOMY_CONTENT_STYLE_RENDERERS.default

  return (
    <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
      <div className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <Renderer
            config={config}
            sharedContent={{
              title: taxonomy.title,
              description: taxonomy.description,
              featuredImage: taxonomy.featured_image,
              showFeaturedImage: block.content.showFeaturedImage ?? true,
              body: block.content.body,
            }}
          />
        </div>
      </div>
    </BlockContainer>
  )
}

export function TaxonomyBlockRenderer({ site, taxonomy }: TaxonomyBlockRendererProps) {
  const { blocks: siteBlocks = [] } = site
  const { blocks: taxonomyBlocks = [] } = taxonomy

  // Sort taxonomy blocks by display_order
  const sortedBlocks = taxonomyBlocks.sort((a, b) => a.display_order - b.display_order)

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
        {/* Taxonomy Blocks */}
        {sortedBlocks.map((block) => {
          // Skip navigation and footer blocks as they're handled by SiteLayout
          if (block.type === 'navigation' || block.type === 'footer') {
            return null
          }

          if (block.type === 'taxonomy-content') {
            return (
              <TaxonomyContentStyled
                key={`taxonomy-content-${block.id}`}
                block={block}
                taxonomy={taxonomy}
                siteWidth={siteWidth}
                customWidth={customWidth}
              />
            )
          }

          return null
        })}
      </SiteLayout>
    </AnimationProvider>
  )
}
