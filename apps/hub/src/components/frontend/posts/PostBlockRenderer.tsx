import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { PostContentBlock } from "@/components/frontend/posts/PostContentBlock"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { RelatedPostsData } from "@/lib/actions/posts/related-posts-actions"

interface PostBlockRendererProps {
  site: SiteWithBlocks
  post: {
    id: string
    title: string
    slug: string
    meta_description?: string | null
    site_id: string
    featured_image?: string | null
    show_featured_image?: boolean
    excerpt?: string | null
    is_published: boolean
    created_at?: string
    updated_at?: string
    blocks: Array<{
      id: string
      type: string
      content: Record<string, any>
      display_order: number
    }>
  }
  preloadedRelatedPosts?: RelatedPostsData | null
}

export function PostBlockRenderer({ site, post, preloadedRelatedPosts }: PostBlockRendererProps) {
  const { blocks: siteBlocks = [] } = site
  const { blocks: postBlocks = [] } = post
  
  // Sort post blocks by display_order (force numerical sorting)
  const sortedBlocks = postBlocks.sort((a, b) => Number(a.display_order) - Number(b.display_order))
  
  // Find navigation and footer from site blocks
  const navigationBlock = siteBlocks.find((block: any) => block.type === 'navigation')
  const footerBlock = siteBlocks.find((block: any) => block.type === 'footer')
  
  // Get site width from site settings
  const siteWidth = site.settings?.site_width || 'custom'
  const customWidth = site.settings?.custom_width

  return (
      <SiteLayout navigation={navigationBlock?.content} footer={footerBlock?.content} site={site}>
      
      {/* Post Header */}
      <PostContentBlock
        blocks={sortedBlocks}
        post={{
          title: post.title,
          excerpt: post.excerpt,
          featured_image: post.featured_image,
          show_featured_image: post.show_featured_image,
          created_at: post.created_at || new Date().toISOString()
        }}
        siteId={post.site_id}
        currentPostId={post.id}
        preloadedRelatedPosts={preloadedRelatedPosts}
        siteWidth={siteWidth}
        customWidth={customWidth}
      />
      
      </SiteLayout>
  )
}