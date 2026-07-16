"use server"

import { db } from "@/lib/db"
import { categories } from "@/lib/db/schema/categories"
import { and, eq, asc } from "drizzle-orm"
import { UUID_REGEX } from "@/lib/utils/validation"

export interface CategoryChildItem {
  id: string
  title: string
  slug: string
  featured_image: string | null
}

export async function getCategoryChildrenAction(
  siteId: string,
  parentCategoryId: string
): Promise<CategoryChildItem[]> {
  if (!UUID_REGEX.test(siteId) || !UUID_REGEX.test(parentCategoryId)) return []

  const rows = await db
    .select({
      id: categories.id,
      title: categories.title,
      slug: categories.slug,
      featured_image: categories.featuredImage,
    })
    .from(categories)
    .where(
      and(
        eq(categories.siteId, siteId),
        eq(categories.parentId, parentCategoryId),
        eq(categories.isPublished, true)
      )
    )
    .orderBy(asc(categories.displayOrder), asc(categories.title))

  return rows
}
