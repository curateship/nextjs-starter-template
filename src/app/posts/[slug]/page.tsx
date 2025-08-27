import { PostBlockRenderer } from "@/components/frontend/posts/PostBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { createClient } from '@supabase/supabase-js'
import { notFound } from "next/navigation"

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

  // Structure post blocks from content_blocks JSON
  const postBlocks: Record<string, any> = post.content_blocks || {}

  return (
    <div className="min-h-screen">
      <PostBlockRenderer blocks={postBlocks} />
    </div>
  )
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