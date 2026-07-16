import { ProductBlockRenderer } from "@/components/frontend/products/ProductBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { unstable_cache } from "@/lib/cache"
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "@/lib/navigation-server"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"
import {
  getContentBreadcrumbItems,
  shouldShowFrontendBreadcrumbs,
} from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { getListingViewsData } from "@/lib/actions/pages/page-listing-views-actions"

interface ProductPageProps {
  params: Promise<{
    slug: string
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

// Prefetch listing data server-side so listing-views blocks ship with data in
// the initial HTML instead of client-fetching after hydration. Params mirror
// ProductListingViewBlock's client fetch exactly (no category filter).
async function prefetchProductListingData(
  blocks: Array<{ id: string; type: string; content: Record<string, any> }>,
  siteId: string,
  listingPage: number
) {
  const listingData: Record<string, any> = {}

  for (const block of blocks) {
    if (block.type !== 'listing-views') continue

    try {
      const {
        contentType = 'products',
        sortBy = 'date',
        sortOrder = 'desc',
        itemsToShow = 6,
        itemsPerPage = 12,
        isPaginated = false,
      } = block.content || {}

      const limit = isPaginated ? itemsPerPage : itemsToShow
      const offset = isPaginated ? (listingPage - 1) * itemsPerPage : 0

      const result = await getListingViewsData({
        site_id: siteId,
        contentType,
        sortBy,
        sortOrder,
        limit,
        offset,
      })

      if (result.success && result.data) {
        listingData[block.id] = result.data
      }
    } catch {
      // Silently continue — the block falls back to client-side loading
    }
  }

  return listingData
}

const PRODUCT_PAGE_NOT_FOUND_ERROR = 'PRODUCT_PAGE_NOT_FOUND'

function isValidProductSlug(slug: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(slug)
}

function isProductPageNotFoundError(error: unknown) {
  return error instanceof Error && error.message === PRODUCT_PAGE_NOT_FOUND_ERROR
}

function getCachedProductPageData(siteId: string, slug: string) {
  return unstable_cache(
    async () => {
      const rows = await db.execute(sql`
        with product_row as (
          select
            p.id,
            p.site_id as "siteId",
            p.title,
            p.slug,
            p.meta_description as "metaDescription",
            p.meta_keywords as "metaKeywords",
            p.is_published as "isPublished",
            p.display_order as "displayOrder",
            p.content_blocks as "contentBlocks",
            p.featured_image as "featuredImage",
            p.created_at as "createdAt",
            p.updated_at as "updatedAt"
          from products p
          where p.site_id = ${siteId}
            and p.slug = ${slug}
            and p.is_published = true
          limit 1
        )
        select
          to_jsonb(product_row) as product
        from product_row
      `)

      const row = rows.rows[0] as any
      if (!row) throw new Error(PRODUCT_PAGE_NOT_FOUND_ERROR)
      return row
    },
    ['product-page-data', siteId, slug],
    {
      revalidate: false,
      tags: ['products', 'categories', 'content-categories', `site-${siteId}`, 'all'],
    }
  )()
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await params

  if (!isValidProductSlug(slug)) {
    notFound()
  }

  // Pagination param for paginated listing-views blocks (mirrors [...slug]/page.tsx)
  const pageValue = (await searchParams)?.page
  const parsedPage = parseInt(Array.isArray(pageValue) ? pageValue[0] || "1" : pageValue || "1", 10)
  const listingPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  let pageData: any
  try {
    pageData = await getCachedProductPageData(site.id, slug)
  } catch (error) {
    if (isProductPageNotFoundError(error)) notFound()
    throw error
  }
  const product = pageData.product

  let blocks: any[] = []
  try {
    blocks = convertContentBlocksToArray((product.contentBlocks as any) || {}, product.id)
  } catch (error) {
    console.warn('Error loading product blocks:', error)
    blocks = []
  }

  const productWithBlocks = {
    ...toSnakeCase(product),
    blocks
  } as any
  // Listing data and breadcrumbs are independent — fetch them in parallel
  const [listingData, breadcrumbs] = await Promise.all([
    prefetchProductListingData(blocks, site.id, listingPage),
    shouldShowFrontendBreadcrumbs(site.settings, 'products')
      ? getContentBreadcrumbItems({
          siteId: site.id,
          contentId: product.id,
          contentType: 'product',
          currentLabel: product.title,
        })
      : Promise.resolve([]),
  ])

  return (
    <>
      <StructuredData site={site} content={productWithBlocks} contentType="product" />
      <ProductBlockRenderer
        site={site}
        product={productWithBlocks}
        breadcrumbs={breadcrumbs}
        listingData={listingData}
      />
    </>
  )
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params

  if (!isValidProductSlug(slug)) {
    return {
      title: 'Product Not Found',
      description: 'The requested product could not be found.',
    }
  }

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Product Not Found',
        description: 'The requested product could not be found.',
      }
    }

    const pageData = await getCachedProductPageData(site.id, slug)
    const product = pageData.product

    return buildSeoMetadata(site, product as any, 'product', `/products/${slug}`)
  } catch (error) {
    return {
      title: 'Product Not Found',
      description: 'The requested product could not be found.',
    }
  }
}
