import { ProductBlockRenderer } from "@/components/frontend/products/ProductBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { unstable_cache } from "next/cache"
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "next/navigation"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"
import { shouldShowFrontendBreadcrumbs } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"

interface ProductPageProps {
  params: Promise<{
    slug: string
  }>
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
        with recursive product_row as (
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
        ),
        primary_category as (
          select c.id
          from product_row p
          inner join category_relationships cr
            on cr.content_id = p.id
            and cr.content_type = 'product'
            and cr.is_primary = true
          inner join categories c on c.id = cr.category_id
          where c.site_id = ${siteId}
            and c.is_published = true
          limit 1
        ),
        category_trail as (
          select c.id, c.title, c.slug, c.parent_id, 0 as depth
          from categories c
          inner join primary_category pc on pc.id = c.id
          where c.site_id = ${siteId}
            and c.is_published = true
          union all
          select parent.id, parent.title, parent.slug, parent.parent_id, category_trail.depth + 1
          from categories parent
          inner join category_trail on parent.id = category_trail.parent_id
          where parent.site_id = ${siteId}
            and parent.is_published = true
            and category_trail.depth < 20
        ),
        breadcrumb_items as (
          select coalesce(jsonb_agg(jsonb_build_object(
            'label', title,
            'href', '/categories/' || slug
          ) order by depth desc), '[]'::jsonb) as data
          from category_trail
        )
        select
          to_jsonb(product_row) as product,
          (select data from breadcrumb_items) as breadcrumbs
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

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params

  if (!isValidProductSlug(slug)) {
    notFound()
  }

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
  const categoryBreadcrumbs = Array.isArray(pageData.breadcrumbs)
    ? pageData.breadcrumbs as FrontendBreadcrumbItem[]
    : []
  const breadcrumbs = shouldShowFrontendBreadcrumbs(site.settings, 'products') && categoryBreadcrumbs.length > 0
    ? [...categoryBreadcrumbs, { label: product.title }]
    : []

  return (
    <>
      <StructuredData site={site} content={productWithBlocks} contentType="product" />
      <ProductBlockRenderer
        site={site}
        product={productWithBlocks}
        breadcrumbs={breadcrumbs}
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
