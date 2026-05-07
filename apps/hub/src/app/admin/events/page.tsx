"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { Badge } from "@/components/ui/badge"
import { Dialog } from "@/components/ui/dialog"
import {
  AdminModalContent,
  AdminModalDescription,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"

import { Checkbox } from "@/components/ui/checkbox"
import { Eye, Copy, Trash2, Settings, Calendar, AlertCircle, Plus, List, Globe, FileEdit } from "lucide-react"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import dynamic from "next/dynamic"

const CreateEventModal = dynamic(() =>
  import("@/components/admin/event-builder/layout/CreateEventModal").then(m => ({ default: m.CreateEventModal })),
  { ssr: false }
)
const EventSettingsModal = dynamic(() =>
  import("@/components/admin/event-builder/layout/EventSettingsModal").then(m => ({ default: m.EventSettingsModal })),
  { ssr: false }
)
import { getSiteEventsWithCategoriesAction, deleteEventAction, deleteEventsAction, duplicateEventAction, getEventIdsAction } from "@/lib/actions/events/event-actions"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import type { Event } from "@/lib/actions/events/event-actions"

type EventSortColumn = 'title' | 'category' | 'status' | 'modified'

export default function EventsPage() {
  const router = useRouter()
  const { currentSite, pageSize: contextPageSize } = useSiteSwitcher()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [filterPrivacy] = useState<'all' | 'public' | 'private'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [eventCategories, setEventCategories] = useState<Record<string, CategoryInfo[]>>({})
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const eventSelection = useAdminBulkSelection()
  const eventSort = useAdminSort<EventSortColumn>()
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize

  // Load events data
  useEffect(() => {
    async function loadEvents() {
      if (!currentSite?.id) {
        setLoading(false)
        setEvents([])
        setEventCategories({})
        setTotal(0)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const { data: eventsData, categories, total: eventsTotal, error: eventsError } = await getSiteEventsWithCategoriesAction(currentSite.id, { page: currentPage, pageSize })

        if (eventsError) {
          setError(eventsError)
          setEvents([])
        } else {
          const loadedEvents = eventsData || []
          setEvents(loadedEvents)
          setTotal(eventsTotal)
          if (categories) setEventCategories(categories)
        }
      } catch (err) {
        setError('An unexpected error occurred')
        setEvents([])
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [currentSite?.id, currentPage, pageSize])

  // Handle delete confirmation
  const handleDeleteClick = (eventId: string) => {
    setPendingDeleteId(eventId)
  }

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return

    const eventIdToDelete = pendingDeleteId

    // Close dialog immediately and clear state
    setPendingDeleteId(null)

    try {
      setDeleting(true)
      const { success, error: deleteError } = await deleteEventAction(eventIdToDelete)

      if (!success) {
        setError(deleteError || 'Failed to delete event')
        return
      }

      // Remove from local state
      setEvents(prev => prev.filter(event => event.id !== eventIdToDelete))

    } catch (err) {
      setError('Failed to delete event')
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteCancel = () => {
    setPendingDeleteId(null)
    setDeleting(false)
  }

  // Handle duplicate
  const handleDuplicate = async (event: Event) => {
    try {
      const duplicateTitle = `${event.title} (Copy)`
      
      const { data, error: duplicateError } = await duplicateEventAction(event.id, duplicateTitle)
      
      if (duplicateError) {
        setError(duplicateError)
        return
      }
      
      if (data) {
        setEvents(prev => [...prev, data])
      }
      
    } catch (err) {
      setError('Failed to duplicate event')
    }
  }

  // Handle opening settings
  const handleOpenSettings = (event: Event) => {
    setSelectedEvent(event)
    setShowSettingsDialog(true)
  }

  // Handle settings success (update event in list)
  const handleSettingsSuccess = (updatedEvent: Event) => {
    setEvents(prev => prev.map(e => e.id === updatedEvent.id ? updatedEvent : e))
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getEventIdsAction(currentSite.id)
    if (ids) {
      eventSelection.selectAll(ids)
    }
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const ids = Array.from(eventSelection.selectedIds)
      const idsToDelete = new Set(ids)
      const { success, error: deleteError } = await deleteEventsAction(ids)
      if (deleteError) {
        setErrorMessage(deleteError || 'Failed to delete events')
        return
      }
      if (success) {
        setEvents(prev => prev.filter(e => !idsToDelete.has(e.id)))
        eventSelection.clearSelection()
      }
    } catch (err) {
      setErrorMessage('Failed to delete events')
    } finally {
      setMassDeleting(false)
    }
  }

  const getStatusBadge = (event: Event) => {
    if (event.is_published) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Published</Badge>
    }
    return <Badge variant="secondary">Draft</Badge>
  }

  // Helper function to check if event is private
  const isEventPrivate = (event: Event) => {
    return event.content_blocks?._settings?.is_private === true
  }

  // Filter events based on status and privacy
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredEvents = events.filter(event => {
    // Status filter
    let statusMatch = true
    if (filterStatus === 'published') statusMatch = event.is_published
    if (filterStatus === 'draft') statusMatch = !event.is_published
    
    // Privacy filter - only filter when "private" is selected
    let privacyMatch = true
    if (filterPrivacy === 'private') privacyMatch = isEventPrivate(event)

    const categoryText = eventCategories[event.id]?.map(category => category.title).join(" ") ?? ""
    const searchText = `${event.title} ${event.slug} ${event.meta_description ?? ""} ${categoryText}`.toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)
    
    return statusMatch && privacyMatch && searchMatch
  })

  const sortedEvents = [...filteredEvents].sort((a, b) => {
    if (!eventSort.sortColumn) return 0
    const dir = eventSort.sortDirection === 'asc' ? 1 : -1
    if (eventSort.sortColumn === 'title') return a.title.localeCompare(b.title) * dir
    if (eventSort.sortColumn === 'status') return (Number(a.is_published) - Number(b.is_published)) * dir
    if (eventSort.sortColumn === 'category') {
      const aCat = eventCategories[a.id]?.[0]?.title || '\uffff'
      const bCat = eventCategories[b.id]?.[0]?.title || '\uffff'
      return aCat.localeCompare(bCat) * dir
    }
    if (eventSort.sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })
  const filteredEventIds = filteredEvents.map((event) => event.id)

  // Get counts for each status
  const statusCounts = {
    all: events.length,
    published: events.filter(e => e.is_published).length,
    draft: events.filter(e => !e.is_published).length
  }

  if (!currentSite) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No Site Selected</h3>
            <p className="text-muted-foreground">Please select a site to manage events.</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          {/* Breadcrumb navigation + action buttons */}
          <DashboardSubheader
            items={[{ label: "Events" }]}
            search={{
              value: searchQuery,
              onValueChange: setSearchQuery,
              placeholder: "Search events",
            }}
            filterMenu={{
              value: filterStatus,
              onValueChange: (value) => { setFilterStatus(value as 'all' | 'published' | 'draft'); eventSelection.clearSelection(); setCurrentPage(1) },
              items: [
                { value: "all", label: "All", icon: List, count: statusCounts.all },
                { value: "published", label: "Published", icon: Globe, count: statusCounts.published },
                { value: "draft", label: "Draft", icon: FileEdit, count: statusCounts.draft },
              ],
            }}
            preActions={
              <AdminBulkDeleteButton
                deleting={massDeleting}
                onClick={() => setMassDeleteConfirmOpen(true)}
                selectedCount={eventSelection.selectedCount}
              />
            }
            actions={
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Create Event Item</span>
              </Button>
            }
          />

        <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={eventSelection.isPageSelected(filteredEventIds)}
                    onCheckedChange={() => eventSelection.togglePage(filteredEventIds)}
                    aria-label="Select all events"
                  />
                  <AdminSortButton active={eventSort.sortColumn === 'title'} direction={eventSort.sortDirection} onClick={() => eventSort.toggleSort('title')}>
                    Event
                  </AdminSortButton>
                </div>
                <AdminSortButton active={eventSort.sortColumn === 'category'} direction={eventSort.sortDirection} onClick={() => eventSort.toggleSort('category')}>
                  Category
                </AdminSortButton>
                <AdminSortButton active={eventSort.sortColumn === 'status'} direction={eventSort.sortDirection} onClick={() => eventSort.toggleSort('status')}>
                  Status
                </AdminSortButton>
                <AdminSortButton active={eventSort.sortColumn === 'modified'} direction={eventSort.sortDirection} onClick={() => eventSort.toggleSort('modified')}>
                  Modified
                </AdminSortButton>
                <div>Actions</div>
              </div>
            </div>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            <AdminSelectionBanner
              allSelected={eventSelection.allSelected}
              onClearSelection={eventSelection.clearSelection}
              onSelectAll={handleSelectAll}
              selectedCount={eventSelection.selectedCount}
              total={total}
              visibleCount={filteredEvents.length}
            />

            <div className="divide-y divide-muted/80">
              {loading ? (
                <AdminListSkeleton rowCount={3} />
              ) : error ? (
                <div className="p-6 text-center">
                  <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
                  <h3 className="mt-4 text-lg font-semibold text-red-900">Error Loading Events</h3>
                  <p className="text-red-700">{error}</p>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="p-12 text-center">
                  <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">
                    {events.length === 0 ? "No events yet" : "No events match your filters"}
                  </h3>
                  <p className="text-muted-foreground mt-2">
                    {events.length === 0 
                      ? "Get started by creating your first event." 
                      : "Try adjusting your search or filter criteria."
                    }
                  </p>
                  {events.length === 0 && (
                    <Button onClick={() => setShowCreateDialog(true)} className="mt-4">
                      Create Event Item
                    </Button>
                  )}
                </div>
              ) : (
                sortedEvents.map((event) => (
                  <div key={event.id} className={`p-6 transition-colors ${eventSelection.selectedIds.has(event.id) ? 'bg-accent/50' : ''}`}>
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <Checkbox
                            checked={eventSelection.selectedIds.has(event.id)}
                            onCheckedChange={() => eventSelection.toggleOne(event.id)}
                            aria-label={`Select ${event.title}`}
                          />
                        <Link
                          href={`/admin/events/builder/${event.site_id}?event=${event.slug}`}
                          className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden ml-2">
                            {event.featured_image ? (
                              <img
                                src={event.featured_image}
                                alt={event.title}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <Calendar className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium hover:underline">{event.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              /events/{event.slug}
                            </p>
                          </div>
                        </Link>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {eventCategories[event.id]?.length ? (
                          eventCategories[event.id].map((cat) => (
                            <Badge key={cat.id} variant="outline" className="text-xs">
                              {cat.title}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                      <div>
                        {getStatusBadge(event)}
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {new Date(event.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleOpenSettings(event)}
                            title="Settings"
                          >
                            <Settings className="h-4 w-4" />
                            <span className="sr-only">Settings</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => window.open(currentSite ? `${getSiteUrl(currentSite)}/events/${event.slug}` : '#', '_blank')}
                            title="Preview"
                          >
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">Preview</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleDuplicate(event)}
                            title="Duplicate"
                          >
                            <Copy className="h-4 w-4" />
                            <span className="sr-only">Duplicate</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                            onClick={() => handleDeleteClick(event.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {!loading && <AdminListFooter currentPage={currentPage} pageSize={pageSize} total={total} onPageChange={setCurrentPage} />}
        </Card>
      </div>

      {/* Create Event Modal */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <AdminModalContent>
          <AdminModalHeader>
            <AdminModalTitle>Create New Event Item</AdminModalTitle>
            <AdminModalDescription>
              Add a new item to your events. You can customize the content after creation.
            </AdminModalDescription>
          </AdminModalHeader>
          <CreateEventModal
            onSuccess={(event, continueToBuilder) => {
              setEvents(prev => [...prev, event])
              setShowCreateDialog(false)
              if (continueToBuilder && currentSite?.id) {
                router.push(`/admin/events/builder/${currentSite.id}?event=${event.slug}`)
              }
            }}
            onCancel={() => setShowCreateDialog(false)}
          />
        </AdminModalContent>
      </Dialog>

      <AdminConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete Event"
        description="Are you sure you want to delete this event? This action cannot be undone."
        disabled={deleting}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        onCancel={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
      />

      <AdminConfirmDialog
        open={massDeleteConfirmOpen}
        title={`Delete ${eventSelection.selectedCount} Event${eventSelection.selectedCount !== 1 ? 's' : ''}`}
        description={`Are you sure you want to delete ${eventSelection.selectedCount} event${eventSelection.selectedCount !== 1 ? 's' : ''}? This action cannot be undone.`}
        confirmLabel={`Delete ${eventSelection.selectedCount} Event${eventSelection.selectedCount !== 1 ? 's' : ''}`}
        onCancel={() => setMassDeleteConfirmOpen(false)}
        onConfirm={confirmMassDelete}
      />

      {/* Settings Modal */}
      {selectedEvent && (
        <EventSettingsModal
          open={showSettingsDialog}
          onOpenChange={setShowSettingsDialog}
          event={selectedEvent}
          site={currentSite}
          onSuccess={handleSettingsSuccess}
        />
      )}
      <AdminErrorDialog
        open={errorMessage !== null}
        message={errorMessage ?? ""}
        onOpenChange={(open) => {
          if (!open) setErrorMessage(null)
        }}
      />
    </AdminLayout>
    </>
  )
}
