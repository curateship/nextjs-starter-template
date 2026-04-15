import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { CATEGORY_CONTENT_STYLE_RENDERERS } from "./category-content-styles"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import { resolveSiteChrome } from "@/lib/utils/site-structure"

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
  initialHasSession?: boolean
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

export function CategoryBlockRenderer({ site, category, initialHasSession = false }: CategoryBlockRendererProps) {
  const { blocks: categoryBlocks = [] } = category
  const siteChrome = resolveSiteChrome(site.settings)

  const sortedBlocks = categoryBlocks.sort((a, b) => a.display_order - b.display_order)

  const siteWidth = (site.settings?.site_width || 'custom') as 'full' | 'custom';
  const customWidth = site.settings?.custom_width;

  return (
      <SiteLayout navigation={siteChrome.navigation || undefined} footer={siteChrome.footer || undefined} site={site} initialHasSession={initialHasSession}>
        {sortedBlocks.map((block) => {
          if (block.type === 'taxonomy-content') {
            return (
              <div key={`category-content-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
              <CategoryContentStyled
                block={block}
                category={category}
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
