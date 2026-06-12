import { Suspense } from "react"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { FrontendBreadcrumbs } from "@/components/frontend/layout/FrontendBreadcrumbs"
import { ListingViewsBlock } from "@/components/frontend/pages/listing-view/PageListingViewBlock"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { toPublicSiteClientProps } from "@/lib/utils/public-site-client"
import { getRenderBlockContent, prepareBlocksForRender } from "@/lib/utils/frontend-blocks"
import { CATEGORY_LISTINGS_BLOCK_TYPE } from "@/lib/actions/categories/category-template-inheritance"

interface CategoryWithBlocks {
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

interface CategoryBlockRendererProps {
  site: SiteWithBlocks
  category: CategoryWithBlocks
  breadcrumbs?: FrontendBreadcrumbItem[]
  isPreview?: boolean
  hideSiteChrome?: boolean
}

export function CategoryBlockRenderer({ site, category, breadcrumbs = [], isPreview = false, hideSiteChrome = false }: CategoryBlockRendererProps) {
  const siteChrome = resolveSiteChrome(site.settings)

  const siteWidth = (site.settings?.site_width || 'custom') as 'full' | 'custom';
  const customWidth = site.settings?.custom_width;
  const publicSite = toPublicSiteClientProps(site)

  // Sorting + hidden-block rules live in the shared frontend-blocks helper
  const visibleBlocks = prepareBlocksForRender(category.blocks || [], isPreview)

  return (
      <SiteLayout navigation={siteChrome.navigation || undefined} footer={siteChrome.footer || undefined} site={publicSite} isPreview={isPreview} hideChrome={hideSiteChrome}>
        <FrontendBreadcrumbs items={breadcrumbs} siteWidth={siteWidth} customWidth={customWidth} />
        {visibleBlocks.map((block) => {
          const blockContent = getRenderBlockContent(block, isPreview)

          if (block.type === CATEGORY_LISTINGS_BLOCK_TYPE) {
            return (
              <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
                <Suspense>
                  <ListingViewsBlock
                    // The rendered category is the implicit filter for this block
                    content={{ ...blockContent, categoryIds: [category.id] }}
                    siteId={site.id}
                    urlPrefixes={{
                      products: 'products',
                      posts: 'posts',
                      directory: 'directory'
                    }}
                    siteWidth={siteWidth}
                    customWidth={customWidth}
                  />
                </Suspense>
              </div>
            )
          }

          return null
        })}
      </SiteLayout>
  )
}
