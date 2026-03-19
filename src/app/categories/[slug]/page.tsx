import { CategoryBlockRenderer } from "@/components/frontend/categories/CategoryBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { categories } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { convertContentBlocksToArray } from '@/lib/utils/category-block-utils'
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "next/navigation"

interface CategoryPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  // Direct query to categories table
  const [category] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.siteId, site.id),
        eq(categories.slug, slug),
        eq(categories.isPublished, true)
      )
    )
    .limit(1)

  if (!category) {
    notFound()
  }

  // Convert category blocks to array format
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

  return <CategoryBlockRenderer
    site={site}
    category={categoryWithBlocks}
  />
}

export async function generateMetadata({ params }: CategoryPageProps) {
  const { slug } = await params

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Category Not Found',
        description: 'The requested category could not be found.',
      }
    }

    const [category] = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.siteId, site.id),
          eq(categories.slug, slug),
          eq(categories.isPublished, true)
        )
      )
      .limit(1)

    if (!category) {
      return {
        title: 'Category Not Found',
        description: 'The requested category could not be found.',
      }
    }

    return {
      title: `${category.title} | ${site.name}`,
      description: category.metaDescription || category.description || `${category.title} on ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Category Not Found',
      description: 'The requested category could not be found.',
    }
  }
}
