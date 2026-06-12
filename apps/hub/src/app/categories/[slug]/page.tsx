import { CategoryBlockRenderer } from "@/components/frontend/categories/CategoryBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { unstable_cache } from "next/cache"
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { CATEGORY_LISTINGS_BLOCK_TYPE, mergeCategoryTemplateBlocks } from '@/lib/actions/categories/category-template-inheritance'
import { getListingViewsData } from "@/lib/actions/pages/page-listing-views-actions"
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "next/navigation"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"
import {
  getCategoryBreadcrumbItems,
  shouldShowFrontendBreadcrumbs,
} from "@/lib/actions/categories/frontend-breadcrumb-actions"

interface CategoryPageProps {
  params: Promise<{
    slug: string
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

// Prefetch listing data server-side so the Listings block ships with data in
// the initial HTML instead of client-fetching after hydration (mirrors
// prefetchListingData in page-frontend-actions.ts; defaults match the block's)
async function prefetchCategoryListingData(
  blocks: Array<{ id: string; type: string; content: Record<string, any> }>,
  siteId: string,
  categoryId: string,
  listingPage: number
) {
  const listingData: Record<string, any> = {}

  for (const block of blocks) {
    if (block.type !== CATEGORY_LISTINGS_BLOCK_TYPE) continue

    try {
      const {
        contentType = 'products',
        categoryChipParentIds = [],
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
        // The rendered category is the implicit filter for this block
        categoryIds: [categoryId],
        sortBy,
        sortOrder,
        limit,
        offset,
        includeCategories: contentType === 'directory' && Array.isArray(categoryChipParentIds) && categoryChipParentIds.length > 0,
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

const CATEGORY_PAGE_NOT_FOUND_ERROR = 'CATEGORY_PAGE_NOT_FOUND'

function isValidCategorySlug(slug: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(slug)
}

function isCategoryPageNotFoundError(error: unknown) {
  return error instanceof Error && error.message === CATEGORY_PAGE_NOT_FOUND_ERROR
}

function getCachedCategoryPageData(siteId: string, slug: string) {
  return unstable_cache(
    async () => {
      const rows = await db.execute(sql`
        with category_row as (
          select
            c.id,
            c.site_id as "siteId",
            c.template_id as "templateId",
            c.title,
            c.slug,
            c.parent_id as "parentId",
            c.featured_image as "featuredImage",
            c.meta_description as "metaDescription",
            c.content_blocks as "contentBlocks",
            c.is_published as "isPublished",
            c.display_order as "displayOrder",
            c.created_at as "createdAt",
            c.updated_at as "updatedAt"
          from categories c
          where c.site_id = ${siteId}
            and c.slug = ${slug}
            and c.is_published = true
          limit 1
        )
        select
          to_jsonb(category_row) as category,
          ct.content_blocks as "templateContentBlocks"
        from category_row
        inner join category_templates ct
          on ct.id = category_row."templateId"
          and ct.site_id = category_row."siteId"
      `)

      const row = rows.rows[0] as any
      if (!row) throw new Error(CATEGORY_PAGE_NOT_FOUND_ERROR)
      return row
    },
    // v2: template-merged content blocks
    ['category-page-data-v2', siteId, slug],
    {
      revalidate: false,
      tags: ['categories', `site-${siteId}`, 'all'],
    }
  )()
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params

  if (!isValidCategorySlug(slug)) {
    notFound()
  }

  // Pagination param for paginated Listings blocks (mirrors [...slug]/page.tsx)
  const pageValue = (await searchParams)?.page
  const parsedPage = parseInt(Array.isArray(pageValue) ? pageValue[0] || "1" : pageValue || "1", 10)
  const listingPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  let pageData: any
  try {
    pageData = await getCachedCategoryPageData(site.id, slug)
  } catch (error) {
    if (isCategoryPageNotFoundError(error)) notFound()
    throw error
  }
  const category = pageData.category

  let blocks: any[] = []
  try {
    // Template owns block structure; the category row stores only values
    const mergedContentBlocks = mergeCategoryTemplateBlocks(
      (pageData.templateContentBlocks as any) || {},
      (category.contentBlocks as any) || {}
    )
    blocks = convertContentBlocksToArray(mergedContentBlocks, category.id)
  } catch (error) {
    console.warn('Error loading category blocks:', error)
    blocks = []
  }

  const categoryWithBlocks = {
    ...toSnakeCase(category),
    blocks
  } as any
  // Listing data and breadcrumbs are independent — fetch them in parallel
  const [listingData, breadcrumbs] = await Promise.all([
    prefetchCategoryListingData(blocks, site.id, category.id, listingPage),
    shouldShowFrontendBreadcrumbs(site.settings, 'categories')
      ? getCategoryBreadcrumbItems({
          siteId: site.id,
          categoryId: category.id,
        })
      : Promise.resolve([]),
  ])

  return (
    <>
      <StructuredData site={site} content={categoryWithBlocks} contentType="category" />
      <CategoryBlockRenderer
        site={site}
        category={categoryWithBlocks}
        breadcrumbs={breadcrumbs}
        listingData={listingData}
      />
    </>
  )
}

export async function generateMetadata({ params }: CategoryPageProps) {
  const { slug } = await params

  if (!isValidCategorySlug(slug)) {
    return {
      title: 'Category Not Found',
      description: 'The requested category could not be found.',
    }
  }

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Category Not Found',
        description: 'The requested category could not be found.',
      }
    }

    const pageData = await getCachedCategoryPageData(site.id, slug)
    const category = pageData.category

    return {
      title: `${category.title} | ${site.name}`,
      description: category.metaDescription || `${category.title} on ${site.name}`,
      ...buildSeoMetadata(site, category as any, 'category', `/categories/${slug}`),
    }
  } catch (error) {
    return {
      title: 'Category Not Found',
      description: 'The requested category could not be found.',
    }
  }
}
