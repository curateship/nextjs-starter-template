import { CategoryBlockRenderer } from "@/components/frontend/categories/CategoryBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { categories } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "next/navigation"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"
import { headers } from "next/headers"
import { getSessionCookie } from "better-auth/cookies"

interface CategoryPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params
  const isLoggedIn = !!getSessionCookie(await headers())

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
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
    notFound()
  }

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

  return (
    <>
      <StructuredData site={site} content={categoryWithBlocks} contentType="category" />
      <CategoryBlockRenderer
        site={site}
        category={categoryWithBlocks}
        initialHasSession={isLoggedIn}
      />
    </>
  )
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
      ...buildSeoMetadata(site, category as any, 'category', `/categories/${slug}`),
    }
  } catch (error) {
    return {
      title: 'Category Not Found',
      description: 'The requested category could not be found.',
    }
  }
}
