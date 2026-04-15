"use client"

import { BuilderPreviewShell } from "@/components/admin/shared/BuilderPreviewShell"
import { DirectoryBlockRenderer } from "@/components/frontend/directories/DirectoryBlockRenderer"
import {
  createPreviewEntityBlocks,
  createPreviewSite,
  normalizePreviewBlocks,
} from "@/lib/utils/admin-builder-preview"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"

interface DirectoryBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface Directory {
  id: string
  title: string
  slug: string
  meta_description?: string
  site_id: string
  featured_image?: string | null
  description?: string | null
  status?: "draft" | "published"
}

interface DirectoryPreviewProps {
  blocks: DirectoryBlock[]
  directory?: Directory
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
  allBlocks?: DirectoryBlock[]
  customBlockTemplates?: DirectoryCustomBlockTemplate[]
  onSelectBlock?: (block: DirectoryBlock) => void
}

export function DirectoryPreview({
  blocks,
  directory,
  site,
  className = "",
  blocksLoading = false,
  allBlocks,
  customBlockTemplates = [],
  onSelectBlock,
}: DirectoryPreviewProps) {
  const previewBlocks = normalizePreviewBlocks(blocks)
  const previewSite = createPreviewSite(previewBlocks, site)
  const templateMap = Object.fromEntries(customBlockTemplates.map(template => [template.id, template]))

  const previewDirectory = {
    id: directory?.id || "preview",
    title: directory?.title || "Preview Directory",
    slug: directory?.slug || "preview",
    description: directory?.description || null,
    featured_image: directory?.featured_image || null,
    blocks: createPreviewEntityBlocks(previewBlocks),
  }

  return (
    <BuilderPreviewShell
      allBlocks={allBlocks}
      className={className}
      emptyDescription="Add blocks to see your directory preview"
      isEmpty={blocks.length === 0}
      isLoading={blocksLoading}
      onSelectBlock={onSelectBlock}
      site={site}
      showSiteChrome
    >
      <DirectoryBlockRenderer
        site={previewSite}
        directory={previewDirectory}
        customBlockTemplates={templateMap}
        isPreview
        hideSiteChrome
      />
    </BuilderPreviewShell>
  )
}
