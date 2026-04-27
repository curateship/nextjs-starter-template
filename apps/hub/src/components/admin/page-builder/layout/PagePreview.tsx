"use client"

import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { createPreviewSite, type PreviewBlock } from "@/lib/utils/admin-builder-preview"
import type { ContentBlock as PageBlock } from "@/lib/utils/block-utils"
import { resolveSiteChrome } from "@/lib/utils/site-structure"
import { getHeroNavigationBackgroundColor } from "@/lib/utils/page-hero-background"

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
  onSelectSiteChrome?: (type: "navigation" | "footer") => void
}

export function PagePreview({
  blocks,
  site,
  className = "",
  blocksLoading = false,
  allBlocks,
  onSelectBlock,
  onSelectSiteChrome,
}: PagePreviewProps) {
  const previewSite = createPreviewSite(blocks, site)
  const siteChrome = resolveSiteChrome(site?.settings)
  const hasRenderablePreview = blocks.length > 0 || !!siteChrome.navigation || !!siteChrome.footer
  const visibleBlocks = blocks.filter((block) => block.content?.visibility?.hideBlock !== true)
  const navigationBackgroundColor = siteChrome.navigation
    ? getHeroNavigationBackgroundColor(visibleBlocks)
    : undefined

  return (
    <BuilderPreviewShell
      allBlocks={allBlocks}
      className={className}
      emptyDescription="Add blocks to see your page preview"
      isEmpty={!hasRenderablePreview}
      isLoading={blocksLoading}
      onSelectBlock={onSelectBlock}
      onSelectSiteChrome={onSelectSiteChrome}
      navigationBackgroundColor={navigationBackgroundColor}
      site={site}
      showSiteChrome
    >
      <BlockRenderer site={previewSite} isPreview hideSiteChrome />
    </BuilderPreviewShell>
  )
}
