"use client"

import { useEffect, useState } from "react"
import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { CategoryBlockRenderer } from "@/components/frontend/categories/CategoryBlockRenderer"
import {
  createPreviewEntityBlocks,
  createPreviewSite,
  normalizePreviewBlocks,
} from "@/lib/utils/admin-builder-preview"
import { getCategoryBreadcrumbPreviewAction } from "@/lib/actions/categories/category-relationship-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"

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
  is_published?: boolean
  parent_id?: string | null
  updated_at?: string
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
      breadcrumbs?: Record<string, boolean>
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
  const [breadcrumbs, setBreadcrumbs] = useState<FrontendBreadcrumbItem[]>([])
  const previewBlocks = normalizePreviewBlocks(blocks)
  const previewSite = createPreviewSite(previewBlocks, site)

  useEffect(() => {
    let cancelled = false

    if (!category?.id || category.id === "preview" || site?.settings?.breadcrumbs?.categories === false) {
      setBreadcrumbs([])
      return
    }

    getCategoryBreadcrumbPreviewAction(category.id).then(({ data }) => {
      if (!cancelled) setBreadcrumbs(data || [])
    })

    return () => {
      cancelled = true
    }
  }, [category?.id, category?.parent_id, category?.updated_at, site?.settings?.breadcrumbs?.categories])

  const previewCategory = {
    id: category?.id || "preview",
    title: category?.title || "Preview Category",
    slug: category?.slug || "preview",
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
      <CategoryBlockRenderer site={previewSite} category={previewCategory} breadcrumbs={breadcrumbs} isPreview hideSiteChrome />
    </BuilderPreviewShell>
  )
}
