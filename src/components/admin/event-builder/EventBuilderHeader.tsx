import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ArrowLeft, Save, Eye, Plus, Settings, CheckCircle } from "lucide-react"
import Link from "next/link"
import { useSiteContext } from "@/contexts/site-context"
import { EventSettingsModal } from "@/components/admin/event-builder/EventSettingsModal"
import { CreateEventModal } from "@/components/admin/event-builder/CreateEventModal"
import type { Event } from "@/lib/actions/events/event-actions"

interface EventBuilderHeaderProps {
  events: Event[]
  selectedEvent: string
  onEventChange: (event: string) => void
  onEventCreated?: (event: Event) => void
  onEventUpdated?: (event: Event) => void
  saveMessage: string
  isSaving: boolean
  onSave: () => void
  onPreviewEvent?: () => void
  eventsLoading?: boolean
}

export function EventBuilderHeader({
  events,
  selectedEvent,
  onEventChange,
  onEventCreated,
  onEventUpdated,
  saveMessage,
  isSaving,
  onSave,
  onPreviewEvent,
  eventsLoading = false
}: EventBuilderHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const { currentSite } = useSiteContext()
  const currentEvent = events.find(d => d.slug === selectedEvent)

  // Generate event URL for frontend viewing
  const getEventUrl = () => {
    if (!currentEvent || !currentSite?.subdomain) {
      return '#'
    }

    // Use dedicated event routing
    const url = `http://localhost:3000/events/${currentEvent.slug}`
    return url
  }

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[57px] z-40">
      <div className="flex h-14 items-center px-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/events">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Events
            </Link>
          </Button>
          <div className="h-4 w-px bg-border"></div>
          <h1 className="text-lg font-semibold">Event Builder</h1>
          <div className="h-4 w-px bg-border"></div>
          <Select value={selectedEvent} onValueChange={onEventChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue>
                {currentEvent ? currentEvent.title : ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.slug}>
                  {event.title}
                  {!event.is_published && " (Draft)"}
                </SelectItem>
              ))}
              <div className="border-t pt-1 mt-2">
                <div
                  className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-foreground text-muted-foreground"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Plus className="h-4 w-4" />
                  </span>
                  Create Event
                </div>
              </div>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={onPreviewEvent}
            disabled={!currentEvent}
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview Event
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
            disabled={!currentEvent || !currentSite?.subdomain}
          >
            <Link href={getEventUrl()} target="_blank">
              <Eye className="w-4 h-4 mr-2" />
              View Event
            </Link>
          </Button>
        </div>
        <div className="ml-auto flex items-center space-x-2">
          {saveMessage && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${
              saveMessage.includes('Error') || saveMessage.includes('Failed')
                ? 'bg-red-50 border border-red-200'
                : 'bg-green-50 border border-green-200'
            }`}>
              <CheckCircle className={`w-4 h-4 ${
                saveMessage.includes('Error') || saveMessage.includes('Failed')
                  ? 'text-red-600'
                  : 'text-green-600'
              }`} />
              <span className={`text-sm font-medium ${
                saveMessage.includes('Error') || saveMessage.includes('Failed')
                  ? 'text-red-800'
                  : 'text-green-700'
              }`}>
                {saveMessage}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEditDialog(true)}
            disabled={!currentEvent}
          >
            <Settings className="w-4 h-4 mr-2" />
            Edit Settings
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Create Event Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
          <DialogHeader>
            <DialogTitle>Create New Event</DialogTitle>
            <DialogDescription>
              Add a new event to your site. You can customize the content after creation.
            </DialogDescription>
          </DialogHeader>
          <CreateEventModal
            onSuccess={(event) => {
              // Add the new event to the list if callback exists
              if (onEventCreated) {
                onEventCreated(event)
              }
              setShowCreateDialog(false)
              // Navigate to the new event's builder page
              onEventChange(event.slug)
            }}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Event Settings Modal */}
      <EventSettingsModal
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        event={currentEvent || null}
        site={currentSite}
        onSuccess={(updatedEvent) => {
          // Update the event in the list
          if (onEventUpdated) {
            onEventUpdated(updatedEvent)
          }
        }}
      />
    </div>
  )
}
