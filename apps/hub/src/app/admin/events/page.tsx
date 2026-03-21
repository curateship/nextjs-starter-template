"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/admin/layout/dashboard/breadcrumb"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogPortal,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Eye, Copy, Trash2, Settings, Calendar, X, AlertCircle, ArrowUp, ArrowDown, ChevronsUpDown, Plus, List, Globe, FileEdit, HomeIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useSiteContext } from "@/contexts/site-context"
import dynamic from "next/dynamic"

const CreateEventModal = dynamic(() =>
  import("@/components/admin/event-builder/layout/CreateEventModal").then(m => ({ default: m.CreateEventModal })),
  { ssr: false }
)
const EventSettingsModal = dynamic(() =>
  import("@/components/admin/event-builder/layout/EventSettingsModal").then(m => ({ default: m.EventSettingsModal })),
  { ssr: false }
)
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { getSiteEventsWithCategoriesAction, deleteEventAction, deleteEventsAction, duplicateEventAction, getEventIdsAction } from "@/lib/actions/events/event-actions"
import type { CategoryInfo } from "@/lib/actions/categories/category-relationship-actions"
import type { Event, UpdateEventData } from "@/lib/actions/events/event-actions"

export default function EventsPage() {
  const router = useRouter()
  const { currentSite, pageSize: contextPageSize } = useSiteContext()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null)
  const [duplicatingEventId, setDuplicatingEventId] = useState<string | null>(null)
  const [settingsEventId, setSettingsEventId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [filterPrivacy, setFilterPrivacy] = useState<'all' | 'public' | 'private'>('all')
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [eventCategories, setEventCategories] = useState<Record<string, CategoryInfo[]>>({})
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set())
  // Tracks if user selected all items across all pages
  const [allSelected, setAllSelected] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [sortColumn, setSortColumn] = useState<'title' | 'category' | 'status' | 'modified' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = contextPageSize

  // Load events data
  useEffect(() => {
    async function loadEvents() {
      if (!currentSite?.id) {
        setLoading(false)
        setEvents([])
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
  }, [currentSite?.id, currentPage])

  // Handle delete confirmation
  const handleDeleteClick = (eventId: string) => {
    setPendingDeleteId(eventId)
    setConfirmDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return

    const eventIdToDelete = pendingDeleteId

    // Close dialog immediately and clear state
    setConfirmDialogOpen(false)
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
    setConfirmDialogOpen(false)
    setPendingDeleteId(null)
    setDeleting(false)
  }

  // Handle duplicate
  const handleDuplicate = async (event: Event) => {
    try {
      setDuplicating(true)
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
    } finally {
      setDuplicating(false)
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

  const toggleSelectEvent = (eventId: string) => {
    setSelectedEventIds(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) {
        next.delete(eventId)
        setAllSelected(false)
      } else {
        next.add(eventId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedEventIds.size === filteredEvents.length) {
      setSelectedEventIds(new Set())
      setAllSelected(false)
    } else {
      setSelectedEventIds(new Set(filteredEvents.map(e => e.id)))
    }
  }

  // Select all items across all pages (lightweight ID-only fetch)
  const handleSelectAll = async () => {
    if (!currentSite?.id || total === 0) return
    const { ids } = await getEventIdsAction(currentSite.id)
    if (ids) {
      setSelectedEventIds(new Set(ids))
      setAllSelected(true)
    }
  }

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedEventIds(new Set())
    setAllSelected(false)
  }

  const confirmMassDelete = async () => {
    setMassDeleteConfirmOpen(false)
    setMassDeleting(true)
    try {
      const ids = Array.from(selectedEventIds)
      const { success, error: deleteError } = await deleteEventsAction(ids)
      if (deleteError) {
        setErrorMessage(deleteError || 'Failed to delete events')
        setErrorDialogOpen(true)
        return
      }
      if (success) {
        setEvents(prev => prev.filter(e => !selectedEventIds.has(e.id)))
        setSelectedEventIds(new Set())
        setAllSelected(false)
      }
    } catch (err) {
      setErrorMessage('Failed to delete events')
      setErrorDialogOpen(true)
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
  const filteredEvents = events.filter(event => {
    // Status filter
    let statusMatch = true
    if (filterStatus === 'published') statusMatch = event.is_published
    if (filterStatus === 'draft') statusMatch = !event.is_published
    
    // Privacy filter - only filter when "private" is selected
    let privacyMatch = true
    if (filterPrivacy === 'private') privacyMatch = isEventPrivate(event)
    
    return statusMatch && privacyMatch
  })

  const toggleSort = (column: 'title' | 'category' | 'status' | 'modified') => {
    if (sortColumn === column) {
      if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection('asc')
      } else {
        setSortDirection('desc')
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: 'title' | 'category' | 'status' | 'modified') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedEvents = [...filteredEvents].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'title') return a.title.localeCompare(b.title) * dir
    if (sortColumn === 'status') return (Number(a.is_published) - Number(b.is_published)) * dir
    if (sortColumn === 'category') {
      const aCat = eventCategories[a.id]?.[0]?.title || '\uffff'
      const bCat = eventCategories[b.id]?.[0]?.title || '\uffff'
      return aCat.localeCompare(bCat) * dir
    }
    if (sortColumn === 'modified') return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
    return 0
  })

  // Get counts for each status
  const statusCounts = {
    all: events.length,
    published: events.filter(e => e.is_published).length,
    draft: events.filter(e => !e.is_published).length
  }

  // Get counts for each privacy level
  const privacyCounts = {
    all: events.length,
    public: events.filter(e => !isEventPrivate(e)).length,
    private: events.filter(e => isEventPrivate(e)).length
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
          <div className="flex items-center justify-between mb-6 mx-4 mt-2">
            <Breadcrumb>
              <BreadcrumbList className="h-8 gap-2 rounded-md border px-3 text-sm">
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admin">
                    <HomeIcon className="size-4" />
                    <span className="sr-only">Home</span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Events</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="flex items-center gap-1.5 sm:gap-3">
              {selectedEventIds.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => setMassDeleteConfirmOpen(true)}
                  disabled={massDeleting}
                >
                  {massDeleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span className="hidden sm:inline">Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete ({selectedEventIds.size})</span>
                    </>
                  )}
                </Button>
              )}
              <Tabs value={filterStatus} onValueChange={(value) => { setFilterStatus(value as 'all' | 'published' | 'draft'); setSelectedEventIds(new Set()); setAllSelected(false); setCurrentPage(1) }}>
                <TabsList className="h-9 p-1 gap-1">
                  <TabsTrigger value="all" className="px-2 sm:px-3"><List className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">All ({statusCounts.all})</span></TabsTrigger>
                  <TabsTrigger value="published" className="px-2 sm:px-3"><Globe className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Published ({statusCounts.published})</span></TabsTrigger>
                  <TabsTrigger value="draft" className="px-2 sm:px-3"><FileEdit className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Draft ({statusCounts.draft})</span></TabsTrigger>
                </TabsList>
              </Tabs>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Create Event Item</span>
              </Button>
            </div>
          </div>

        <Card className="shadow-sm">
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4">
                  <Checkbox
                    checked={filteredEvents.length > 0 && selectedEventIds.size === filteredEvents.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all events"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort('title')}
                    className={cn(
                      "flex items-center gap-1.5",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                      "cursor-pointer outline-none transition-colors"
                    )}
                  >
                    <span>Event</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('title')}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort('category')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Category</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('category')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('status')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Status</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('status')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('modified')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Modified</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('modified')}</span>
                </button>
                <div>Actions</div>
              </div>
            </div>

            {/* "Select all" banner — shown when all page items selected but more exist */}
            {filteredEvents.length > 0 && selectedEventIds.size === filteredEvents.length && total > filteredEvents.length && (
              <div className="px-6 py-2 bg-accent/50 border-b text-sm text-center">
                {allSelected ? (
                  <span>All {total} items selected. <button type="button" onClick={handleClearSelection} className="underline hover:text-foreground text-muted-foreground">Clear selection</button></span>
                ) : (
                  <span>{filteredEvents.length} items on this page are selected. <button type="button" onClick={handleSelectAll} className="underline font-medium">Select all {total}</button></span>
                )}
              </div>
            )}

            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-6 border-b border-muted/80">
                      <div className="grid grid-cols-6 gap-4 items-center">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4">
                            <div className="w-4 h-4 bg-muted rounded animate-pulse"></div>
                            <div className="w-12 h-12 bg-muted rounded animate-pulse ml-2"></div>
                            <div>
                              <div className="h-4 bg-muted rounded animate-pulse mb-2 w-40"></div>
                              <div className="h-3 bg-muted/60 rounded animate-pulse w-24"></div>
                            </div>
                          </div>
                        </div>
                        <div><div className="h-5 bg-muted rounded-full animate-pulse w-16"></div></div>
                        <div><div className="h-5 bg-muted rounded-full animate-pulse w-16"></div></div>
                        <div><div className="h-3 bg-muted/60 rounded animate-pulse w-16"></div></div>
                        <div><div className="h-8 w-8 bg-muted rounded animate-pulse"></div></div>
                      </div>
                    </div>
                  ))}
                </div>
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
                  <div key={event.id} className={`p-6 transition-colors ${selectedEventIds.has(event.id) ? 'bg-accent/50' : ''}`}>
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4">
                          <Checkbox
                            checked={selectedEventIds.has(event.id)}
                            onCheckedChange={() => toggleSelectEvent(event.id)}
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
                            onClick={() => window.open(currentSite ? `http://${currentSite.subdomain}.localhost:3000/events/${event.slug}` : '#', '_blank')}
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
            {!loading && total > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <PaginationInfo currentPage={currentPage} pageSize={pageSize} total={total} />
                <Pagination currentPage={currentPage} totalPages={Math.ceil(total / pageSize)} onPageChange={setCurrentPage} showFirstLast={false} />
              </div>
            )}
        </Card>
      </div>

      {/* Create Event Modal */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogPortal>
          <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
               onClick={(e) => e.target === e.currentTarget && setShowCreateDialog(false)}>
            <div className="bg-background rounded-lg border shadow-lg w-[840px] max-w-[95vw] p-10 relative my-8"
                 onClick={(e) => e.stopPropagation()}>
              <DialogPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
              <DialogHeader>
                <DialogTitle>Create New Event Item</DialogTitle>
                <DialogDescription>
                  Add a new item to your events. You can customize the content after creation.
                </DialogDescription>
              </DialogHeader>
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
            </div>
          </div>
        </DialogPortal>
      </Dialog>

      {/* Delete Confirmation Modal */}
      {confirmDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={handleDeleteCancel}
          />
          <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
            <h2 className="text-lg font-semibold mb-2">Delete Event</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete this event? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-2 mt-6">
              <Button
                variant="outline"
                onClick={handleDeleteCancel}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mass Delete Confirmation Dialog */}
      {massDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMassDeleteConfirmOpen(false)}
          />
          <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
            <h2 className="text-lg font-semibold mb-2">Delete {selectedEventIds.size} Event{selectedEventIds.size !== 1 ? 's' : ''}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete {selectedEventIds.size} event{selectedEventIds.size !== 1 ? 's' : ''}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setMassDeleteConfirmOpen(false)}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmMassDelete}
                variant="destructive"
              >
                Delete {selectedEventIds.size} Event{selectedEventIds.size !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </div>
      )}

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
      {/* Error Dialog */}
      {errorDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setErrorDialogOpen(false)} />
          <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
            <h2 className="text-lg font-semibold mb-2">Error</h2>
            <p className="text-sm text-muted-foreground mb-4">{errorMessage}</p>
            <div className="flex justify-end">
              <Button onClick={() => setErrorDialogOpen(false)} variant="default">OK</Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
    </>
  )
}