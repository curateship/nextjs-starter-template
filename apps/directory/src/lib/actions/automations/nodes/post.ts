
import { and, eq, inArray } from 'drizzle-orm'
import { revalidateTag } from '@/lib/cache'
import type { PostAutomationNode, StructuredArticle } from '@/features/automations/domain/types'
import { db } from '@/lib/db'
import {
  categories,
  contentCategoryRelationships,
  posts,
  postTemplates,
} from '@/lib/db/schema'
import {
  generateUniqueContentSlug,
  getNextContentDisplayOrder,
} from '@/lib/actions/content/content-action-helpers'
import { safeSyncSiteSearchDocument } from '@/lib/actions/site-search/site-search-index'
import { buildAutomationPostContent } from './post-content'

export interface PostNodeResult {
  postId: string
  title: string
  slug: string
  url: string
  published: boolean
}

export async function runPostNode(
  siteId: string,
  node: PostAutomationNode,
  article: StructuredArticle
): Promise<PostNodeResult> {
  const [template] = await db
    .select()
    .from(postTemplates)
    .where(and(eq(postTemplates.id, node.config.templateId), eq(postTemplates.siteId, siteId)))
    .limit(1)
  if (!template) throw new Error('Post template was not found')

  const templateBlocks = (template.contentBlocks ?? {}) as Record<string, any>
  const selectedCategories = await loadSelectedCategories(siteId, node.config.categoryIds)
  const categoryIds = selectedCategories.map((category) => category.id)
  const primaryCategoryId = node.config.primaryCategoryId && categoryIds.includes(node.config.primaryCategoryId)
    ? node.config.primaryCategoryId
    : categoryIds[0] ?? null
  const contentBlocks = buildAutomationPostContent(templateBlocks, article)
  const displayOrder = await getNextContentDisplayOrder(posts, siteId)

  let created: typeof posts.$inferSelect | undefined
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const slug = await generateUniqueContentSlug(posts, siteId, article.title)
    try {
      created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(posts)
          .values({
            siteId,
            templateId: template.id,
            title: article.title,
            slug,
            metaDescription: article.metaDescription,
            excerpt: article.excerpt,
            featuredImage: article.featuredImage ?? null,
            contentBlocks,
            isPublished: node.config.publish,
            displayOrder,
          })
          .returning()
        if (!row) throw new Error('Post could not be created')
        if (categoryIds.length) {
          await tx.insert(contentCategoryRelationships).values(categoryIds.map((categoryId) => ({
            contentId: row.id,
            contentType: 'post',
            categoryId,
            isPrimary: categoryId === primaryCategoryId,
          })))
        }
        return row
      })
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error
    }
  }
  if (!created) throw new Error('Post could not be created')

  await safeSyncSiteSearchDocument('post', created)
  revalidateTag('listing-views')
  revalidateTag('posts')
  revalidateTag(`site-${siteId}`)
  revalidateTag(`post-${created.id}`)
  for (const categoryId of categoryIds) revalidateTag(`category-${categoryId}`)
  return {
    postId: created.id,
    title: created.title,
    slug: created.slug,
    url: `/admin/posts/builder/${siteId}?post=${encodeURIComponent(created.slug)}`,
    published: created.isPublished,
  }
}

async function loadSelectedCategories(siteId: string, requestedIds: string[]) {
  const ids = [...new Set(requestedIds)]
  if (!ids.length) return []
  const rows = await db
    .select({ id: categories.id, siteId: categories.siteId, isPublished: categories.isPublished })
    .from(categories)
    .where(inArray(categories.id, ids))
  if (rows.length !== ids.length || rows.some((row) => row.siteId !== siteId || !row.isPublished)) {
    throw new Error('One or more Post categories are unavailable')
  }
  return rows
}

function isUniqueViolation(error: unknown) {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === 'object' && 'code' in current && (current as { code?: string }).code === '23505') return true
    current = typeof current === 'object' ? (current as { cause?: unknown }).cause : undefined
  }
  return false
}
