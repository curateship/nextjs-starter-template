'use server'

import { eq, and, ne, asc, desc } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { posts } from '@/lib/db/schema'

export interface RelatedPostsData {
  posts: Array<{
    id: string
    title: string
    slug: string
    featured_image: string | null
    excerpt: string | null
    created_at: string
  }>
  totalCount: number
}

const getCachedRelatedPosts = unstable_cache(
  async (siteId: string, excludePostId: string, sortBy: string, sortOrder: string, limit: number) => {
    const orderByColumn = sortBy === 'title' ? posts.title : posts.createdAt
    const orderByDir = sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn)

    const data = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        featuredImage: posts.featuredImage,
        excerpt: posts.excerpt,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(
        and(
          eq(posts.siteId, siteId),
          eq(posts.isPublished, true),
          ne(posts.id, excludePostId)
        )
      )
      .orderBy(orderByDir)
      .limit(limit)

    const mapped = data.map(row => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      featured_image: row.featuredImage,
      excerpt: row.excerpt,
      created_at: row.createdAt.toISOString(),
    }))

    return {
      posts: mapped,
      totalCount: mapped.length
    }
  },
  ['related-posts-data'],
  {
    revalidate: 3600,
    tags: ['related-posts', 'all']
  }
)

export async function getRelatedPostsData(params: {
  siteId: string
  excludePostId: string
  sortBy: 'date' | 'title'
  sortOrder: 'asc' | 'desc'
  limit?: number
}): Promise<{
  success: boolean
  data?: RelatedPostsData
  error?: string
}> {
  try {
    const { siteId, excludePostId, sortBy, sortOrder, limit = 3 } = params

    if (!siteId) {
      return { success: false, error: 'Site ID is required' }
    }

    const data = await getCachedRelatedPosts(siteId, excludePostId, sortBy, sortOrder, limit)

    return { success: true, data }
  } catch (error) {
    console.error('Error loading related posts:', error)
    return { success: false, error: 'Failed to load related posts' }
  }
}
