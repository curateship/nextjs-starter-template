"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useEventData } from "@/components/admin/event-builder/config/useEventData"
import { useEventBuilder } from "@/components/admin/event-builder/config/useEventBuilder"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickybarTopRightActions } from "@/components/admin/layout/stickybar/StickybarTopRightActions"
import { StickyHeader as DashboardStickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { EventSettingsModal } from "@/components/admin/event-builder/layout/EventSettingsModal"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BlockListPanel } from "@/components/admin/layout/builder/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/layout/builder/BlockSelectionModal"
import { EVENT_BLOCK_TYPES } from "@/components/admin/event-builder/config/event-block-types"
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
  const { currentSite } = useSiteSwitcher()
  const [events, setEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)
  // Get initial event from URL params or default to first event
  const initialEvent = searchParams.get('event') || ''
  const [selectedEvent, setSelectedEvent] = useState(initialEvent)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockListOpen, setBlockListOpen] = useState(true)

  // Redirect when site changes in sidebar
  useEffect(() => {
    if (currentSite && currentSite.id !== siteId) {
      router.push(`/admin/events/builder/${currentSite.id}`)
    }
  }, [currentSite, siteId, router])

  // Load events data
  useEffect(() => {
    async function loadEvents() {
      try {
        setEventsLoading(true)
        setEventsError(null)
        const { data, error } = await getSiteEventsAction(siteId)
        if (error) {
          setEventsError(error)
          return
        }
        setEvents(data || [])

        // If initial event doesn't exist, redirect to first event
        if (data && data.length > 0) {
          const eventExists = data.some(d => d.slug === initialEvent)
          if (!eventExists) {
            const firstEvent = data[0]
            setSelectedEvent(firstEvent.slug)
            router.replace(`/admin/events/builder/${siteId}?event=${firstEvent.slug}`)
          }
        }
      } catch (err) {
        setEventsError('Failed to load events')
      } finally {
        setEventsLoading(false)
      }
    }

    loadEvents()
  }, [siteId, initialEvent, router])

  // Custom hooks for data and state management
  const { site, blocks, blocksLoading, siteError, reloadBlocks } = useEventData(siteId)
  const [localBlocks, setLocalBlocks] = useState(blocks)

  // Update local blocks when server blocks change
  useEffect(() => {
    setLocalBlocks({ ...blocks })
  }, [blocks])

  const builderState = useEventBuilder({
    blocks: localBlocks,
    setBlocks: setLocalBlocks,
    selectedEvent,
    eventId: events.find(d => d.slug === selectedEvent)?.id,
    currentEvent: events.find(d => d.slug === selectedEvent)
  })
  const selectedBlock = builderState.selectedBlock
  const [draftContent, setDraftContent] = useState<Record<string, any>>({})
  const [draftEventTitle, setDraftEventTitle] = useState("")
  const [isSavingBlock, setIsSavingBlock] = useState(false)
  const [blockSaveError, setBlockSaveError] = useState<string | null>(null)

  // Current event data with staged deletions filtered out
  const currentEventData = events.find(d => d.slug === selectedEvent)
  const currentEvent = {
    slug: selectedEvent,
    name: currentEventData?.title || selectedEvent,
    blocks: localBlocks[selectedEvent] || []
  }

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

  // Handle event updates
  const handleEventUpdated = (updatedEvent: Event) => {
    setEvents(prev => prev.map(d => d.id === updatedEvent.id ? updatedEvent : d))

    // If the slug changed, we need to update our local blocks and URL
    const currentEvent = events.find(d => d.id === updatedEvent.id)
    if (currentEvent && currentEvent.slug !== updatedEvent.slug) {
      // Move blocks from old slug to new slug
      setLocalBlocks(prev => {
        const blocksForEvent = prev[currentEvent.slug] || []
        const { [currentEvent.slug]: removed, ...rest } = prev
        return {
          ...rest,
          [updatedEvent.slug]: blocksForEvent
        }
      })

      // Update selected event and URL
      setSelectedEvent(updatedEvent.slug)
      router.replace(`/admin/events/builder/${siteId}?event=${updatedEvent.slug}`)
    }
  }

  // Handle event information updates
  const updateCurrentEvent = async (updates: { title?: string; description?: string; featured_image?: string; is_published?: boolean }) => {
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

  const handleTitleChange = (title: string) => {
    updateCurrentEvent({ title })
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

      let updatedEvent: Event | null = null
      if (
        selectedBlock.type === "event-content" &&
        draftEventTitle.trim() &&
        draftEventTitle.trim() !== (currentEventData?.title || "")
      ) {
        const { data, error } = await updateEventAction(currentEventData.id, { title: draftEventTitle.trim() })
        if (error || !data) {
          setBlockSaveError(error || "Failed to save event title")
          return
        }
        updatedEvent = data
      }

      const existingContentBlocks = currentEventData?.content_blocks || {}
      const preservedSettings: Record<string, any> = {}
      Object.entries(existingContentBlocks).forEach(([key, value]) => {
        if (typeof value !== "object" || value === null || key.startsWith("_")) {
          preservedSettings[key] = value
        }
      })

      const nextContentBlocks: Record<string, any> = { ...preservedSettings }
      nextBlocks.forEach((block, index) => {
        nextContentBlocks[block.id] = {
          id: block.id,
          type: block.type,
          content: block.content,
          display_order: index,
        }
      })

      const result = await updateEventBlocksAction(currentEventData.id, nextContentBlocks)
      if (!result.success) {
        setBlockSaveError(result.error || "Failed to save block")
        return
      }

      setLocalBlocks((current) => ({
        ...current,
        [selectedEvent]: nextBlocks,
      }))
      if (updatedEvent) {
        handleEventUpdated(updatedEvent)
      }
      builderState.setSelectedBlock(null)
    } catch (error) {
      setBlockSaveError(error instanceof Error ? error.message : "Failed to save block")
    } finally {
      setIsSavingBlock(false)
    }
  }

  // Only show loading state for critical errors (not during normal loading)
  if (!site && siteError) {
    return (
      <AdminLayout noPadding>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 mb-2">{siteError}</p>
            <p className="text-sm text-muted-foreground mb-4">
              Site ID: <code>{siteId}</code>
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Please go to Sites page to get a valid site ID, or create a new site.
            </p>
            <div className="space-x-2">
              <Button asChild>
                <Link href="/admin/sites">Go to Sites</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/sites/new">Create New Site</Link>
              </Button>
            </div>
          </div>
        </div>
      </AdminLayout>
    )
  }

  const viewPageHref = site && currentEventData
    ? `${getSiteUrl(site)}/events/${currentEventData.slug}`
    : null


  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DashboardStickyHeader
        rightActions={(
          <StickybarTopRightActions
            viewPageHref={viewPageHref}
            saveMessage={builderState.saveMessage}
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
                site={currentSite}
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
              blocks={currentEvent.blocks}
              event={currentEventData ? {
                id: currentEventData.id || 'preview',
                title: currentEventData.title || currentEvent.name,
                slug: currentEventData.slug,
                meta_description: currentEventData.meta_description || undefined,
                site_id: currentEventData.site_id,
                featured_image: currentEventData.featured_image || null,
                description: currentEventData.description || null,
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
          <BlockListPanel
            blocks={currentEvent.blocks}
            blockTypes={EVENT_BLOCK_TYPES}
            entityName="event"
            selectedBlock={builderState.selectedBlock}
            onSelectBlock={builderState.setSelectedBlock}
            onDeleteBlock={builderState.handleDeleteBlock}
            onReorderBlocks={builderState.handleReorderBlocks}
            onPreview={() => builderState.setSelectedBlock(null)}
            onAddBlock={() => setBlockModalOpen(true)}
            deleting={null}
            blocksLoading={blocksLoading}
          />
        )}

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={builderState.handleAddBlocks}
          existingBlockTypes={currentEvent.blocks.map(b => b.type)}
          blockTypes={EVENT_BLOCK_TYPES}
          entityName="event"
        />
      </div>
    </div>
  )
}
