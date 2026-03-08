"use client"

import { useState, useEffect } from "react"
import { use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useEventData } from "@/hooks/useEventData"
import { useEventBuilder } from "@/hooks/useEventBuilder"
import { useSiteContext } from "@/contexts/site-context"
import { StickyHeader } from "@/components/admin/event-builder/layout/StickyHeader"
import { BlockPropertiesPanel } from "@/components/admin/event-builder/layout/BlockPropertiesPanel"
import { BlockListPanel } from "@/components/admin/event-builder/layout/BlockListPanel"
import { BlockSelectionModal } from "@/components/admin/event-builder/layout/BlockSelectionModal"
import { getSiteEventsAction, updateEventAction } from "@/lib/actions/events/event-actions"
import type { Event } from "@/lib/actions/events/event-actions"

export default function EventBuilderEditor({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentSite } = useSiteContext()
  const [events, setEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)
  // Get initial event from URL params or default to first event
  const initialEvent = searchParams.get('event') || ''
  const [selectedEvent, setSelectedEvent] = useState(initialEvent)
  const [blockModalOpen, setBlockModalOpen] = useState(false)

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
  const { site, blocks, siteBlocks, blocksLoading, siteError } = useEventData(siteId)
  const [localBlocks, setLocalBlocks] = useState(blocks)

  // Update local blocks when server blocks change, auto-add event-content if missing
  useEffect(() => {
    const updated = { ...blocks }
    for (const slug of Object.keys(updated)) {
      const hasContentBlock = updated[slug]?.some(b => b.type === 'event-content')
      if (!hasContentBlock) {
        updated[slug] = [
          {
            id: `event-content-${Date.now()}`,
            type: 'event-content',
            title: 'Content',
            content: { showFeaturedImage: true, body: '', format: 'html' }
          },
          ...(updated[slug] || [])
        ]
      }
    }
    setLocalBlocks(updated)
  }, [blocks])

  const builderState = useEventBuilder({
    blocks: localBlocks,
    setBlocks: setLocalBlocks,
    selectedEvent,
    eventId: events.find(d => d.slug === selectedEvent)?.id,
    currentEvent: events.find(d => d.slug === selectedEvent)
  })

  // Current event data with staged deletions filtered out
  const currentEventData = events.find(d => d.slug === selectedEvent)
  const currentEvent = {
    slug: selectedEvent,
    name: currentEventData?.title || selectedEvent,
    blocks: localBlocks[selectedEvent] || []
  }

  // Handle event change with URL update
  const handleEventChange = (eventSlug: string) => {
    if (eventSlug !== selectedEvent) {
      setSelectedEvent(eventSlug)
      // Ensure blocks array exists for this event
      setLocalBlocks(prev => ({
        ...prev,
        [eventSlug]: prev[eventSlug] || []
      }))
      router.replace(`/admin/events/builder/${siteId}?event=${eventSlug}`)
    }
  }

  // Handle event creation
  const handleEventCreated = (newEvent: Event) => {
    setEvents(prev => [...prev, newEvent])
    // Initialize blocks array for the new event
    setLocalBlocks(prev => ({
      ...prev,
      [newEvent.slug]: []
    }))
    // Switch to the newly created event
    setSelectedEvent(newEvent.slug)
    router.replace(`/admin/events/builder/${siteId}?event=${newEvent.slug}`)
  }

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

  const handleTitleChange = (title: string) => {
    updateCurrentEvent({ title })
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


  return (
    <div className="flex flex-col h-full overflow-hidden">
      <StickyHeader
        breadcrumbItems={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/events", label: "Events" },
          { label: currentEventData?.title || "", isPage: true }
        ]}
        events={events}
        selectedEvent={selectedEvent}
        onEventChange={handleEventChange}
        onEventCreated={handleEventCreated}
        onEventUpdated={handleEventUpdated}
        saveMessage={builderState.saveMessage}
        isSaving={builderState.isSaving}
        onSave={builderState.handleSaveAllBlocks}
        onOpenBlockModal={() => setBlockModalOpen(true)}
      />
      <div className="flex-1 flex overflow-hidden">
        <BlockPropertiesPanel
          selectedBlock={builderState.selectedBlock}
          updateBlockContent={builderState.updateBlockContent}
          siteId={siteId}
          currentEvent={{
            ...currentEvent,
            id: currentEventData?.id,
            title: currentEventData?.title,
            meta_description: currentEventData?.meta_description || undefined,
            site_id: currentEventData?.site_id,
            featured_image: currentEventData?.featured_image,
            description: currentEventData?.description
          }}
          site={{
            id: siteId,
            name: site?.name || 'Event Site',
            subdomain: site?.subdomain || 'preview',
            settings: site?.settings
          }}
          siteBlocks={siteBlocks}
          blocksLoading={blocksLoading}
          onTitleChange={handleTitleChange}
        />

        <BlockListPanel
          currentEvent={currentEvent}
          selectedBlock={builderState.selectedBlock}
          onSelectBlock={builderState.setSelectedBlock}
          onDeleteBlock={builderState.handleDeleteBlock}
          onReorderBlocks={builderState.handleReorderBlocks}
          onPreviewEvent={() => builderState.setSelectedBlock(null)}
          deleting={null}
          blocksLoading={blocksLoading}
        />

        <BlockSelectionModal
          open={blockModalOpen}
          onOpenChange={setBlockModalOpen}
          onAddBlocks={builderState.handleAddBlocks}
          existingBlockTypes={currentEvent.blocks.map(b => b.type)}
        />
      </div>
    </div>
  )
}
