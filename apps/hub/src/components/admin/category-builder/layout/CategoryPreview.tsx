"use client"

import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { CategoryBlockRenderer } from "@/components/frontend/categories/CategoryBlockRenderer"
import {
  createPreviewEntityBlocks,
  createPreviewSite,
  normalizePreviewBlocks,
} from "@/lib/utils/admin-builder-preview"

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

export function CategoryPreview({
  blocks,
  category,
  site,
  className = "",
  blocksLoading = false,
  allBlocks,
  onSelectBlock,
}: CategoryPreviewProps) {
  const previewBlocks = normalizePreviewBlocks(blocks)
  const previewSite = createPreviewSite(previewBlocks, site)

  const previewCategory = {
    id: category?.id || "preview",
    title: category?.title || "Preview Category",
    slug: category?.slug || "preview",
    description: category?.description || null,
    featured_image: category?.featured_image || null,
    blocks: createPreviewEntityBlocks(previewBlocks),
  }

  return (
    <BuilderPreviewShell
      allBlocks={allBlocks}
      className={className}
      emptyDescription="Add blocks to see your category preview"
      isEmpty={blocks.length === 0}
      isLoading={blocksLoading}
      onSelectBlock={onSelectBlock}
      site={site}
      showSiteChrome
    >
      <CategoryBlockRenderer site={previewSite} category={previewCategory} isPreview hideSiteChrome />
    </BuilderPreviewShell>
  )
}
