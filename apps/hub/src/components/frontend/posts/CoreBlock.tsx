import { useMemo, type ReactNode } from "react"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { CORE_STYLE_RENDERERS } from "./core-styles"
import { RelatedPostsBlock } from "./RelatedPostsBlock"
import { TableOfContentsBlock } from "./table-of-content/TableOfContentsBlock"
import type { RelatedPostsData } from "@/lib/actions/posts/related-posts-actions"
import type { TableOfContentsItem } from "./table-of-content/table-of-contents-utils"
import type { SponsorPublic } from "@/lib/actions/sponsors/sponsor-actions"
import { cn } from "@/lib/utils/tailwind"

interface CoreBlockProps {
  blocks: Array<{
    id: string
    type: string
    content: Record<string, any>
  }>
  post: {
    title: string
    excerpt?: string | null
    featured_image?: string | null
    show_featured_image?: boolean
    show_excerpt?: boolean
    author?: {
      name?: string | null
      image?: string | null
    } | null
    created_at: string
  }
  siteId?: string
  currentPostId?: string
  preloadedRelatedPosts?: RelatedPostsData | null
  tableOfContentsItems?: TableOfContentsItem[]
  coreHtmlByBlockId?: Record<string, string>
  sponsorsById?: Record<string, SponsorPublic>
  postId?: string
  hasFixedNavigation?: boolean
  siteWidth?: 'full' | 'custom'
  customWidth?: number
  container?: boolean
  renderCoreBody?: (block: { id: string; type: string; content: Record<string, any> }, bodyHtml: string) => ReactNode
  renderBlockOverlay?: (block: { id: string; type: string; content: Record<string, any> }) => ReactNode
}

export function CoreBlock({
  blocks,
  post,
  siteId,
  currentPostId,
  preloadedRelatedPosts,
  tableOfContentsItems = [],
  coreHtmlByBlockId = {},
  sponsorsById = {},
  postId,
  hasFixedNavigation = false,
  siteWidth = 'custom',
  customWidth,
  container = true,
  renderCoreBody,
  renderBlockOverlay,
}: CoreBlockProps) {
  return (
    <>
      {blocks.map((block) => {
        const content = (
          <PostBlockContent
            key={block.id}
            block={block}
            post={post}
            siteId={siteId}
            currentPostId={currentPostId}
            preloadedRelatedPosts={preloadedRelatedPosts}
            tableOfContentsItems={tableOfContentsItems}
            coreHtmlByBlockId={coreHtmlByBlockId}
            sponsorsById={sponsorsById}
            postId={postId}
            hasFixedNavigation={hasFixedNavigation}
            renderCoreBody={renderCoreBody}
            renderBlockOverlay={renderBlockOverlay}
          />
        )

        if (!container) {
          return content
        }

        return (
          <BlockContainer
            key={block.id}
            siteWidth={siteWidth}
            customWidth={customWidth}
          >
            {content}
          </BlockContainer>
        )
      })}
    </>
  )
}

function PostBlockContent({
  block,
  post,
  siteId,
  currentPostId,
  preloadedRelatedPosts,
  tableOfContentsItems,
  coreHtmlByBlockId,
  sponsorsById,
  postId,
  hasFixedNavigation,
  renderCoreBody,
  renderBlockOverlay,
}: {
  block: { id: string; type: string; content: Record<string, any> }
  post: {
    title: string
    excerpt?: string | null
    featured_image?: string | null
    show_featured_image?: boolean
    show_excerpt?: boolean
    author?: { name?: string | null; image?: string | null } | null
    created_at: string
  }
  siteId?: string
  currentPostId?: string
  preloadedRelatedPosts?: RelatedPostsData | null
  tableOfContentsItems: TableOfContentsItem[]
  coreHtmlByBlockId: Record<string, string>
  sponsorsById: Record<string, SponsorPublic>
  postId?: string
  hasFixedNavigation: boolean
  renderCoreBody?: (block: { id: string; type: string; content: Record<string, any> }, bodyHtml: string) => ReactNode
  renderBlockOverlay?: (block: { id: string; type: string; content: Record<string, any> }) => ReactNode
}) {
  const isStickyBlock = block.type === 'table-of-contents' && block.content?.sticky !== false

  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      className={cn(
        "relative group/post-preview-block",
        isStickyBlock && "lg:sticky lg:self-start",
        isStickyBlock && (hasFixedNavigation ? "lg:top-28" : "lg:top-10")
      )}
    >
      {renderBlockOverlay?.(block)}

      {block.type === 'core' && (
        <CoreStyled
          block={block}
          post={post}
          bodyHtml={coreHtmlByBlockId[block.id]}
          sponsorsById={sponsorsById}
          postId={postId}
          renderCoreBody={renderCoreBody}
        />
      )}

      {block.type === 'related-posts' && siteId && currentPostId && (
        <RelatedPostsBlock
          content={block.content}
          siteId={siteId}
          currentPostId={currentPostId}
          preloadedData={preloadedRelatedPosts}
        />
      )}

      {block.type === 'table-of-contents' && (
        <TableOfContentsBlock content={block.content} items={tableOfContentsItems} />
      )}
    </div>
  )
}

/** Renders core block using the style renderer registry */
function CoreStyled({ block, post, bodyHtml, sponsorsById, postId, renderCoreBody }: {
  block: { id: string; type: string; content: Record<string, any> }
  post: {
    title: string
    excerpt?: string | null
    featured_image?: string | null
    show_featured_image?: boolean
    show_excerpt?: boolean
    author?: { name?: string | null; image?: string | null } | null
    created_at: string
  }
  bodyHtml?: string
  sponsorsById: Record<string, SponsorPublic>
  postId?: string
  renderCoreBody?: (block: { id: string; type: string; content: Record<string, any> }, bodyHtml: string) => ReactNode
}) {
  const coreStyle = block.content.coreStyle || 'default'

  const resolvedConfig = useMemo(() => {
    const styleConfig = block.content.styleConfig || {}
    if (styleConfig[coreStyle]) {
      return styleConfig[coreStyle]
    }
    return {}
  }, [block.content.styleConfig, coreStyle])

  const StyleRenderer = CORE_STYLE_RENDERERS[coreStyle] || CORE_STYLE_RENDERERS.default
  const resolvedBodyHtml = bodyHtml ?? block.content.body ?? ''

  return (
    <StyleRenderer
      config={resolvedConfig}
      sharedContent={{
        title: post.title,
        excerpt: post.excerpt,
        featuredImage: post.featured_image,
        showFeaturedImage: block.content.showFeaturedImage ?? post.show_featured_image,
        showExcerpt: block.content.showExcerpt ?? post.show_excerpt,
        author: post.author,
        createdAt: post.created_at,
        showAuthor: block.content.showAuthor ?? true,
        showDate: block.content.showDate ?? true,
        body: resolvedBodyHtml,
      }}
      sponsorsById={sponsorsById}
      postId={postId}
    >
      {renderCoreBody?.(block, resolvedBodyHtml)}
    </StyleRenderer>
  )
}
