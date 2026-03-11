"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { createPreviewSite, type PreviewBlock } from "@/lib/utils/admin-builder-preview"
import { getFontByValue, getFontFamily, defaultFont } from "@/lib/utils/font-config"
import type { PageBlock } from "@/lib/utils/page-block-utils"

interface PagePreviewProps {
  blocks: PreviewBlock[]
  site?: {
    id: string
    name: string
    subdomain: string
    settings?: {
      favicon?: string
      [key: string]: any
    }
  }
  className?: string
  blocksLoading?: boolean
  allBlocks?: PageBlock[]
  onSelectBlock?: (block: PageBlock) => void
}

export function PagePreview({ blocks, site, className = "", blocksLoading = false, allBlocks, onSelectBlock }: PagePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredEl, setHoveredEl] = useState<HTMLElement | null>(null)

  // Toggle .block-hovered class on the hovered DOM element
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

  // Prevent link navigation in preview
  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (!onSelectBlock) return
    const target = e.target as HTMLElement
    if (target.closest("a")) {
      e.preventDefault()
    }
  }, [onSelectBlock])

  // Create preview site
  const previewSite = createPreviewSite(blocks, site)

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
                <div className="text-sm">Add blocks to see your page preview</div>
              </div>
            </div>
          ) : (
            <BlockRenderer site={previewSite} />
          )}
        </div>
      </div>
    </div>
  )
}
