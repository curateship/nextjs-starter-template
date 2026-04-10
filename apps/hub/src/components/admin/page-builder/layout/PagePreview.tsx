"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { createPreviewSite, type PreviewBlock } from "@/lib/utils/admin-builder-preview"
import { getFontByValue, getFontFamily, defaultFont } from "@/lib/utils/font-config"
import type { ContentBlock as PageBlock } from "@/lib/utils/block-utils"

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
      className={`overflow-x-clip ${className} preview-container`}
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
          }
          .preview-container .block-hovered {
            position: relative;
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
            <div>
              {/* Navigation skeleton */}
              <div className="px-8 py-4">
                <div className="mx-auto flex w-full max-w-[1200px] items-center gap-6">
                  <div className="h-7 w-7 bg-muted rounded animate-pulse" />
                  <div className="h-4 bg-muted/60 rounded animate-pulse w-12" />
                  <div className="h-4 bg-muted/60 rounded animate-pulse w-16" />
                  <div className="flex-1" />
                  <div className="h-5 w-5 bg-muted/40 rounded animate-pulse" />
                </div>
              </div>

              {/* Hero skeleton — left text + right image */}
              <div className="max-w-[1152px] mx-auto px-10 py-16">
                <div className="grid grid-cols-2 gap-10 items-center">
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <div className="h-12 bg-muted rounded animate-pulse w-full" />
                      <div className="h-12 bg-muted rounded animate-pulse w-4/5" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 bg-muted/50 rounded animate-pulse w-full" />
                      <div className="h-4 bg-muted/50 rounded animate-pulse w-11/12" />
                      <div className="h-4 bg-muted/50 rounded animate-pulse w-3/4" />
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <div className="h-10 bg-muted/60 rounded animate-pulse flex-1 max-w-[240px]" />
                      <div className="h-10 bg-muted rounded-md animate-pulse w-24" />
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <div className="flex -space-x-2">
                        <div className="h-8 w-8 bg-muted/60 rounded-full animate-pulse border-2 border-background" />
                        <div className="h-8 w-8 bg-muted/60 rounded-full animate-pulse border-2 border-background" />
                        <div className="h-8 w-8 bg-muted/60 rounded-full animate-pulse border-2 border-background" />
                      </div>
                      <div className="h-4 bg-muted/40 rounded animate-pulse w-40" />
                    </div>
                  </div>
                  <div className="h-80 bg-muted/30 rounded-xl animate-pulse" />
                </div>
              </div>

              {/* Divider */}
              <div className="max-w-[1152px] mx-auto px-10"><div className="h-px bg-muted" /></div>

              {/* Listing section skeleton — title + subtitle + 3 product cards */}
              <div className="max-w-[1152px] mx-auto px-10 py-14 space-y-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="h-9 bg-muted rounded animate-pulse w-52" />
                    <div className="h-4 bg-muted/50 rounded animate-pulse w-72" />
                  </div>
                  <div className="h-9 bg-muted/40 rounded-md animate-pulse w-24" />
                </div>
                <div className="grid grid-cols-3 gap-5 pt-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-3">
                      <div className="h-52 bg-muted/40 rounded-lg animate-pulse" />
                      <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
                      <div className="space-y-1.5">
                        <div className="h-3.5 bg-muted/40 rounded animate-pulse" />
                        <div className="h-3.5 bg-muted/40 rounded animate-pulse w-5/6" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer skeleton */}
              <div className="px-8 py-8">
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
