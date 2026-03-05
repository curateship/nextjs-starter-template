'use server'

import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    let orderColumn = 'created_at'
    if (sortBy === 'title') {
      orderColumn = 'title'
    }

    const { data: posts, error } = await supabaseAdmin
      .from('posts')
      .select('id, title, slug, featured_image, excerpt, created_at')
      .eq('site_id', siteId)
      .eq('is_published', true)
      .neq('id', excludePostId)
      .order(orderColumn, { ascending: sortOrder === 'asc' })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to load related posts: ${error.message}`)
    }

    return {
      posts: posts || [],
      totalCount: posts?.length || 0
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
