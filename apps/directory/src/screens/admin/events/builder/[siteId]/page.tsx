"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "@/lib/navigation-client"
import { useEventData } from "@/components/admin/event-builder/config/useEventData"
import { useEventBuilder } from "@/components/admin/event-builder/config/useEventBuilder"
import {
  useBuilderRouteSiteSync,
  useSelectedBuilderSlug,
  useSyncedBuilderBlocks,
} from "@/components/admin/layout/builder/useBuilderRouteState"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { EventSettingsModal } from "@/components/admin/event-builder/layout/EventSettingsModal"
import { EventBlockListPanel } from "@/components/admin/event-builder/layout/EventBlockListPanel"
import { EVENT_CONTENT_BLOCK_TYPE, eventBlocksToValueJson } from "@/lib/actions/events/event-template-inheritance"
import { getSiteEventsAction, updateEventAction, updateEventBlocksAction } from "@/lib/actions/events/event-actions"
import type { Event } from "@/lib/actions/events/event-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EventPreview } from "@/components/admin/event-builder/layout/EventPreview"
import { EventBlockEditorModal } from "@/components/admin/event-builder/layout/EventBlockEditorModal"

export default function EventBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [events, setEvents] = useState<Event[]>([])
  const eventFromUrl = searchParams.get('event') || ''
  const { currentSite } = useBuilderRouteSiteSync({
    builderPath: "/admin/events/builder",
    queryParam: "event",
    queryValue: eventFromUrl,
    siteId,
  })
  const [selectedEvent, setSelectedEvent] = useState(eventFromUrl)
  const [blockListOpen, setBlockListOpen] = useState(false)

  // Load events (raw rows — settings modal needs row-level _settings/title)
  useEffect(() => {
    async function loadEvents() {
      try {
        const { data, error } = await getSiteEventsAction(siteId, { selectedSlug: eventFromUrl })
        if (error) {
          return
        }
        setEvents(data || [])

      } catch (err) {
        console.error('Failed to load events', err)
      }
    }

    loadEvents()
  }, [eventFromUrl, siteId])

  useSelectedBuilderSlug({
    builderPath: "/admin/events/builder",
    items: events,
    queryParam: "event",
    selectedSlug: selectedEvent,
    setSelectedSlug: setSelectedEvent,
    siteId,
    slugFromUrl: eventFromUrl,
  })

  // Custom hooks for data and state management (blocks are template-merged)
  const { site, blocks, blocksLoading } = useEventData(siteId, selectedEvent)
  const [localBlocks, setLocalBlocks] = useSyncedBuilderBlocks(blocks, { shallowCopy: true })

  const builderState = useEventBuilder({
    blocks: localBlocks,
    selectedEvent,
    eventId: events.find(d => d.slug === selectedEvent)?.id,
  })
  const selectedBlock = builderState.selectedBlock
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftEventTitle, setDraftEventTitle] = useState("")
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  const [blockSaveError, setBlockSaveError] = useState<string | null>(null)

  // Current event data
  const currentEventData = events.find(d => d.slug === selectedEvent)
  const currentEvent = {
    slug: selectedEvent,
    name: currentEventData?.title || selectedEvent,
    blocks: localBlocks[selectedEvent] || []
  }

  // Draft block content edits stay local until saved
  useEffect(() => {
    if (!selectedBlock) {
      setDraftContent({})
      setDraftEventTitle("")
      setBlockSaveError(null)
      return
    }

    setDraftContent(
      selectedBlock.content
        ? JSON.parse(JSON.stringify(selectedBlock.content))
        : {}
    )
    setDraftEventTitle(currentEventData?.title || selectedEvent)
    setBlockSaveError(null)
  }, [selectedBlock, currentEventData?.title, selectedEvent])

  // Handle event updates (also remaps local blocks + URL when the slug changes)
  const handleEventUpdated = (updatedEvent: Event) => {
    setEvents(prev => prev.map(d => d.id === updatedEvent.id ? updatedEvent : d))

    const currentEvent = events.find(d => d.id === updatedEvent.id)
    if (currentEvent && currentEvent.slug !== updatedEvent.slug) {
      setLocalBlocks(prev => {
        const blocksForEvent = prev[currentEvent.slug] || []
        const { [currentEvent.slug]: removed, ...rest } = prev
        return {
          ...rest,
          [updatedEvent.slug]: blocksForEvent
        }
      })

      setSelectedEvent(updatedEvent.slug)
      router.replace(`/admin/events/builder/${siteId}?event=${updatedEvent.slug}`)
    }
  }

  // Handle event information updates
  const updateCurrentEvent = async (updates: { title?: string; featured_image?: string | null; is_published?: boolean }) => {
    if (!currentEventData?.id) return

    try {
      const { data, error } = await updateEventAction(currentEventData.id, updates)
      if (error) {
        console.error('Failed to update event:', error)
        return
      }
      if (data) {
        handleEventUpdated(data)
      }
    } catch (error) {
      console.error('Failed to update event:', error)
    }
  }

  const [isPublishing, setIsPublishing] = useState(false)
  const handlePublish = async () => {
    if (!currentEventData?.id) return
    try {
      setIsPublishing(true)
      await updateCurrentEvent({ is_published: true })
    } finally {
      setIsPublishing(false)
    }
  }

  const handleDraftChange = (field: string, value: any) => {
    setDraftContent((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleCloseBlockEditor = () => {
    if (isSavingBlock) return
    builderState.setSelectedBlock(null)
    setBlockSaveError(null)
  }

  // Save the selected block's value edits (template-owned keys are pruned server-side)
  const handleSaveBlockEditor = async () => {
    if (!selectedBlock || !currentEventData?.id) return

    setIsSavingBlock(true)
    setBlockSaveError(null)

    try {
      const currentBlocks = localBlocks[selectedEvent] || []
      const nextBlocks = currentBlocks.map((block) =>
        block.id === selectedBlock.id
          ? { ...block, content: draftContent }
          : block
      )

      // The Core block edits the event row's title — save it before block values.
      if (selectedBlock.type === EVENT_CONTENT_BLOCK_TYPE) {
        const nextTitle = draftEventTitle.trim() || currentEventData.title
        if (nextTitle !== currentEventData.title) {
          const { data, error } = await updateEventAction(currentEventData.id, { title: nextTitle })
          if (error || !data) {
            setBlockSaveError(error || "Failed to save event details")
            return
          }
          handleEventUpdated(data)
        }
      }

      const contentBlocks = eventBlocksToValueJson(nextBlocks)
      const result = await updateEventBlocksAction(currentEventData.id, contentBlocks)
      if (!result.success) {
        setBlockSaveError(result.error || "Failed to save block")
        return
      }

      setLocalBlocks((current) => ({
        ...current,
        [selectedEvent]: nextBlocks,
      }))
      builderState.setSelectedBlock(null)
    } catch (error) {
      setBlockSaveError(error instanceof Error ? error.message : "Failed to save block")
    } finally {
      setIsSavingBlock(false)
    }
  }

  // Overlay the in-progress draft on the preview
  const previewBlocks = selectedBlock
    ? currentEvent.blocks.map((block) => (
        block.id === selectedBlock.id
          ? { ...block, content: draftContent }
          : block
      ))
    : currentEvent.blocks

  // Preview the in-progress title edit while the content editor is open
  const selectedBlockIsContent = selectedBlock?.type === EVENT_CONTENT_BLOCK_TYPE
  const previewEventTitle = selectedBlockIsContent
    ? draftEventTitle.trim() || currentEventData?.title
    : currentEventData?.title

  const viewPageHref = site && currentEventData
    ? `${getSiteUrl(site)}/events/${currentEventData.slug}`
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader
        rightActions={(
          <StickybarTopRightActions
            saveStatus={builderState.saveStatus}
            isSaving={builderState.isSaving}
            onSave={builderState.handleSaveAllBlocks}
            onPublish={handlePublish}
            isPublishing={isPublishing}
            isPublished={Boolean(currentEventData?.is_published)}
            blockListOpen={blockListOpen}
            onToggleBlockList={() => setBlockListOpen(!blockListOpen)}
            settingsDisabled={!currentEventData}
            renderSettingsModal={(show, setShow) => (
              <EventSettingsModal
                open={show}
                onOpenChange={setShow}
                event={currentEventData || null}
                onSuccess={handleEventUpdated}
              />
            )}
          />
        )}
      />
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden border-r bg-background">
          <ScrollArea className="h-full">
            <EventPreview
              blocks={previewBlocks}
              event={currentEventData ? {
                id: currentEventData.id || 'preview',
                title: previewEventTitle || currentEvent.name,
                slug: currentEventData.slug,
                meta_description: currentEventData.meta_description || undefined,
                site_id: currentEventData.site_id,
                featured_image: currentEventData.featured_image || null,
                is_published: currentEventData.is_published || false,
                updated_at: currentEventData.updated_at,
              } : undefined}
              site={{
                id: siteId,
                name: site?.name || 'Event Site',
                subdomain: site?.subdomain || 'preview',
                settings: site?.settings
              }}
              className="min-h-full"
              blocksLoading={blocksLoading}
              allBlocks={currentEvent.blocks}
              onSelectBlock={builderState.setSelectedBlock}
            />
          </ScrollArea>
        </div>

        <EventBlockEditorModal
          block={selectedBlock}
          content={draftContent}
          siteId={siteId}
          eventTitle={draftEventTitle}
          onEventTitleChange={setDraftEventTitle}
          onContentChange={handleDraftChange}
          onClose={handleCloseBlockEditor}
          onSave={handleSaveBlockEditor}
          saving={isSavingBlock}
          error={blockSaveError}
        />

        {blockListOpen && (
          <EventBlockListPanel
            blocks={currentEvent.blocks}
            selectedBlock={selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            viewPageHref={viewPageHref}
            blocksLoading={blocksLoading}
          />
        )}
      </div>
    </div>
  )
}
