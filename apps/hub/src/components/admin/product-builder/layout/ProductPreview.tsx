"use client"

import { useEffect, useState } from "react"
import { Settings } from "lucide-react"
import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { ProductBlockRenderer } from "@/components/frontend/products/ProductBlockRenderer"
import { Button } from "@/components/ui/button"
import {
  createPreviewEntityBlocks,
  createPreviewSite,
  normalizePreviewBlocks,
} from "@/lib/utils/admin-builder-preview"
import { getContentBreadcrumbPreviewAction } from "@/lib/actions/categories/category-relationship-actions"
import type { ProductWithBlocks } from "@/lib/actions/products/product-frontend-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { normalizeProductLeadMagnetContent } from "@/lib/products/lead-magnet"
import { cn } from "@/lib/utils/tailwind"

interface ProductBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface Product {
  id: string
  title: string
  slug: string
  meta_description?: string
  site_id: string
  featured_image?: string | null
  is_published?: boolean
  updated_at?: string
}

interface ProductPreviewProps {
  blocks: ProductBlock[]
  product?: Product
  site?: {
    id: string
    name: string
    subdomain: string
    settings?: {
      navigation?: any
      footer?: any
      font_family?: string
      secondary_font_family?: string
      breadcrumbs?: Record<string, boolean>
    }
  }
  className?: string
  blocksLoading?: boolean
  allBlocks?: ProductBlock[]
  selectedBlock?: ProductBlock | null
  onSelectBlock?: (block: ProductBlock) => void
  onUpdateLeadMagnetBody?: (blockId: string, htmlContent: string) => void
}

export function ProductPreview({
  blocks,
  product,
  site,
  className = "",
  blocksLoading = false,
  allBlocks,
  selectedBlock,
  onSelectBlock,
  onUpdateLeadMagnetBody,
}: ProductPreviewProps) {
  const [breadcrumbs, setBreadcrumbs] = useState<FrontendBreadcrumbItem[]>([])
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const previewBlocks = normalizePreviewBlocks(blocks)
  const previewSite = createPreviewSite(previewBlocks, site)
  const canInlineEdit = Boolean(onUpdateLeadMagnetBody && onSelectBlock)

  const getEditableBlock = (block: { id: string; type: string; content: Record<string, any> }): ProductBlock => {
    return allBlocks?.find(item => item.id === block.id) ||
      blocks.find(item => item.id === block.id) || {
        id: block.id,
        type: block.type,
        title: "Lead Magnet",
        content: block.content,
      }
  }

  useEffect(() => {
    let cancelled = false

    if (!product?.id || product.id === "preview" || site?.settings?.breadcrumbs?.products === false) {
      setBreadcrumbs([])
      return
    }

    getContentBreadcrumbPreviewAction(product.id, 'product').then(({ data }) => {
      if (!cancelled) setBreadcrumbs(data || [])
    })

    return () => {
      cancelled = true
    }
  }, [product?.id, product?.updated_at, site?.settings?.breadcrumbs?.products])

  useEffect(() => {
    if (selectedBlock) {
      setEditingBlockId(null)
    }
  }, [selectedBlock])

  useEffect(() => {
    if (!editingBlockId) return

    const editingBlock = blocks.find((block) => block.id === editingBlockId)
    if (!editingBlock || editingBlock.type !== "product-lead-magnet") {
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
        targetElement.closest('[data-product-inline-editor-shell="true"]') ||
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

  const previewProduct: ProductWithBlocks = {
    id: product?.id || "preview",
    title: product?.title || "Preview Product",
    slug: product?.slug || "preview",
    is_published: product?.is_published || true,
    featured_image: product?.featured_image || null,
    meta_description: product?.meta_description || null,
    blocks: createPreviewEntityBlocks(previewBlocks),
  }

  return (
    <BuilderPreviewShell
      allBlocks={allBlocks}
      className={className}
      emptyDescription="Add blocks to see your product preview"
      isEmpty={blocks.length === 0}
      isLoading={blocksLoading}
      onSelectBlock={onSelectBlock}
      site={site}
      showSiteChrome
    >
      <ProductBlockRenderer
        site={previewSite}
        product={previewProduct}
        breadcrumbs={breadcrumbs}
        isPreview
        hideSiteChrome
        renderLeadMagnetBody={canInlineEdit ? (block) => {
          const content = normalizeProductLeadMagnetContent(block.content)
          const editorContent = {
            ...content,
            htmlContent: content.body,
          }

          return (
            <div
              data-product-inline-editor-shell="true"
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
                onContentChange={(htmlContent) => onUpdateLeadMagnetBody?.(block.id, htmlContent)}
                siteId={site?.id || ""}
                isActive={editingBlockId === block.id}
                editorPadding={0}
                variant="product"
                placeholder="Enter lead magnet descriptions"
                hidePlaceholderOnFocus
              />
            </div>
          )
        } : undefined}
        renderBlockOverlay={onSelectBlock ? (block) => {
          if (block.type !== "product-lead-magnet") return null

          return (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className={cn(
                "absolute right-3 top-3 z-20 h-8 w-8 rounded-full border bg-background/90 shadow-sm transition-opacity opacity-0 group-hover/product-preview-block:opacity-100",
                editingBlockId === block.id && "opacity-100",
              )}
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
