"use client"

import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { createPreviewSite, type PreviewBlock } from "@/lib/utils/admin-builder-preview"
import type { ContentBlock as PageBlock } from "@/lib/utils/block-utils"
import { resolveSiteChrome } from "@/lib/utils/site-structure"

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

  return (
    <BuilderPreviewShell
      allBlocks={allBlocks}
      className={className}
      emptyDescription="Add blocks to see your page preview"
      isEmpty={!hasRenderablePreview}
      isLoading={blocksLoading}
      onSelectBlock={onSelectBlock}
      onSelectSiteChrome={onSelectSiteChrome}
      site={site}
      showSiteChrome
    >
      <BlockRenderer site={previewSite} isPreview hideSiteChrome />
    </BuilderPreviewShell>
  )
}
