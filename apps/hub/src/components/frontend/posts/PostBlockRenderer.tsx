import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { FrontendBreadcrumbs } from "@/components/frontend/layout/FrontendBreadcrumbs"
import { PostContentBlock } from "@/components/frontend/posts/PostContentBlock"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { RelatedPostsData } from "@/lib/actions/posts/related-posts-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { resolveSiteChrome } from "@/lib/utils/site-structure"

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
  breadcrumbs?: FrontendBreadcrumbItem[]
  isPreview?: boolean
  hideSiteChrome?: boolean
}

export function PostBlockRenderer({ site, post, preloadedRelatedPosts, breadcrumbs = [], isPreview = false, hideSiteChrome = false }: PostBlockRendererProps) {
  const { blocks: postBlocks = [] } = post
  const siteChrome = resolveSiteChrome(site.settings)
  
  // Sort post blocks by display_order (force numerical sorting)
  const sortedBlocks = postBlocks.sort((a, b) => Number(a.display_order) - Number(b.display_order))
  
  // Get site width from site settings
  const siteWidth = site.settings?.site_width || 'custom'
  const customWidth = site.settings?.custom_width

  return (
      <SiteLayout navigation={siteChrome.navigation || undefined} footer={siteChrome.footer || undefined} site={site} isPreview={isPreview} hideChrome={hideSiteChrome}>
      <FrontendBreadcrumbs items={breadcrumbs} siteWidth={siteWidth as 'full' | 'custom'} customWidth={customWidth} />
      
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
