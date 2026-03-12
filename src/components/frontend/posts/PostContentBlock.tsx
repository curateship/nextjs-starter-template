import { useMemo } from "react"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { POST_CONTENT_STYLE_RENDERERS } from "./post-content-styles"
import { RelatedPostsBlock } from "./RelatedPostsBlock"
import type { RelatedPostsData } from "@/lib/actions/posts/related-posts-actions"

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
    created_at: string
  }
  siteId?: string
  currentPostId?: string
  preloadedRelatedPosts?: RelatedPostsData | null
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function PostContentBlock({
  blocks,
  post,
  siteId,
  currentPostId,
  preloadedRelatedPosts,
  siteWidth = 'custom',
  customWidth
}: PostContentBlockProps) {
  return (
    <>
      {blocks.map((block) => (
        <div key={block.id} data-block-id={block.id} data-block-type={block.type}>
          <BlockContainer
            siteWidth={siteWidth}
            customWidth={customWidth}
          >
            <div className="mb-10">
              {block.type === 'post-content' && (
                <PostContentStyled block={block} post={post} />
              )}

              {block.type === 'image' && block.content.url && (
                <div className="my-8">
                  <img
                    src={block.content.url}
                    alt={block.content.alt || ''}
                    className="aspect-video w-full rounded-md object-cover"
                  />
                  {block.content.caption && (
                    <p className="text-center text-sm text-muted-foreground mt-2">
                      {block.content.caption}
                    </p>
                  )}
                </div>
              )}

              {block.type === 'code' && block.content.code && (
                <div>
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                    <code className={`language-${block.content.language || 'javascript'}`}>
                      {block.content.code}
                    </code>
                  </pre>
                </div>
              )}

              {block.type === 'quote' && block.content.text && (
                <div className="prose dark:prose-invert max-w-none">
                  <blockquote>
                    &ldquo;{block.content.text}&rdquo;
                    {(block.content.author || block.content.source) && (
                      <cite className="text-sm text-muted-foreground not-italic block mt-2">
                        {block.content.author && `— ${block.content.author}`}
                        {block.content.source && `, ${block.content.source}`}
                      </cite>
                    )}
                  </blockquote>
                </div>
              )}

              {block.type === 'divider' && (
                <hr className="my-8 border-t border-border" />
              )}

              {block.type === 'related-posts' && siteId && currentPostId && (
                <RelatedPostsBlock
                  content={block.content}
                  siteId={siteId}
                  currentPostId={currentPostId}
                  preloadedData={preloadedRelatedPosts}
                />
              )}
            </div>
          </BlockContainer>
        </div>
      ))}
    </>
  )
}

/** Renders post-content block using the style renderer registry */
function PostContentStyled({ block, post }: {
  block: { id: string; type: string; content: Record<string, any> }
  post: { title: string; excerpt?: string | null; featured_image?: string | null; show_featured_image?: boolean; created_at: string }
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
        showFeaturedImage: post.show_featured_image,
        createdAt: post.created_at,
        showAuthor: block.content.showAuthor ?? true,
        showDate: block.content.showDate ?? true,
        body: block.content.body,
      }}
    />
  )
}
