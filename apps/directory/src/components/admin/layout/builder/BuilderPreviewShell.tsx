"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { AdminLoading } from "@/components/admin/layout/loading"
import { defaultFont, getFontByValue, getFontFamily } from "@/lib/utils/font-config"
import { cn } from "@/lib/utils/tailwind"
import { SiteThemeProvider } from "@/components/frontend/layout/site-theme-provider"
import { NavBlock } from "@/components/frontend/pages/navigation/PageNavigationBlock"
import { FooterBlock } from "@/components/frontend/pages/footer/PageFooterBlock"
import { ScrollArea } from "@/components/ui/scroll-area"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { toPublicSiteClientProps } from "@/lib/utils/public-site-client"

interface SelectablePreviewBlock {
  id: string
  type: string
}

interface PreviewSiteChrome {
  id: string
  name?: string
  subdomain: string
  settings?: {
    font_family?: string
    secondary_font_family?: string
    default_theme?: "system" | "light" | "dark"
    [key: string]: any
  }
}

interface BuilderPreviewShellProps<TBlock extends SelectablePreviewBlock> {
  allBlocks?: TBlock[]
  children: ReactNode
  className?: string
  emptyDescription: string
  emptyTitle?: string
  isEmpty?: boolean
  isLoading?: boolean
  loadingFallback?: ReactNode
  onSelectBlock?: (block: TBlock) => void
  onSelectSiteChrome?: (type: "navigation" | "footer") => void
  site?: PreviewSiteChrome
  showSiteChrome?: boolean
  navigationBackgroundColor?: string
}

const DEFAULT_EMPTY_TITLE = "No blocks added yet"

export function BuilderPreviewShell<TBlock extends SelectablePreviewBlock>({
  allBlocks,
  children,
  className,
  emptyDescription,
  emptyTitle = DEFAULT_EMPTY_TITLE,
  isEmpty = false,
  isLoading = false,
  loadingFallback,
  onSelectBlock,
  onSelectSiteChrome,
  site,
  showSiteChrome = false,
  navigationBackgroundColor,
}: BuilderPreviewShellProps<TBlock>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredEl, setHoveredEl] = useState<HTMLElement | null>(null)
  const isInteractive = !!onSelectBlock || !!onSelectSiteChrome

  const fontFamily = site?.settings?.font_family || "playfair-display"
  const secondaryFontFamily = site?.settings?.secondary_font_family || "urbanist"
  const primary = getFontByValue(fontFamily) ?? defaultFont
  const secondary = getFontByValue(secondaryFontFamily) ?? primary

  useEffect(() => {
    if (hoveredEl) {
      hoveredEl.classList.add("block-hovered")
      return () => {
        hoveredEl.classList.remove("block-hovered")
      }
    }
  }, [hoveredEl])

  const findBlockEl = useCallback((target: HTMLElement): HTMLElement | null => {
    return target.closest("[data-block-id], [data-block-type]") as HTMLElement | null
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isInteractive) return
    const el = findBlockEl(e.target as HTMLElement)
    setHoveredEl(prev => (prev === el ? prev : el))
  }, [findBlockEl, isInteractive])

  const handleMouseLeave = useCallback(() => {
    setHoveredEl(null)
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!isInteractive) return

    const el = findBlockEl(e.target as HTMLElement)
    if (!el) return

    const blockType = el.getAttribute("data-block-type")
    if ((blockType === "navigation" || blockType === "footer") && onSelectSiteChrome) {
      onSelectSiteChrome(blockType)
      return
    }

    if (!onSelectBlock || !allBlocks) return

    const blockId = el.getAttribute("data-block-id")
    const block = blockId
      ? allBlocks.find(item => item.id === blockId)
      : blockType
        ? allBlocks.find(item => item.type === blockType)
        : null

    if (block) {
      onSelectBlock(block)
    }
  }, [allBlocks, findBlockEl, isInteractive, onSelectBlock, onSelectSiteChrome])

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (!isInteractive) return
    if ((e.target as HTMLElement).closest("a")) {
      e.preventDefault()
    }
  }, [isInteractive])

  const previewStyles = {
    ["--font-primary" as string]: getFontFamily(primary.value),
    ["--font-secondary" as string]: getFontFamily(secondary.value),
  } as CSSProperties
  const siteChrome = resolveSiteChrome(site?.settings)
  const navigation = showSiteChrome ? siteChrome.navigation : null
  const footer = showSiteChrome ? siteChrome.footer : null
  const enableThemeToggle = navigation?.styleConfig?.[navigation.navigationStyle || "default"]?.showDarkModeToggle !== false
  const publicSite = toPublicSiteClientProps(site)

  return (
    <SiteThemeProvider site={publicSite} isPreview enableThemeToggle={enableThemeToggle}>
      <div
        ref={containerRef}
        className={cn(className, "preview-container flex h-full min-h-0 flex-col")}
        style={previewStyles}
        onClick={isInteractive ? handleClick : undefined}
        onClickCapture={isInteractive ? handleClickCapture : undefined}
        onMouseLeave={isInteractive ? handleMouseLeave : undefined}
        onMouseMove={isInteractive ? handleMouseMove : undefined}
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
              content: "";
              position: absolute;
              inset: 0;
              z-index: 9999;
              pointer-events: none;
              outline: 2px dotted #3b82f6;
              outline-offset: -2px;
            }
            .preview-container [data-radix-scroll-area-viewport] > div {
              display: block !important;
              min-width: 0 !important;
              width: 100% !important;
            }
          `}</style>
        )}

        <div className="relative flex h-full min-h-0 flex-col bg-background">
          {navigation && (
            <NavBlock
              {...navigation}
              site={publicSite}
              isPreview
              backgroundColor={navigationBackgroundColor}
            />
          )}

          <ScrollArea className="min-h-0 flex-1">
            {isLoading ? (
              loadingFallback || <AdminLoading className="h-full" />
            ) : isEmpty ? (
              <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <div className="mb-2 text-lg font-medium">{emptyTitle}</div>
                  <div className="text-sm">{emptyDescription}</div>
                </div>
              </div>
            ) : (
              children
            )}

            {footer && (
              <FooterBlock {...footer} site={publicSite} />
            )}
          </ScrollArea>
        </div>
      </div>
    </SiteThemeProvider>
  )
}
