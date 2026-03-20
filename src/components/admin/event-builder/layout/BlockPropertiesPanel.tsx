import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { EventContentBlock } from "@/components/admin/event-builder/blocks/EventContentBlock"
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
  onTitleChange?: (title: string) => void
  onSelectBlock?: (block: any) => void
  onBack?: () => void
}

export function BlockPropertiesPanel({
  selectedBlock,
  updateBlockContent,
  siteId,
  currentEvent,
  site,
  siteBlocks,
  blocksLoading = false,
  onTitleChange,
  onSelectBlock,
  onBack,
}: BlockPropertiesPanelProps) {
  // Get navigation and footer from siteBlocks for the current event
  const currentSiteBlocks = siteBlocks?.[currentEvent?.slug || ''] || []
  const navigation = currentSiteBlocks.find(b => b.type === 'navigation')?.content
  const footer = currentSiteBlocks.find(b => b.type === 'footer')?.content

  return (
    <div className={`flex-1 border-r bg-background builder-scroll ${selectedBlock ? 'overflow-y-auto pb-10' : 'overflow-y-auto'}`}>
      {selectedBlock ? (
        <AdminLayout>
            {selectedBlock.type === 'event-content' && (
              <EventContentBlock
                content={selectedBlock.content}
                onContentChange={updateBlockContent}
                siteId={siteId}
                blockId={selectedBlock.id}
                eventData={{
                  title: currentEvent?.title || currentEvent?.name,
                  name: currentEvent?.name,
                }}
                onEventTitleChange={onTitleChange}
                onBack={onBack}
              />
            )}
        </AdminLayout>
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
            allBlocks={currentEvent?.blocks || []}
            onSelectBlock={onSelectBlock}
          />
        </div>
      )}
    </div>
  )
}
