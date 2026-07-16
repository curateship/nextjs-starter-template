"use server"

import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { unstable_cache } from "@/lib/cache"
import { db } from "@/lib/db"
import { categories, sites } from "@/lib/db/schema"
import { UUID_REGEX } from '@/lib/utils/validation'

interface CategoriesListingItem {
  id: string
  title: string
  slug: string
}

export interface CategoriesListingData {
  categories: CategoriesListingItem[]
}

function clampLimit(limit?: number) {
  const value = Math.floor(Number(limit) || 20)
  return Math.min(100, Math.max(1, value))
}

const getCachedCategoriesListingData = unstable_cache(
  async (siteId: string, parentCategoryId: string, limit: number): Promise<CategoriesListingData> => {
    const rows = await db
      .select({
        id: categories.id,
        title: categories.title,
        slug: categories.slug,
      })
      .from(categories)
      .innerJoin(sites, eq(sites.id, categories.siteId))
      .where(and(
        eq(categories.siteId, siteId),
        eq(categories.parentId, parentCategoryId),
        eq(categories.isPublished, true),
        inArray(sites.status, ["active", "draft"])
      ))
      .orderBy(desc(categories.displayOrder), asc(categories.title))
      .limit(limit)

    return { categories: rows }
  },
  ["categories-listing-data-v1"],
  {
    revalidate: 3600,
    tags: ["categories", "all"],
  }
)

export async function getCategoriesListingData(params: {
  siteId: string
  parentCategoryId?: string
  limit?: number
}): Promise<{
  success: boolean
  data?: CategoriesListingData
  error?: string
}> {
  try {
    const { siteId, parentCategoryId } = params

    if (!siteId || !UUID_REGEX.test(siteId)) {
      return { success: false, error: "Site ID is required" }
    }

    if (!parentCategoryId || !UUID_REGEX.test(parentCategoryId)) {
      return { success: true, data: { categories: [] } }
    }

    const data = await getCachedCategoriesListingData(siteId, parentCategoryId, clampLimit(params.limit))

    return { success: true, data }
  } catch (error) {
    console.error("Error loading categories listing data:", error)
    return { success: false, error: "Failed to load categories" }
  }
}
