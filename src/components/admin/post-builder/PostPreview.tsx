"use client"

import { PostBlockRenderer } from "@/components/frontend/posts/PostBlockRenderer"
import { createPreviewSite, type PreviewBlock } from "@/lib/utils/admin-builder-preview"

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

interface PostPreviewProps {
  blocks: PostBlock[]
  post?: Post
  site?: {
    id: string
    name: string
    subdomain: string
    settings?: {
      navigation?: any
      footer?: any
      [key: string]: any
    }
  }
  className?: string
  blocksLoading?: boolean
}

export function PostPreview({ blocks, post, site, className = "", blocksLoading = false }: PostPreviewProps) {
  // Convert post blocks to PreviewBlock format for the generic preview system
  const previewBlocks: PreviewBlock[] = blocks.map(block => ({
    id: block.id,
    type: block.type,
    content: block.content,
    display_order: 0 // Will be handled by block ordering
  }))

  // Create preview site - navigation and footer will be added from site.settings automatically
  const previewSite = createPreviewSite(previewBlocks, site)

  // Create mock post data
  const previewPost = {
    id: post?.id || 'preview',
    title: post?.title || 'Preview Post',
    slug: post?.slug || 'preview',
    meta_description: post?.meta_description || null,
    site_id: post?.site_id || 'preview',
    featured_image: post?.featured_image || null,
    excerpt: post?.excerpt || null,
    is_published: post?.is_published || false,
    blocks: previewBlocks.map(block => ({
      id: block.id,
      type: block.type,
      content: block.content,
      display_order: block.display_order || 0
    }))
  }
  
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
                <div className="h-8 bg-muted rounded animate-pulse w-3/4"></div>
                <div className="h-4 bg-muted/60 rounded animate-pulse w-1/2"></div>
              </div>
              
              {/* Content blocks skeleton */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-6 space-y-4">
                  <div className="h-6 bg-muted rounded animate-pulse w-1/3"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted/60 rounded animate-pulse"></div>
                    <div className="h-4 bg-muted/60 rounded animate-pulse w-4/5"></div>
                    <div className="h-4 bg-muted/60 rounded animate-pulse w-3/5"></div>
                  </div>
                  <div className="h-32 bg-muted/60 rounded animate-pulse"></div>
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
            <PostBlockRenderer site={previewSite} post={previewPost} />
          )}
        </div>
      </div>
    </div>
  )
}