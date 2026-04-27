"use client"

import { useEffect, useState } from "react"
import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { PostBlockRenderer } from "@/components/frontend/posts/PostBlockRenderer"
import {
  createPreviewEntityBlocks,
  createPreviewSite,
  normalizePreviewBlocks,
} from "@/lib/utils/admin-builder-preview"
import { getCurrentUser } from "@/lib/actions/auth/auth-actions"
import { getContentBreadcrumbPreviewAction } from "@/lib/actions/categories/category-relationship-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"

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
  show_excerpt?: boolean
  excerpt?: string | null
  author?: {
    name?: string | null
    image?: string | null
  } | null
  is_published: boolean
  updated_at?: string
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
  const [breadcrumbs, setBreadcrumbs] = useState<FrontendBreadcrumbItem[]>([])
  const [author, setAuthor] = useState<{ name?: string | null; image?: string | null } | null>(null)
  const previewBlocks = normalizePreviewBlocks(blocks)
  const previewSite = createPreviewSite(previewBlocks, site)

  useEffect(() => {
    let cancelled = false

    getCurrentUser().then((user) => {
      if (cancelled) return
      setAuthor(user ? { name: user.displayName || user.name, image: user.image } : null)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!post?.id || post.id === "preview" || site?.settings?.breadcrumbs?.posts === false) {
      setBreadcrumbs([])
      return
    }

    getContentBreadcrumbPreviewAction(post.id, 'post').then(({ data }) => {
      if (!cancelled) setBreadcrumbs(data || [])
    })

    return () => {
      cancelled = true
    }
  }, [post?.id, post?.updated_at, site?.settings?.breadcrumbs?.posts])

  const previewPost = {
    id: post?.id || "preview",
    title: post?.title || "Preview Post",
    slug: post?.slug || "preview",
    meta_description: post?.meta_description || null,
    site_id: post?.site_id || "preview",
    featured_image: post?.featured_image || null,
    show_featured_image: post?.show_featured_image !== false,
    show_excerpt: post?.show_excerpt !== false,
    excerpt: post?.excerpt || null,
    author: post?.author || author,
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
      <PostBlockRenderer site={previewSite} post={previewPost} breadcrumbs={breadcrumbs} isPreview hideSiteChrome />
    </BuilderPreviewShell>
  )
}
