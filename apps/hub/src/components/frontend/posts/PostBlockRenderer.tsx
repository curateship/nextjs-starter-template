import { SiteLayout } from "@/components/frontend/layout/site-layout"
import type { ReactNode } from "react"
import { FrontendBreadcrumbs } from "@/components/frontend/layout/FrontendBreadcrumbs"
import { CoreBlock } from "@/components/frontend/posts/CoreBlock"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { RelatedPostsData } from "@/lib/actions/posts/related-posts-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { getPostLayoutColumn } from "@/lib/actions/posts/post-layout"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { toPublicSiteClientProps } from "@/lib/utils/public-site-client"
import { cn } from "@/lib/utils/tailwind"
import { preparePostTableOfContents } from "./table-of-content/table-of-contents-utils"
import type { SponsorPublic } from "@/lib/actions/sponsors/sponsor-actions"
import { getRenderBlockContent, prepareBlocksForRender } from '@/lib/utils/frontend-blocks'

const SUPPORTED_POST_BLOCK_TYPES = ['core', 'related-posts', 'table-of-contents']

type PostRendererBlock = {
  id: string
  type: string
  content: Record<string, any>
  display_order?: number
}

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
    show_excerpt?: boolean
    excerpt?: string | null
    author?: {
      name?: string | null
      image?: string | null
    } | null
    is_published: boolean
    created_at?: string
    updated_at?: string
    blocks: PostRendererBlock[]
  }
  preloadedRelatedPosts?: RelatedPostsData | null
  breadcrumbs?: FrontendBreadcrumbItem[]
  sponsorsById?: Record<string, SponsorPublic>
  isPreview?: boolean
  hideSiteChrome?: boolean
  renderCoreBody?: (block: PostRendererBlock, bodyHtml: string) => ReactNode
  renderBlockOverlay?: (block: PostRendererBlock) => ReactNode
}

export function PostBlockRenderer({
  site,
  post,
  preloadedRelatedPosts,
  breadcrumbs = [],
  sponsorsById = {},
  isPreview = false,
  hideSiteChrome = false,
  renderCoreBody,
  renderBlockOverlay,
}: PostBlockRendererProps) {
  const { blocks: postBlocks = [] } = post
  const siteChrome = resolveSiteChrome(site.settings)
  const hasFixedNavigation = Boolean(siteChrome.navigation && !isPreview && !hideSiteChrome)
  // Sorting + hidden-block rules live in the shared frontend-blocks helper
  const visibleBlocks = prepareBlocksForRender(postBlocks, isPreview)
    .filter((block) => SUPPORTED_POST_BLOCK_TYPES.includes(block.type))
    .map((block) => ({ ...block, content: getRenderBlockContent(block, isPreview) }))
  
  // Get site width from site settings
  const siteWidth = (site.settings?.site_width || 'custom') as 'full' | 'custom'
  const customWidth = site.settings?.custom_width
  const publicSite = toPublicSiteClientProps(site)
  const mainBlocks = visibleBlocks.filter((block) => getPostLayoutColumn(block) === 'main')
  const sidebarBlocks = visibleBlocks.filter((block) => getPostLayoutColumn(block) === 'sidebar')
  const isStickyBlock = (block: typeof visibleBlocks[number]) =>
    block.type === 'table-of-contents' && block.content?.sticky !== false
  const mainHasStickyBlock = mainBlocks.some(isStickyBlock)
  const sidebarHasStickyBlock = sidebarBlocks.some(isStickyBlock)
  const tableOfContents = preparePostTableOfContents(visibleBlocks)
  const outerContainerStyle = siteWidth === 'custom'
    ? { maxWidth: `${customWidth || 1152}px` }
    : undefined
  const containerClassName = siteWidth === 'custom' ? "mx-auto px-6" : "px-6"
  const core = {
    title: post.title,
    excerpt: post.excerpt,
    featured_image: post.featured_image,
    show_featured_image: post.show_featured_image,
    show_excerpt: post.show_excerpt,
    author: post.author,
    created_at: post.created_at || new Date().toISOString()
  }
  const renderPostBlocks = (blocks: typeof visibleBlocks, container = true) => (
    <CoreBlock
      blocks={blocks}
      post={core}
      siteId={post.site_id}
      currentPostId={post.id}
      preloadedRelatedPosts={preloadedRelatedPosts}
      tableOfContentsItems={tableOfContents.items}
      coreHtmlByBlockId={tableOfContents.bodyHtmlByBlockId}
      hasFixedNavigation={hasFixedNavigation}
      sponsorsById={sponsorsById}
      postId={post.id}
      siteWidth={siteWidth}
      customWidth={customWidth}
      container={container}
      renderCoreBody={renderCoreBody}
      renderBlockOverlay={renderBlockOverlay}
    />
  )

  return (
      <SiteLayout navigation={siteChrome.navigation || undefined} footer={siteChrome.footer || undefined} site={publicSite} isPreview={isPreview} hideChrome={hideSiteChrome}>
      <FrontendBreadcrumbs items={breadcrumbs} siteWidth={siteWidth} customWidth={customWidth} />

      {sidebarBlocks.length > 0 && mainBlocks.length > 0 ? (
        <div className={containerClassName} style={outerContainerStyle}>
          <div className="grid gap-6 lg:gap-10 lg:grid-cols-[minmax(0,1.36fr)_minmax(224px,0.64fr)] lg:items-start">
            <div className={cn("space-y-8 lg:order-2 lg:space-y-10", sidebarHasStickyBlock && "lg:self-stretch")}>
              {renderPostBlocks(sidebarBlocks, false)}
            </div>
            <div className={cn("space-y-8 lg:order-1 lg:space-y-10", mainHasStickyBlock && "lg:self-stretch")}>
              {renderPostBlocks(mainBlocks, false)}
            </div>
          </div>
        </div>
      ) : (
        <div className={cn(containerClassName, "space-y-6 lg:space-y-10")} style={outerContainerStyle}>
          {renderPostBlocks([...sidebarBlocks, ...mainBlocks], false)}
        </div>
      )}

      </SiteLayout>
  )
}
