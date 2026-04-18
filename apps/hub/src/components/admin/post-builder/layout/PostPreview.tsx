"use client"

import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { PostBlockRenderer } from "@/components/frontend/posts/PostBlockRenderer"
import {
  createPreviewEntityBlocks,
  createPreviewSite,
  normalizePreviewBlocks,
} from "@/lib/utils/admin-builder-preview"

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
  show_featured_image?: boolean
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
  allBlocks?: PostBlock[]
  onSelectBlock?: (block: PostBlock) => void
}

export function PostPreview({
  blocks,
  post,
  site,
  className = "",
  blocksLoading = false,
  allBlocks,
  onSelectBlock,
}: PostPreviewProps) {
  const previewBlocks = normalizePreviewBlocks(blocks)
  const previewSite = createPreviewSite(previewBlocks, site)

  const previewPost = {
    id: post?.id || "preview",
    title: post?.title || "Preview Post",
    slug: post?.slug || "preview",
    meta_description: post?.meta_description || null,
    site_id: post?.site_id || "preview",
    featured_image: post?.featured_image || null,
    show_featured_image: post?.show_featured_image !== false,
    excerpt: post?.excerpt || null,
    is_published: post?.is_published || false,
    blocks: createPreviewEntityBlocks(previewBlocks),
  }

  return (
    <BuilderPreviewShell
      allBlocks={allBlocks}
      className={className}
      emptyDescription="Add blocks to see your post preview"
      isEmpty={blocks.length === 0}
      isLoading={blocksLoading}
      onSelectBlock={onSelectBlock}
      site={site}
      showSiteChrome
    >
      <PostBlockRenderer site={previewSite} post={previewPost} isPreview hideSiteChrome />
    </BuilderPreviewShell>
  )
}
