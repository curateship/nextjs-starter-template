"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { ProductBlockRenderer } from "@/components/frontend/products/ProductBlockRenderer"
import { createPreviewSite, type PreviewBlock } from "@/lib/utils/admin-builder-preview"
import type { ProductWithBlocks } from "@/lib/actions/products/product-frontend-actions"
import { getFontByValue, getFontFamily, defaultFont } from "@/lib/utils/font-config"

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
  description?: string | null
  is_published?: boolean
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
    }
  }
  // allBlocks removed - navigation/footer now come from site.settings
  className?: string
  blocksLoading?: boolean
  allBlocks?: ProductBlock[]
  onSelectBlock?: (block: ProductBlock) => void
}

export function ProductPreview({ blocks, product, site, className = "", blocksLoading = false, allBlocks, onSelectBlock }: ProductPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredEl, setHoveredEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (hoveredEl) {
      hoveredEl.classList.add("block-hovered")
      return () => { hoveredEl.classList.remove("block-hovered") }
    }
  }, [hoveredEl])

  const findBlockEl = useCallback((target: HTMLElement): HTMLElement | null => {
    return target.closest("[data-block-id], [data-block-type]") as HTMLElement | null
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!onSelectBlock) return
    const el = findBlockEl(e.target as HTMLElement)
    setHoveredEl(prev => prev === el ? prev : el)
  }, [onSelectBlock, findBlockEl])

  const handleMouseLeave = useCallback(() => {
    setHoveredEl(null)
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!onSelectBlock || !allBlocks) return
    const el = findBlockEl(e.target as HTMLElement)
    if (!el) return

    const blockId = el.getAttribute("data-block-id")
    const blockType = el.getAttribute("data-block-type")

    const block = blockId
      ? allBlocks.find(b => b.id === blockId)
      : blockType
        ? allBlocks.find(b => b.type === blockType)
        : null

    if (block) {
      onSelectBlock(block)
    }
  }, [onSelectBlock, allBlocks, findBlockEl])

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (!onSelectBlock) return
    const target = e.target as HTMLElement
    if (target.closest("a")) {
      e.preventDefault()
    }
  }, [onSelectBlock])

  // Convert product blocks to PreviewBlock format for the generic preview system
  const previewBlocks: PreviewBlock[] = blocks.map(block => ({
    id: block.id,
    type: block.type,
    content: block.content,
    display_order: 0 // Will be handled by block ordering
  }))

  // Create preview site - navigation and footer will be added from site.settings automatically
  const previewSite = createPreviewSite(previewBlocks, site)

  // Create mock product data
  const previewProduct: ProductWithBlocks = {
    id: product?.id || 'preview',
    title: product?.title || 'Preview Product',
    slug: product?.slug || 'preview',
    is_published: product?.is_published || true,
    featured_image: product?.featured_image || null,
    description: product?.description || null,
    blocks: previewBlocks.map(block => ({
      id: block.id,
      type: block.type,
      content: block.content,
      display_order: block.display_order || 0
    }))
  }

  // Get font settings from site
  const fontFamily = site?.settings?.font_family || 'playfair-display'
  const secondaryFontFamily = site?.settings?.secondary_font_family || 'urbanist'

  const primary = getFontByValue(fontFamily) ?? defaultFont
  const secondary = getFontByValue(secondaryFontFamily) ?? primary
  const primaryFontFamilyValue = getFontFamily(primary.value)
  const secondaryFontFamilyValue = getFontFamily(secondary.value)

  const isInteractive = !!onSelectBlock

  return (
    <div
      ref={containerRef}
      className={`overflow-x-hidden ${className} preview-container`}
      style={{
        ['--font-primary' as string]: primaryFontFamilyValue,
        ['--font-secondary' as string]: secondaryFontFamilyValue,
      }}
      onMouseMove={isInteractive ? handleMouseMove : undefined}
      onMouseLeave={isInteractive ? handleMouseLeave : undefined}
      onClick={isInteractive ? handleClick : undefined}
      onClickCapture={isInteractive ? handleClickCapture : undefined}
    >
      {isInteractive && (
        <style>{`
          .preview-container [data-block-id],
          .preview-container [data-block-type] {
            cursor: pointer;
            position: relative;
          }
          .preview-container [data-block-type="navigation"] {
            position: relative !important;
            width: 100% !important;
          }
          .preview-container .pt-16 {
            padding-top: 0 !important;
          }
          .preview-container .block-hovered::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border: 2px dashed #3b82f6;
            pointer-events: none;
            z-index: 9999;
          }
        `}</style>
      )}
      <div
        style={{
          width: '100%',
          contain: 'layout style',
          position: 'relative',
        }}
      >
        <div className="bg-background">
          {blocksLoading ? (
            <div>
              {/* Navigation skeleton */}
              <div className="border-b px-8 py-4">
                <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between">
                  <div className="h-6 bg-muted rounded animate-pulse w-28" />
                  <div className="flex gap-6">
                    <div className="h-4 bg-muted/60 rounded animate-pulse w-14" />
                    <div className="h-4 bg-muted/60 rounded animate-pulse w-16" />
                    <div className="h-4 bg-muted/60 rounded animate-pulse w-12" />
                  </div>
                  <div className="h-8 bg-muted rounded-md animate-pulse w-20" />
                </div>
              </div>

              {/* Hero skeleton */}
              <div className="flex flex-col items-center text-center py-20 px-8 space-y-5">
                <div className="h-10 bg-muted rounded animate-pulse w-2/3" />
                <div className="h-5 bg-muted/60 rounded animate-pulse w-1/2" />
                <div className="flex gap-3 pt-2">
                  <div className="h-10 bg-muted rounded-md animate-pulse w-28" />
                  <div className="h-10 bg-muted/40 rounded-md animate-pulse w-28" />
                </div>
              </div>

              {/* Product content skeleton — image + text side by side */}
              <div className="max-w-5xl mx-auto px-8 py-12">
                <div className="grid grid-cols-2 gap-10">
                  <div className="h-64 bg-muted/60 rounded-lg animate-pulse" />
                  <div className="space-y-4 py-4">
                    <div className="h-7 bg-muted rounded animate-pulse w-3/4" />
                    <div className="space-y-2">
                      <div className="h-4 bg-muted/60 rounded animate-pulse" />
                      <div className="h-4 bg-muted/60 rounded animate-pulse w-5/6" />
                      <div className="h-4 bg-muted/60 rounded animate-pulse w-2/3" />
                    </div>
                    <div className="h-10 bg-muted rounded-md animate-pulse w-32 mt-4" />
                  </div>
                </div>
              </div>

              {/* Features skeleton — 3 columns */}
              <div className="max-w-5xl mx-auto px-8 py-12">
                <div className="h-7 bg-muted rounded animate-pulse w-1/3 mx-auto mb-8" />
                <div className="grid grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-3 text-center">
                      <div className="h-10 w-10 bg-muted/60 rounded-full animate-pulse mx-auto" />
                      <div className="h-5 bg-muted rounded animate-pulse w-2/3 mx-auto" />
                      <div className="space-y-1.5">
                        <div className="h-3 bg-muted/40 rounded animate-pulse" />
                        <div className="h-3 bg-muted/40 rounded animate-pulse w-4/5 mx-auto" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer skeleton */}
              <div className="border-t px-8 py-8 mt-8">
                <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between">
                  <div className="h-4 bg-muted/60 rounded animate-pulse w-40" />
                  <div className="flex gap-4">
                    <div className="h-4 bg-muted/40 rounded animate-pulse w-12" />
                    <div className="h-4 bg-muted/40 rounded animate-pulse w-14" />
                    <div className="h-4 bg-muted/40 rounded animate-pulse w-10" />
                  </div>
                </div>
              </div>
            </div>
          ) : blocks.length === 0 ? (
            <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
              <div className="text-center">
                <div className="text-lg font-medium mb-2">No blocks added yet</div>
                <div className="text-sm">Add blocks to see your product preview</div>
              </div>
            </div>
          ) : (
            <ProductBlockRenderer site={previewSite} product={previewProduct} />
          )}
        </div>
      </div>
    </div>
  )
}
