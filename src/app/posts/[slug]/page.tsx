import { PostBlockRenderer } from "@/components/frontend/posts/PostBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { createClient } from '@supabase/supabase-js'
import { notFound } from "next/navigation"
import { getRelatedPostsData } from "@/lib/actions/posts/related-posts-actions"

// Create admin client for direct database queries
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

interface PostPageProps {
  params: Promise<{ 
    slug: string
  }>
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params
  
  // Get site data from headers
  const { success: siteSuccess, site } = await getSiteFromHeaders()
  
  if (!siteSuccess || !site) {
    notFound()
  }
  
  // Direct query to posts table - no bullshit
  const { data: post, error } = await supabaseAdmin
    .from('posts')
    .select('*')
    .eq('site_id', site.id)
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (!post || error) {
    notFound()
  }

  // Convert post blocks to array format like products
  let blocks: any[] = []
  let showFeaturedImage = true // Default to true
  try {
    const contentBlocks = post.content_blocks || {}
    // Extract show_featured_image setting
    showFeaturedImage = contentBlocks.show_featured_image !== false
    // Filter out the show_featured_image setting and get only actual blocks
    const blockValues = Object.values(contentBlocks).filter((block: any) => 
      block && typeof block === 'object' && block.type
    )
    blocks = blockValues.sort((a: any, b: any) => 
      (a.display_order || 0) - (b.display_order || 0)
    )
  } catch (error) {
    console.warn('Error loading post blocks:', error)
    blocks = []
  }

  const postWithBlocks = {
    ...post,
    blocks,
    show_featured_image: showFeaturedImage
  }

  // Pre-fetch related posts if any block uses the related-posts type
  let preloadedRelatedPosts = null
  const relatedPostsBlock = blocks.find((b: any) => b.type === 'related-posts')
  if (relatedPostsBlock) {
    const rpContent = relatedPostsBlock.content || {}
    const result = await getRelatedPostsData({
      siteId: site.id,
      excludePostId: post.id,
      sortBy: rpContent.sortBy || 'date',
      sortOrder: rpContent.sortOrder || 'desc',
      limit: rpContent.itemsToShow || 3,
    })
    if (result.success && result.data) {
      preloadedRelatedPosts = result.data
    }
  }

  return <PostBlockRenderer
    site={site}
    post={postWithBlocks}
    preloadedRelatedPosts={preloadedRelatedPosts}
  />
}

export async function generateMetadata({ params }: PostPageProps) {
  const { slug } = await params
  
  try {
    // Get site data from headers
    const { success: siteSuccess, site } = await getSiteFromHeaders()
    
    if (!siteSuccess || !site) {
      return {
        title: 'Post Not Found',
        description: 'The requested post could not be found.',
      }
    }
    
    // Direct query to posts table
    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .select('*')
      .eq('site_id', site.id)
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    if (!post || error) {
      return {
        title: 'Post Not Found',
        description: 'The requested post could not be found.',
      }
    }
    
    return {
      title: `${post.title} | ${site.name}`,
      description: post.meta_description || post.excerpt || `Read ${post.title} on ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Post Not Found',
      description: 'The requested post could not be found.',
    }
  }
}