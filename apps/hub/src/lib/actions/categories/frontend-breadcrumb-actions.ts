import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { categories, contentCategoryRelationships } from '@/lib/db/schema'
import type { DirectoryCoreCategoryContext } from '@/lib/actions/directories/directory-core'

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
}: {
  siteId: string
  contentId: string
  contentType: BreadcrumbContentType
  currentLabel: string
}): Promise<FrontendBreadcrumbItem[]> {
  const [primaryCategory] = await db
    .select({
      id: categories.id,
    })
    .from(contentCategoryRelationships)
    .innerJoin(categories, eq(contentCategoryRelationships.categoryId, categories.id))
    .where(and(
      eq(contentCategoryRelationships.contentId, contentId),
      eq(contentCategoryRelationships.contentType, contentType),
      eq(contentCategoryRelationships.isPrimary, true),
      eq(categories.siteId, siteId),
      eq(categories.isPublished, true)
    ))
    .limit(1)

  if (!primaryCategory) return []

  const categoryTrail = await getPublishedCategoryTrail(siteId, primaryCategory.id)
  if (categoryTrail.length === 0) return []

  return [
    ...categoryTrail.map((category) => ({
      label: category.title,
      href: `/categories/${category.slug}`,
    })),
    { label: currentLabel },
  ]
}

export async function getContentCategoryContext({
  siteId,
  contentId,
  contentType,
}: {
  siteId: string
  contentId: string
  contentType: BreadcrumbContentType
}): Promise<DirectoryCoreCategoryContext> {
  const [category] = await db
    .select({
      title: categories.title,
      parentId: categories.parentId,
    })
    .from(contentCategoryRelationships)
    .innerJoin(categories, eq(contentCategoryRelationships.categoryId, categories.id))
    .where(and(
      eq(contentCategoryRelationships.contentId, contentId),
      eq(contentCategoryRelationships.contentType, contentType),
      eq(categories.siteId, siteId),
      eq(categories.isPublished, true)
    ))
    .orderBy(desc(contentCategoryRelationships.isPrimary), asc(contentCategoryRelationships.createdAt))
    .limit(1)

  if (!category) return {}

  if (!category.parentId) {
    return { child_title: category.title }
  }

  const [parentCategory] = await db
    .select({ title: categories.title })
    .from(categories)
    .where(and(
      eq(categories.id, category.parentId),
      eq(categories.siteId, siteId),
      eq(categories.isPublished, true)
    ))
    .limit(1)

  return {
    parent_title: parentCategory?.title || null,
    child_title: category.title,
  }
}

export async function getCategoryBreadcrumbItems({
  siteId,
  categoryId,
}: {
  siteId: string
  categoryId: string
}): Promise<FrontendBreadcrumbItem[]> {
  const categoryTrail = await getPublishedCategoryTrail(siteId, categoryId)

  return categoryTrail.map((category, index) => ({
    label: category.title,
    href: index < categoryTrail.length - 1 ? `/categories/${category.slug}` : undefined,
  }))
}
