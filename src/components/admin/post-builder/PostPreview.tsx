"use client"

import { createPreviewSite, type PreviewBlock } from "@/lib/utils/admin-builder-preview"
import { SiteLayout } from "@/components/frontend/layout/site-layout"
import { RichTextBlock } from "@/components/frontend/pages/PageRichTextBlock"
import { FaqBlock } from "@/components/frontend/pages/PageFaqBlock"

interface PostBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface Post {
  id: string
  title: string
  slug: string
  meta_description?: string | null
  site_id: string
  featured_image?: string | null
  excerpt?: string | null
  is_published: boolean
}

interface Site {
  id: string
  name: string
  subdomain: string
  settings?: {
    navigation?: any
    footer?: any
  }
}

interface PostPreviewProps {
  blocks: PostBlock[]
  post?: Post
  site?: Site
  siteBlocks?: {
    navigation?: any
    footer?: any
  } | null
  className?: string
  blocksLoading?: boolean
}

export function PostPreview({
  blocks,
  post,
  site,
  siteBlocks,
  className = "",
  blocksLoading = false
}: PostPreviewProps) {
  // Convert post blocks to PreviewBlock format for the generic preview system
  const previewBlocks: PreviewBlock[] = blocks.map(block => ({
    id: block.id,
    type: block.type,
    content: block.content,
    display_order: 0 // Will be handled by block ordering
  }))

  // Create preview site - navigation and footer will be added from site.settings automatically
  const previewSite = createPreviewSite(previewBlocks, site)

  return (
    <div className={`overflow-x-hidden ${className}`}>
      <div 
        style={{
          zoom: 0.8,
          width: '100%',
          contain: 'layout style', // Create new containing block
          position: 'relative',
        }}
      >
        <div className="bg-background">
          {blocksLoading ? (
            // Preview skeleton loading state
            <div className="space-y-6 p-6">
              {/* Header skeleton */}
              <div className="space-y-4">
                <div className="h-8 bg-gray-200 rounded animate-pulse w-3/4"></div>
                <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2"></div>
              </div>
              
              {/* Content blocks skeleton */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-6 space-y-4">
                  <div className="h-6 bg-gray-200 rounded animate-pulse w-1/3"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-100 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-4/5"></div>
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-3/5"></div>
                  </div>
                  <div className="h-32 bg-gray-100 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          ) : blocks.length === 0 ? (
            <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
              <div className="text-center">
                <div className="text-lg font-medium mb-2">No blocks added yet</div>
                <div className="text-sm">Add blocks to see your post preview</div>
              </div>
            </div>
          ) : (
            <SiteLayout 
              navigation={site?.settings?.navigation} 
              footer={site?.settings?.footer}
              site={previewSite}
            >
              {/* Post Header */}
              <div className="max-w-4xl mx-auto px-6 py-12">
                <div className="text-center mb-12">
                  <h1 className="text-4xl font-bold mb-4">
                    {post?.title || 'Post Preview'}
                  </h1>
                  {post?.excerpt && (
                    <p className="text-xl text-muted-foreground">
                      {post.excerpt}
                    </p>
                  )}
                </div>

                {/* Post Content Blocks */}
                <div className="prose prose-lg max-w-none">
                  {blocks.map((block) => {
                    if (block.type === 'post-content') {
                      return (
                        <RichTextBlock
                          key={`post-content-${block.id}`}
                          content={block.content.content || 'Add your post content here...'}
                        />
                      )
                    }
                    
                    if (block.type === 'faq') {
                      return (
                        <FaqBlock
                          key={`faq-${block.id}`}
                          {...block.content}
                        />
                      )
                    }

                    // Fallback for other block types
                    return (
                      <div key={block.id} className="border rounded-lg p-6 my-6">
                        <h3 className="text-lg font-semibold mb-2">{block.title}</h3>
                        <div className="text-muted-foreground">
                          {block.type} block preview
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </SiteLayout>
          )}
        </div>
      </div>
    </div>
  )
}