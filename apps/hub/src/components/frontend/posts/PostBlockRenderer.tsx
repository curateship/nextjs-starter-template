import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { FrontendBreadcrumbs } from "@/components/frontend/layout/FrontendBreadcrumbs"
import { PostContentBlock } from "@/components/frontend/posts/PostContentBlock"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { RelatedPostsData } from "@/lib/actions/posts/related-posts-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { getPostLayoutColumn } from "@/lib/actions/posts/post-layout"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { toPublicSiteClientProps } from "@/lib/utils/public-site-client"
import { cn } from "@/lib/utils/tailwind"
import { preparePostTableOfContents } from "./table-of-content/table-of-contents-utils"

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
    author?: {
      name?: string | null
      image?: string | null
    } | null
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
  const hasFixedNavigation = Boolean(siteChrome.navigation && !isPreview && !hideSiteChrome)
  
  // Sort post blocks by display_order (force numerical sorting)
  const sortedBlocks = [...postBlocks].sort((a, b) => Number(a.display_order) - Number(b.display_order))
  
  // Get site width from site settings
  const siteWidth = (site.settings?.site_width || 'custom') as 'full' | 'custom'
  const customWidth = site.settings?.custom_width
  const publicSite = toPublicSiteClientProps(site)
  const mainBlocks = sortedBlocks.filter((block) => getPostLayoutColumn(block) === 'main')
  const sidebarBlocks = sortedBlocks.filter((block) => getPostLayoutColumn(block) === 'sidebar')
  const isStickyBlock = (block: typeof sortedBlocks[number]) =>
    block.type === 'table-of-contents' && block.content?.sticky !== false
  const mainHasStickyBlock = mainBlocks.some(isStickyBlock)
  const sidebarHasStickyBlock = sidebarBlocks.some(isStickyBlock)
  const tableOfContents = preparePostTableOfContents(sortedBlocks)
  const outerContainerStyle = siteWidth === 'custom'
    ? { maxWidth: `${customWidth || 1152}px` }
    : undefined
  const containerClassName = siteWidth === 'custom' ? "mx-auto px-6 mt-10" : "px-6 mt-8"
  const postContent = {
    title: post.title,
    excerpt: post.excerpt,
    featured_image: post.featured_image,
    show_featured_image: post.show_featured_image,
    author: post.author,
    created_at: post.created_at || new Date().toISOString()
  }
  const renderPostBlocks = (blocks: typeof sortedBlocks, container = true) => (
    <PostContentBlock
      blocks={blocks}
      post={postContent}
      siteId={post.site_id}
      currentPostId={post.id}
      preloadedRelatedPosts={preloadedRelatedPosts}
      tableOfContentsItems={tableOfContents.items}
      postContentHtmlByBlockId={tableOfContents.bodyHtmlByBlockId}
      hasFixedNavigation={hasFixedNavigation}
      siteWidth={siteWidth}
      customWidth={customWidth}
      container={container}
    />
  )

  return (
      <SiteLayout navigation={siteChrome.navigation || undefined} footer={siteChrome.footer || undefined} site={publicSite} isPreview={isPreview} hideChrome={hideSiteChrome}>
      <FrontendBreadcrumbs items={breadcrumbs} siteWidth={siteWidth} customWidth={customWidth} />

      {sidebarBlocks.length > 0 && mainBlocks.length > 0 ? (
        <div className={containerClassName} style={outerContainerStyle}>
          <div className="grid gap-6 lg:gap-10 lg:grid-cols-[minmax(0,1.36fr)_minmax(224px,0.64fr)] lg:items-start">
            <div className={cn("lg:order-2", sidebarHasStickyBlock && "lg:self-stretch")}>
              {renderPostBlocks(sidebarBlocks, false)}
            </div>
            <div className={cn("lg:order-1", mainHasStickyBlock && "lg:self-stretch")}>
              {renderPostBlocks(mainBlocks, false)}
            </div>
          </div>
        </div>
      ) : (
        <div className={containerClassName} style={outerContainerStyle}>
          {renderPostBlocks([...sidebarBlocks, ...mainBlocks], false)}
        </div>
      )}

      </SiteLayout>
  )
}
