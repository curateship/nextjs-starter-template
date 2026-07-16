import { Suspense } from "react"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { FrontendBreadcrumbs } from "@/components/frontend/layout/FrontendBreadcrumbs"
import { ListingViewsBlock } from "@/components/frontend/pages/listing-view/PageListingViewBlock"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { toPublicSiteClientProps } from "@/lib/utils/public-site-client"
import { getRenderBlockContent, prepareBlocksForRender } from "@/lib/utils/frontend-blocks"
import { CATEGORY_CHILDREN_GRID_BLOCK_TYPE, CATEGORY_CORE_BLOCK_TYPE, CATEGORY_LISTINGS_BLOCK_TYPE } from "@/lib/actions/categories/category-template-inheritance"
import { CategoryCoreBlock } from "@/components/frontend/categories/core/CategoryCoreBlock"
import { CategoryChildrenGridBlock } from "@/components/frontend/categories/children-grid/CategoryChildrenGridBlock"
import type { CategoryChildItem } from "@/lib/actions/categories/category-children-actions"
import type { ListingViewsData, ListingViewsItem } from "@/lib/actions/pages/page-listing-views-actions"

// Sample cards for the template editor preview, where no real category exists
// to filter by (mirrors DirectoryRelatedListingBlock's PREVIEW_ITEMS pattern)
const TEMPLATE_PREVIEW_LISTING_ITEMS: ListingViewsItem[] = [1, 2, 3].map((index) => ({
  id: `preview-listing-${index}`,
  title: `Sample Listing ${index}`,
  slug: `sample-listing-${index}`,
  featured_image: null,
  richText: null,
  metaDescription: "A short listing description appears here.",
  author: null,
  author_image: null,
  created_at: new Date(0).toISOString(),
  display_order: index,
  rating: 4.6,
  address: "123 Main Street",
  categories: [
    { id: "preview-category", title: "Sample Category", slug: "sample-category", parent_id: null },
  ],
  featured: false,
}))

function getTemplatePreviewListingData(itemsToShow?: unknown): ListingViewsData {
  const requestedCount = Number(itemsToShow)
  const count = Number.isFinite(requestedCount) && requestedCount > 0
    ? Math.min(TEMPLATE_PREVIEW_LISTING_ITEMS.length, requestedCount)
    : TEMPLATE_PREVIEW_LISTING_ITEMS.length
  const items = TEMPLATE_PREVIEW_LISTING_ITEMS.slice(0, count)

  return { items, totalCount: items.length, currentPage: 1, totalPages: 1 }
}

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
  // Server-prefetched listing data keyed by block id (pages pattern) — lets
  // the Listings block render with data in the initial HTML, no client fetch
  listingData?: Record<string, any>
  // Server-prefetched child categories keyed by block id
  childrenData?: Record<string, CategoryChildItem[]>
}

export function CategoryBlockRenderer({ site, category, breadcrumbs = [], isPreview = false, hideSiteChrome = false, listingData, childrenData }: CategoryBlockRendererProps) {
  const siteChrome = resolveSiteChrome(site.settings)

  const siteWidth = (site.settings?.site_width || 'custom') as 'full' | 'custom';
  const customWidth = site.settings?.custom_width;
  const publicSite = toPublicSiteClientProps(site)

  // Sorting + hidden-block rules live in the shared frontend-blocks helper
  const visibleBlocks = prepareBlocksForRender(category.blocks || [], isPreview)

  // Template editor preview has no real category to filter by — show sample
  // cards instead of live site data (directory template preview pattern)
  const isTemplatePreview = isPreview && category.id === "preview"

  return (
      <SiteLayout navigation={siteChrome.navigation || undefined} footer={siteChrome.footer || undefined} site={publicSite} isPreview={isPreview} hideChrome={hideSiteChrome}>
        <FrontendBreadcrumbs items={breadcrumbs} siteWidth={siteWidth} customWidth={customWidth} />
        {visibleBlocks.map((block) => {
          const blockContent = getRenderBlockContent(block, isPreview)

          if (block.type === CATEGORY_CORE_BLOCK_TYPE) {
            return (
              <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
                <CategoryCoreBlock
                  content={blockContent}
                  category={category}
                  siteWidth={siteWidth}
                  customWidth={customWidth}
                />
              </div>
            )
          }

          if (block.type === CATEGORY_LISTINGS_BLOCK_TYPE) {
            return (
              <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
                <Suspense>
                  <ListingViewsBlock
                    // The rendered category is the implicit filter for this block
                    content={{ ...blockContent, categoryIds: isTemplatePreview ? [] : [category.id] }}
                    preloadedData={isTemplatePreview ? getTemplatePreviewListingData(blockContent.itemsToShow) : listingData?.[block.id]}
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

          if (block.type === CATEGORY_CHILDREN_GRID_BLOCK_TYPE) {
            return (
              <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
                <CategoryChildrenGridBlock
                  content={blockContent}
                  preloadedItems={childrenData?.[block.id]}
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
