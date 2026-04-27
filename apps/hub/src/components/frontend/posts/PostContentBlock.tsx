import { useMemo } from "react"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { POST_CONTENT_STYLE_RENDERERS } from "./post-content-styles"
import { RelatedPostsBlock } from "./RelatedPostsBlock"
import { TableOfContentsBlock } from "./table-of-content/TableOfContentsBlock"
import type { RelatedPostsData } from "@/lib/actions/posts/related-posts-actions"
import type { TableOfContentsItem } from "./table-of-content/table-of-contents-utils"
import { cn } from "@/lib/utils/tailwind"

interface PostContentBlockProps {
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
  postContentHtmlByBlockId?: Record<string, string>
  hasFixedNavigation?: boolean
  siteWidth?: 'full' | 'custom'
  customWidth?: number
  container?: boolean
}

export function PostContentBlock({
  blocks,
  post,
  siteId,
  currentPostId,
  preloadedRelatedPosts,
  tableOfContentsItems = [],
  postContentHtmlByBlockId = {},
  hasFixedNavigation = false,
  siteWidth = 'custom',
  customWidth,
  container = true,
}: PostContentBlockProps) {
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
            postContentHtmlByBlockId={postContentHtmlByBlockId}
            hasFixedNavigation={hasFixedNavigation}
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
  postContentHtmlByBlockId,
  hasFixedNavigation,
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
  postContentHtmlByBlockId: Record<string, string>
  hasFixedNavigation: boolean
}) {
  const isStickyBlock = block.type === 'table-of-contents' && block.content?.sticky !== false

  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      className={cn(
        isStickyBlock && "lg:sticky lg:self-start",
        isStickyBlock && (hasFixedNavigation ? "lg:top-28" : "lg:top-10")
      )}
    >
      {block.type === 'post-content' && (
        <PostContentStyled
          block={block}
          post={post}
          bodyHtml={postContentHtmlByBlockId[block.id]}
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

/** Renders post-content block using the style renderer registry */
function PostContentStyled({ block, post, bodyHtml }: {
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
}) {
  const postContentStyle = block.content.postContentStyle || 'default'
  const styleConfig = block.content.styleConfig || {}

  const resolvedConfig = useMemo(() => {
    if (styleConfig[postContentStyle]) {
      return styleConfig[postContentStyle]
    }
    return {}
  }, [postContentStyle, styleConfig])

  const StyleRenderer = POST_CONTENT_STYLE_RENDERERS[postContentStyle] || POST_CONTENT_STYLE_RENDERERS.default

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
        body: bodyHtml ?? block.content.body,
      }}
    />
  )
}
