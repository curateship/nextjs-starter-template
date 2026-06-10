import { and, eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { categories, contentCategoryRelationships } from '@/lib/db/schema'

export type BreadcrumbContentType = 'directory' | 'product' | 'post' | 'event'
export type BreadcrumbContentTypeKey = 'directories' | 'products' | 'posts' | 'events' | 'categories'

export interface FrontendBreadcrumbItem {
  label: string
  href?: string
}

interface CategoryTrailItem {
  id: string
  title: string
  slug: string
  parentId: string | null
}

export function shouldShowFrontendBreadcrumbs(
  settings: Record<string, any> | undefined,
  contentTypeKey: BreadcrumbContentTypeKey
) {
  return settings?.breadcrumbs?.[contentTypeKey] !== false
}

async function getPublishedCategoryTrail(siteId: string, categoryId: string) {
  const trail: CategoryTrailItem[] = []
  const visitedIds = new Set<string>()
  let currentCategoryId: string | null = categoryId

  while (currentCategoryId && !visitedIds.has(currentCategoryId)) {
    visitedIds.add(currentCategoryId)

    const [category] = await db
      .select({
        id: categories.id,
        title: categories.title,
        slug: categories.slug,
        parentId: categories.parentId,
      })
      .from(categories)
      .where(and(
        eq(categories.id, currentCategoryId),
        eq(categories.siteId, siteId),
        eq(categories.isPublished, true)
      ))
      .limit(1)

    if (!category) break

    trail.unshift(category)
    currentCategoryId = category.parentId
  }

  return trail
}

export async function getContentBreadcrumbItems({
  siteId,
  contentId,
  contentType,
  currentLabel,
  rootCategoryId,
}: {
  siteId: string
  contentId: string
  contentType: BreadcrumbContentType
  currentLabel: string
  rootCategoryId?: string | null
}): Promise<FrontendBreadcrumbItem[]> {
  return unstable_cache(
    async () => {
      const assignedCategories = await db
        .select({
          id: categories.id,
          isPrimary: contentCategoryRelationships.isPrimary,
        })
        .from(contentCategoryRelationships)
        .innerJoin(categories, eq(contentCategoryRelationships.categoryId, categories.id))
        .where(and(
          eq(contentCategoryRelationships.contentId, contentId),
          eq(contentCategoryRelationships.contentType, contentType),
          eq(categories.siteId, siteId),
          eq(categories.isPublished, true)
        ))

      if (assignedCategories.length === 0) return []

      const sortedCategories = [...assignedCategories].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
      let categoryTrail: CategoryTrailItem[] = []

      for (const category of sortedCategories) {
        const trail = await getPublishedCategoryTrail(siteId, category.id)
        const rootIndex = rootCategoryId ? trail.findIndex((item) => item.id === rootCategoryId) : -1

        if (!rootCategoryId || rootIndex >= 0) {
          categoryTrail = rootIndex >= 0 ? trail.slice(rootIndex) : trail
          break
        }
      }

      if (categoryTrail.length === 0) {
        categoryTrail = await getPublishedCategoryTrail(siteId, sortedCategories[0].id)
      }

      if (categoryTrail.length === 0) return []

      return [
        ...categoryTrail.map((category) => ({
          label: category.title,
          href: `/categories/${category.slug}`,
        })),
        { label: currentLabel },
      ]
    },
    ['content-breadcrumb-items-v2', siteId, contentType, contentId, currentLabel, rootCategoryId || ''],
    {
      revalidate: false,
      tags: ['categories', 'content-categories', `${contentType}-${contentId}`, `site-${siteId}`, 'all'],
    }
  )()
}

export async function getCategoryBreadcrumbItems({
  siteId,
  categoryId,
}: {
  siteId: string
  categoryId: string
}): Promise<FrontendBreadcrumbItem[]> {
  return unstable_cache(
    async () => {
      const categoryTrail = await getPublishedCategoryTrail(siteId, categoryId)

      return categoryTrail.map((category, index) => ({
        label: category.title,
        href: index < categoryTrail.length - 1 ? `/categories/${category.slug}` : undefined,
      }))
    },
    ['category-breadcrumb-items', siteId, categoryId],
    {
      revalidate: false,
      tags: ['categories', `category-${categoryId}`, `site-${siteId}`, 'all'],
    }
  )()
}
