"use client"

import { useEffect, useState } from "react"
import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { DirectoryBlockRenderer } from "@/components/frontend/directories/DirectoryBlockRenderer"
import {
  createPreviewEntityBlocks,
  createPreviewSite,
  normalizePreviewBlocks,
} from "@/lib/utils/admin-builder-preview"
import { getContentBreadcrumbPreviewAction } from "@/lib/actions/categories/category-relationship-actions"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"

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
  updated_at?: string
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
      breadcrumbs?: Record<string, boolean>
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
  const [breadcrumbs, setBreadcrumbs] = useState<FrontendBreadcrumbItem[]>([])
  const previewBlocks = normalizePreviewBlocks(blocks)
  const previewSite = createPreviewSite(previewBlocks, site)
  const templateMap = Object.fromEntries(customBlockTemplates.map(template => [template.id, template]))

  useEffect(() => {
    let cancelled = false

    if (!directory?.id || directory.id === "preview" || site?.settings?.breadcrumbs?.directories === false) {
      setBreadcrumbs([])
      return
    }

    getContentBreadcrumbPreviewAction(directory.id, 'directory').then(({ data }) => {
      if (!cancelled) setBreadcrumbs(data || [])
    })

    return () => {
      cancelled = true
    }
  }, [directory?.id, directory?.updated_at, site?.settings?.breadcrumbs?.directories])

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
        breadcrumbs={breadcrumbs}
        isPreview
        hideSiteChrome
      />
    </BuilderPreviewShell>
  )
}
