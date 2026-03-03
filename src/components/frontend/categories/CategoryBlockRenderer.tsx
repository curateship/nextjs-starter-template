"use client"

import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { AnimationProvider } from "@/contexts/animation-context"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { CATEGORY_CONTENT_STYLE_RENDERERS } from "./category-content-styles"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"

interface CategoryWithBlocks {
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

interface CategoryBlockRendererProps {
  site: SiteWithBlocks
  category: CategoryWithBlocks
}

function CategoryContentStyled({
  block,
  category,
  siteWidth,
  customWidth,
}: {
  block: { id: string; type: string; content: Record<string, any> }
  category: CategoryWithBlocks
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}) {
  const styleName = block.content.taxonomyContentStyle || 'default'
  const styleConfig = block.content.styleConfig || {}
  const config = styleConfig[styleName] || {}

  const Renderer = CATEGORY_CONTENT_STYLE_RENDERERS[styleName] || CATEGORY_CONTENT_STYLE_RENDERERS.default

  return (
    <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
      <div className="py-2 px-4">
        <Renderer
          config={config}
          sharedContent={{
            title: category.title,
            description: category.description,
            featuredImage: category.featured_image,
            showFeaturedImage: block.content.showFeaturedImage ?? true,
            body: block.content.body,
          }}
        />
      </div>
    </BlockContainer>
  )
}

export function CategoryBlockRenderer({ site, category }: CategoryBlockRendererProps) {
  const { blocks: siteBlocks = [] } = site
  const { blocks: categoryBlocks = [] } = category

  const sortedBlocks = categoryBlocks.sort((a, b) => a.display_order - b.display_order)

  const navigationBlock = siteBlocks.find((block: any) => block.type === 'navigation')
  const footerBlock = siteBlocks.find((block: any) => block.type === 'footer')

  const animationSettings = site.settings?.animations;
  const siteWidth = (site.settings?.site_width || 'custom') as 'full' | 'custom';
  const customWidth = site.settings?.custom_width;

  return (
    <AnimationProvider settings={animationSettings}>
      <SiteLayout navigation={navigationBlock?.content} footer={footerBlock?.content} site={site}>
        {sortedBlocks.map((block) => {
          if (block.type === 'navigation' || block.type === 'footer') {
            return null
          }

          if (block.type === 'taxonomy-content') {
            return (
              <CategoryContentStyled
                key={`category-content-${block.id}`}
                block={block}
                category={category}
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
