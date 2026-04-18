"use client"

import { BuilderPreviewShell } from "@/components/admin/layout/builder/BuilderPreviewShell"
import { EventBlockRenderer } from "@/components/frontend/events/EventBlockRenderer"
import {
  createPreviewEntityBlocks,
  createPreviewSite,
  normalizePreviewBlocks,
} from "@/lib/utils/admin-builder-preview"

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
  description?: string | null
  is_published?: boolean
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
  const previewBlocks = normalizePreviewBlocks(blocks)
  const previewSite = createPreviewSite(previewBlocks, site)

  const previewEvent = {
    id: event?.id || "preview",
    title: event?.title || "Preview Event",
    slug: event?.slug || "preview",
    description: event?.description || null,
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
      <EventBlockRenderer site={previewSite} event={previewEvent} isPreview hideSiteChrome />
    </BuilderPreviewShell>
  )
}
