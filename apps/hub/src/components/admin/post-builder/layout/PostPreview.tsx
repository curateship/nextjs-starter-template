"use client"

import { useEffect, useState } from "react"
import { Settings } from "lucide-react"
import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { PostBlockRenderer } from "@/components/frontend/posts/PostBlockRenderer"
import { Button } from "@/components/ui/button"
import {
  createPreviewEntityBlocks,
  createPreviewSite,
  normalizePreviewBlocks,
} from "@/lib/utils/admin-builder-preview"
import { getCurrentUser } from "@/lib/actions/auth/auth-actions"
import { getContentBreadcrumbPreviewAction } from "@/lib/actions/categories/category-relationship-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { cn } from "@/lib/utils/tailwind"

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
  selectedBlock?: PostBlock | null
  onSelectBlock?: (block: PostBlock) => void
  onUpdateCoreBody?: (blockId: string, htmlContent: string) => void
}

export function PostPreview({
  blocks,
  post,
  site,
  className = "",
  blocksLoading = false,
  allBlocks,
  selectedBlock,
  onSelectBlock,
  onUpdateCoreBody,
}: PostPreviewProps) {
  const [breadcrumbs, setBreadcrumbs] = useState<FrontendBreadcrumbItem[]>([])
  const [author, setAuthor] = useState<{ name?: string | null; image?: string | null } | null>(null)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const previewBlocks = normalizePreviewBlocks(blocks)
  const previewSite = createPreviewSite(previewBlocks, site)
  const canInlineEdit = Boolean(onUpdateCoreBody && onSelectBlock)

  const getEditableBlock = (block: { id: string; type: string; content: Record<string, any> }) =>
    allBlocks?.find(item => item.id === block.id) ||
    blocks.find(item => item.id === block.id) || {
      id: block.id,
      type: block.type,
      title: block.type,
      content: block.content,
    }

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

  useEffect(() => {
    if (selectedBlock) {
      setEditingBlockId(null)
    }
  }, [selectedBlock])

  useEffect(() => {
    if (!editingBlockId) return

    const editingBlock = blocks.find((block) => block.id === editingBlockId)
    if (!editingBlock || editingBlock.type !== "core") {
      setEditingBlockId(null)
    }
  }, [blocks, editingBlockId])

  useEffect(() => {
    if (!editingBlockId) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      const targetElement =
        target instanceof Element ? target : target instanceof Node ? target.parentElement : null

      if (!targetElement) return

      if (
        targetElement.closest('[data-post-inline-editor-shell="true"]') ||
        targetElement.closest('[data-newsletter-inline-editor-menu="true"]') ||
        targetElement.closest('[data-media-picker-dialog="true"]') ||
        targetElement.closest('[data-newsletter-inline-link-dialog="true"]')
      ) {
        return
      }

      setEditingBlockId(null)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [editingBlockId])

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
      <PostBlockRenderer
        site={previewSite}
        post={previewPost}
        breadcrumbs={breadcrumbs}
        isPreview
        hideSiteChrome
        renderCoreBody={canInlineEdit ? (block) => {
          const editorContent = {
            ...block.content,
            htmlContent: block.content.body || block.content.text || "",
          }

          return (
            <div
              data-post-inline-editor-shell="true"
              className="cursor-text"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                setEditingBlockId(block.id)
              }}
            >
              <InlineRichTextEditor
                blockId={block.id}
                content={editorContent}
                onContentChange={(htmlContent) => onUpdateCoreBody?.(block.id, htmlContent)}
                siteId={site?.id || post?.site_id || ""}
                isActive={editingBlockId === block.id}
                editorPadding={0}
                variant="post"
              />
            </div>
          )
        } : undefined}
        renderBlockOverlay={onSelectBlock ? (block) => {
          if (block.type !== "core") return null

          return (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className={cn(
                "absolute right-3 top-3 z-20 h-8 w-8 rounded-full border bg-background/90 shadow-sm transition-opacity opacity-0 group-hover/post-preview-block:opacity-100",
                editingBlockId === block.id && "opacity-100",
              )}
              data-post-settings-button="true"
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setEditingBlockId(null)
                onSelectBlock(getEditableBlock(block))
              }}
              title="Open block settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )
        } : undefined}
      />
    </BuilderPreviewShell>
  )
}
