"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogPortal,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Eye, Edit, Copy, Trash2, Plus, Settings, MoreHorizontal, Calendar, X, AlertCircle, ExternalLink } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useSiteContext } from "@/contexts/site-context"
import { CreateEventModal } from "@/components/admin/event-builder/CreateEventModal"
import { EventSettingsModal } from "@/components/admin/event-builder/EventSettingsModal"
import { getSiteEventsAction, deleteEventAction, duplicateEventAction } from "@/lib/actions/events/event-actions"
import type { Event, UpdateEventData } from "@/lib/actions/events/event-actions"

export default function EventsPage() {
  const router = useRouter()
  const { currentSite } = useSiteContext()
  const filterRef = useRef<HTMLDivElement>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null)
  const [duplicatingEventId, setDuplicatingEventId] = useState<string | null>(null)
  const [settingsEventId, setSettingsEventId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')
  const [filterPrivacy, setFilterPrivacy] = useState<'all' | 'public' | 'private'>('all')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)

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
        
        const { data: eventsData, error: eventsError } = await getSiteEventsAction(currentSite.id)
        
        if (eventsError) {
          setError(eventsError)
          setEvents([])
        } else {
          setEvents(eventsData)
        }
      } catch (err) {
        setError('An unexpected error occurred')
        setEvents([])
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [currentSite?.id])

  // Handle delete confirmation
  const handleDeleteClick = (eventId: string) => {
    setPendingDeleteId(eventId)
    setConfirmDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return
    
    try {
      setDeleting(true)
      const { success, error: deleteError } = await deleteEventAction(pendingDeleteId)
      
      if (!success) {
        setError(deleteError || 'Failed to delete event')
        return
      }
      
      // Remove from local state
      setEvents(prev => prev.filter(event => event.id !== pendingDeleteId))
      
    } catch (err) {
      setError('Failed to delete event')
    } finally {
      setDeleting(false)
      setConfirmDialogOpen(false)
      setPendingDeleteId(null)
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
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Events"
          subtitle="Manage your event listings"
          primaryAction={{
            label: "Create Event Item",
            onClick: () => setShowCreateDialog(true)
          }}
        />

        <AdminCard>
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Events List</h3>
                  <div className="text-sm text-muted-foreground mt-1">
                    {loading ? (
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
                    ) : (
                      `${filteredEvents.length} ${filteredEvents.length !== 1 ? 'events' : 'event'} ${filterStatus === 'all' && filterPrivacy === 'all' ? 'total' : 
                        `${filterStatus === 'all' ? '' : filterStatus}${filterStatus !== 'all' && filterPrivacy === 'private' ? ', ' : ''}${filterPrivacy === 'private' ? 'private' : ''}`}`
                    )}
                  </div>
                </div>
                <div className="relative" ref={filterRef}>
                  <Button 
                    variant="outline"
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className="flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <span>Filter</span>
                    <svg className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Button>
                  {isFilterOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-card border rounded-md shadow-lg z-10">
                      <div className="py-1">
                        <button 
                          onClick={() => { setFilterStatus('all'); setIsFilterOpen(false) }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                            filterStatus === 'all' ? 'bg-muted font-medium' : ''
                          }`}
                        >
                          All Events ({statusCounts.all})
                        </button>
                        <button 
                          onClick={() => { setFilterStatus('published'); setIsFilterOpen(false) }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                            filterStatus === 'published' ? 'bg-muted font-medium' : ''
                          }`}
                        >
                          Published ({statusCounts.published})
                        </button>
                        <button 
                          onClick={() => { setFilterStatus('draft'); setIsFilterOpen(false) }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                            filterStatus === 'draft' ? 'bg-muted font-medium' : ''
                          }`}
                        >
                          Draft ({statusCounts.draft})
                        </button>
                        <div className="border-t my-1"></div>
                        <button 
                          onClick={() => { setFilterPrivacy('private'); setIsFilterOpen(false) }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                            filterPrivacy === 'private' ? 'bg-muted font-medium' : ''
                          }`}
                        >
                          Private Only ({privacyCounts.private})
                        </button>
                        {(filterStatus !== 'all' || filterPrivacy !== 'all') && (
                          <>
                            <div className="border-t my-1"></div>
                            <button 
                              onClick={() => { 
                                setFilterStatus('all')
                                setFilterPrivacy('all')
                                setIsFilterOpen(false)
                              }}
                              className="block w-full text-left px-4 py-2 text-sm hover:bg-muted text-red-600"
                            >
                              Clear Filters
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Table Header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2">Event</div>
                <div>Status</div>
                <div>Modified</div>
                <div>Actions</div>
              </div>
            </div>

            <div className="divide-y">
              {loading ? (
                <div className="p-6">
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="w-16 h-16 bg-gray-200 rounded animate-pulse"></div>
                          <div className="space-y-2">
                            <div className="h-4 bg-gray-200 rounded animate-pulse w-48"></div>
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-32"></div>
                          </div>
                        </div>
                        <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                      </div>
                    ))}
                  </div>
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
                filteredEvents.map((event) => (
                  <div key={event.id} className="p-6">
                    <div className="grid grid-cols-5 gap-4 items-center">
                      <div className="col-span-2">
                        <Link 
                          href={`/admin/events/builder/${event.site_id}?event=${event.slug}`}
                          className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden">
                            {event.featured_image ? (
                              <img 
                                src={event.featured_image} 
                                alt={event.title}
                                className="w-full h-full object-cover"
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
                      <div>
                        {getStatusBadge(event)}
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {new Date(event.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenSettings(event)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => window.open(`/events/${event.slug}`, '_blank')}>
                                <Eye className="mr-2 h-4 w-4" />
                                Preview
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleDuplicate(event)}>
                                <Copy className="mr-2 h-4 w-4" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDeleteClick(event.id)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
        </AdminCard>
      </div>

      {/* Create Event Modal */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogPortal>
          <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
            <div className="bg-background rounded-lg border shadow-lg w-[700px] max-w-[95vw] p-6 relative my-8">
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
                onSuccess={(event) => {
                  setEvents(prev => [...prev, event])
                  setShowCreateDialog(false)
                }}
                onCancel={() => setShowCreateDialog(false)}
              />
            </div>
          </div>
        </DialogPortal>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Event</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this event? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>

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
    </AdminLayout>
  )
}