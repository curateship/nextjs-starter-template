import { CategoryBlockRenderer } from "@/components/frontend/categories/CategoryBlockRenderer"
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

interface CategoryPageProps {
  params: Promise<{
    slug: string
  }>
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
        with recursive category_row as (
          select
            c.id,
            c.site_id as "siteId",
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
        ),
        category_trail as (
          select c.id, c.title, c.slug, c.parent_id, 0 as depth
          from categories c
          inner join category_row cr on cr.id = c.id
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
          to_jsonb(category_row) as category,
          (select data from breadcrumb_items) as breadcrumbs
        from category_row
      `)

      const row = rows.rows[0] as any
      if (!row) throw new Error(CATEGORY_PAGE_NOT_FOUND_ERROR)
      return row
    },
    ['category-page-data', siteId, slug],
    {
      revalidate: false,
      tags: ['categories', `site-${siteId}`, 'all'],
    }
  )()
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params

  if (!isValidCategorySlug(slug)) {
    notFound()
  }

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
    blocks = convertContentBlocksToArray((category.contentBlocks as any) || {}, category.id)
  } catch (error) {
    console.warn('Error loading category blocks:', error)
    blocks = []
  }

  const categoryWithBlocks = {
    ...toSnakeCase(category),
    blocks
  } as any
  const categoryBreadcrumbs = Array.isArray(pageData.breadcrumbs)
    ? pageData.breadcrumbs as FrontendBreadcrumbItem[]
    : []
  const breadcrumbs = shouldShowFrontendBreadcrumbs(site.settings, 'categories')
    ? categoryBreadcrumbs.map((item, index) =>
      index === categoryBreadcrumbs.length - 1 ? { label: item.label } : item
    )
    : []

  return (
    <>
      <StructuredData site={site} content={categoryWithBlocks} contentType="category" />
      <CategoryBlockRenderer
        site={site}
        category={categoryWithBlocks}
        breadcrumbs={breadcrumbs}
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
