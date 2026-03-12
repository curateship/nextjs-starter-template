"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { createPreviewSite, type PreviewBlock } from "@/lib/utils/admin-builder-preview"
import { CategoryBlockRenderer } from "@/components/frontend/categories/CategoryBlockRenderer"
import { getFontByValue, getFontFamily, defaultFont } from "@/lib/utils/font-config"

interface CategoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface CategoryData {
  id: string
  title: string
  slug: string
  meta_description?: string
  site_id: string
  featured_image?: string | null
  description?: string | null
  is_published?: boolean
}

interface CategoryPreviewProps {
  blocks: CategoryBlock[]
  category?: CategoryData
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
  className?: string
  blocksLoading?: boolean
  allBlocks?: CategoryBlock[]
  onSelectBlock?: (block: CategoryBlock) => void
}

export function CategoryPreview({ blocks, category, site, className = "", blocksLoading = false, allBlocks, onSelectBlock }: CategoryPreviewProps) {
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

  const previewBlocks: PreviewBlock[] = blocks.map((block, index) => ({
    id: block.id,
    type: block.type,
    content: block.content,
    display_order: index
  }))

  const previewSite = createPreviewSite(previewBlocks, site)

  const previewCategory = {
    id: category?.id || 'preview',
    title: category?.title || 'Preview Category',
    slug: category?.slug || 'preview',
    description: category?.description || null,
    featured_image: category?.featured_image || null,
    blocks: previewBlocks.map(block => ({
      id: block.id,
      type: block.type,
      content: block.content,
      display_order: block.display_order || 0
    }))
  }

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
            <div className="space-y-6 p-6">
              <div className="space-y-4">
                <div className="h-8 bg-muted rounded animate-pulse w-3/4"></div>
                <div className="h-4 bg-muted/60 rounded animate-pulse w-1/2"></div>
              </div>
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
                <div className="text-sm">Add blocks to see your category preview</div>
              </div>
            </div>
          ) : (
            <CategoryBlockRenderer site={previewSite} category={previewCategory} />
          )}
        </div>
      </div>
    </div>
  )
}
