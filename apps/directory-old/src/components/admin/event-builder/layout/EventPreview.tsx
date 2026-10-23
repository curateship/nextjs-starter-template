"use client"

import { useEffect, useState } from "react"
import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { EventBlockRenderer } from "@/components/frontend/events/EventBlockRenderer"
import {
  createPreviewEntityBlocks,
  createPreviewSite,
  normalizePreviewBlocks,
} from "@/lib/utils/admin-builder-preview"
import { getContentBreadcrumbPreviewAction } from "@/lib/actions/categories/category-relationship-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"

interface EventBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface Event {
  id: string
  title: string
  slug: string
  meta_description?: string
  site_id: string
  featured_image?: string | null
  is_published?: boolean
  updated_at?: string
}

interface EventPreviewProps {
  blocks: EventBlock[]
  event?: Event
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
  allBlocks?: EventBlock[]
  onSelectBlock?: (block: EventBlock) => void
}

export function EventPreview({
  blocks,
  event,
  site,
  className = "",
  blocksLoading = false,
  allBlocks,
  onSelectBlock,
}: EventPreviewProps) {
  const [breadcrumbs, setBreadcrumbs] = useState<FrontendBreadcrumbItem[]>([])
  const previewBlocks = normalizePreviewBlocks(blocks)
  const previewSite = createPreviewSite(previewBlocks, site)

  useEffect(() => {
    let cancelled = false

    if (!event?.id || event.id === "preview" || site?.settings?.breadcrumbs?.events === false) {
      setBreadcrumbs([])
      return
    }

    getContentBreadcrumbPreviewAction({ data: { contentId: event.id, contentType: 'event' } }).then(({ data }) => {
      if (!cancelled) setBreadcrumbs(data || [])
    })

    return () => {
      cancelled = true
    }
  }, [event?.id, event?.updated_at, site?.settings?.breadcrumbs?.events])

  const previewEvent = {
    id: event?.id || "preview",
    title: event?.title || "Preview Event",
    slug: event?.slug || "preview",
    featured_image: event?.featured_image || null,
    blocks: createPreviewEntityBlocks(previewBlocks),
  }

  return (
    <BuilderPreviewShell
      allBlocks={allBlocks}
      className={className}
      emptyDescription="Add blocks to see your event preview"
      isEmpty={blocks.length === 0}
      isLoading={blocksLoading}
      onSelectBlock={onSelectBlock}
      site={site}
      showSiteChrome
    >
      <EventBlockRenderer site={previewSite} event={previewEvent} breadcrumbs={breadcrumbs} isPreview hideSiteChrome />
    </BuilderPreviewShell>
  )
}
