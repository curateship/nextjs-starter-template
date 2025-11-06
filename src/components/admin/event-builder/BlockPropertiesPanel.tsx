import { EventDefaultBlock } from "@/components/admin/event-builder/blocks/EventDefaultBlock"
import { EventPreview } from "./EventPreview"

interface EventBlock {
  id: string
  type: string
  title: string
  content: Record<string, any>
}

interface BlockPropertiesPanelProps {
  selectedBlock: EventBlock | null
  updateBlockContent: (field: string, value: any) => void
  siteId: string
  currentEvent?: {
    slug: string
    name: string
    blocks: EventBlock[]
    id?: string
    title?: string
    meta_description?: string
    site_id?: string
    featured_image?: string | null
    description?: string | null
    is_published?: boolean
  }
  site?: {
    id: string
    name: string
    subdomain: string
    settings?: {
      navigation?: any
      footer?: any
    }
  }
  siteBlocks?: Record<string, any[]>
  blocksLoading?: boolean
  onOpenEventSettings?: () => void
  onTitleChange?: (title: string) => void
  onDescriptionChange?: (description: string) => void
  onFeaturedImageChange?: (featuredImage: string) => void
  onStatusChange?: (status: string) => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentEvent,
  site,
  siteBlocks,
  blocksLoading = false,
  onOpenEventSettings,
  onTitleChange,
  onDescriptionChange,
  onFeaturedImageChange,
  onStatusChange
}: BlockPropertiesPanelProps) {
  // Get navigation and footer from siteBlocks for the current event
  const currentSiteBlocks = siteBlocks?.[currentEvent?.slug || ''] || []
  const navigation = currentSiteBlocks.find(b => b.type === 'navigation')?.content
  const footer = currentSiteBlocks.find(b => b.type === 'footer')?.content

  return (
    <div className="flex-1 border-r bg-muted/30 overflow-y-auto pb-10">
      {selectedBlock ? (
        <div>
          <div className="space-y-4 p-4">
            {selectedBlock.type === 'event-default' && (
              <EventDefaultBlock
                title={currentEvent?.title || currentEvent?.name || ''}
                richText={currentEvent?.description || ''}
                featuredImage={currentEvent?.featured_image || ''}
                status={currentEvent?.is_published ? 'published' : 'draft'}
                onTitleChange={onTitleChange}
                onRichTextChange={onDescriptionChange}
                onFeaturedImageChange={onFeaturedImageChange}
                onStatusChange={onStatusChange}
                onOpenSettings={onOpenEventSettings}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="h-full">
          <EventPreview
            blocks={currentEvent?.blocks || []}
            event={currentEvent ? {
              id: currentEvent.id || 'preview',
              title: currentEvent.title || currentEvent.name,
              slug: currentEvent.slug,
              meta_description: currentEvent.meta_description,
              site_id: currentEvent.site_id || siteId,
              featured_image: currentEvent.featured_image || null,
              description: currentEvent.description || null,
              is_published: currentEvent.is_published || false
            } : undefined}
            site={site ? {
              ...site,
              settings: {
                ...site.settings,
                navigation,
                footer
              }
            } : undefined}
            className="h-full"
            blocksLoading={blocksLoading}
          />
        </div>
      )}
    </div>
  )
}
