"use client"

import dynamic from "@/lib/dynamic"
import Calendar from "lucide-react/dist/esm/icons/calendar.js"
import Repeat from "lucide-react/dist/esm/icons/repeat.js"

import { ContentListPage } from "@/components/admin/layout/content/ContentListPage"
import { Badge } from "@/components/ui/badge"
import { describeRecurrence } from "@/lib/utils/event-recurrence"
import {
  deleteEventAction,
  deleteEventsAction,
  duplicateEventAction,
  getSiteEventsWithCategoriesAction,
  type Event,
} from "@/lib/actions/events/event-actions"

// Status cell for events: the usual Published/Draft badge plus a series marker so
// owners can see at a glance which events repeat and which are auto-created dates.
function EventStatusBadge({ event }: { event: Event }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {event.is_published ? (
        <Badge variant="default" className="bg-green-100 text-green-800">Published</Badge>
      ) : (
        <Badge variant="secondary">Draft</Badge>
      )}
      {event.recurrence_rule && (
        <Badge variant="outline" className="gap-1" title={describeRecurrence(event.recurrence_rule)}>
          <Repeat className="size-3" /> Repeats
        </Badge>
      )}
      {event.series_id && (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Repeat className="size-3" /> Series date
        </Badge>
      )}
    </div>
  )
}

const CreateEventModal = dynamic(
  () =>
    import("@/components/admin/event-builder/layout/CreateEventModal").then((m) => ({ default: m.CreateEventModal })),
  { ssr: false }
)

const EventSettingsModal = dynamic(
  () =>
    import("@/components/admin/event-builder/layout/EventSettingsModal").then((m) => ({
      default: m.EventSettingsModal,
    })),
  { ssr: false }
)

export default function EventsPage() {
  return (
    <ContentListPage<Event>
      builderPath="/admin/events/builder"
      createButtonLabel="Create Event Item"
      destructiveAction="delete-event"
      deleteItem={((a0) => deleteEventAction({ data: { eventId: a0 } }))}
      deleteItems={((a0) => deleteEventsAction({ data: { eventIds: a0 } }))}
      duplicateItem={((a0, a1) => duplicateEventAction({ data: { eventId: a0, newTitle: a1 } }))}
      duplicateTitle={(event) => `${event.title} (Copy)`}
      emptyButtonLabel="Create Event Item"
      emptyDescription={(events) =>
        events.length === 0 ? "Get started by creating your first event." : "Try adjusting your search or filter criteria."
      }
      emptyTitle={(events) => (events.length === 0 ? "No events yet" : "No events match your filters")}
      formatModified={(event) => new Date(event.updated_at).toLocaleDateString()}
      getItems={((a0, a1) => getSiteEventsWithCategoriesAction({ data: { siteId: a0, options: a1 } }))}
      icon={Calendar}
      itemLabel="Event"
      itemLabelPlural="Events"
      listLabel="Events"
      pathPrefix="events"
      renderStatusBadge={(event) => <EventStatusBadge event={event} />}
      renderCreateModal={({ onCancel, onSuccess }) => (
        <CreateEventModal onSuccess={onSuccess} onCancel={onCancel} />
      )}
      renderSettingsModal={({ item, onOpenChange, onSuccess, open }) => (
        <EventSettingsModal
          open={open}
          onOpenChange={onOpenChange}
          event={item}
          onSuccess={onSuccess}
        />
      )}
      searchPlaceholder="Search events"
      showNoSiteMessage
    />
  )
}
