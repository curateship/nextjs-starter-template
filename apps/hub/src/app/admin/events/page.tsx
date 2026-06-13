"use client"

import dynamic from "next/dynamic"
import { Calendar } from "lucide-react"

import { ContentListPage } from "@/components/admin/layout/content/ContentListPage"
import {
  deleteEventAction,
  deleteEventsAction,
  duplicateEventAction,
  getSiteEventsWithCategoriesAction,
  type Event,
} from "@/lib/actions/events/event-actions"

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
      deleteItem={deleteEventAction}
      deleteItems={deleteEventsAction}
      duplicateItem={duplicateEventAction}
      duplicateTitle={(event) => `${event.title} (Copy)`}
      emptyButtonLabel="Create Event Item"
      emptyDescription={(events) =>
        events.length === 0 ? "Get started by creating your first event." : "Try adjusting your search or filter criteria."
      }
      emptyTitle={(events) => (events.length === 0 ? "No events yet" : "No events match your filters")}
      formatModified={(event) => new Date(event.updated_at).toLocaleDateString()}
      getItems={getSiteEventsWithCategoriesAction}
      icon={Calendar}
      itemLabel="Event"
      itemLabelPlural="Events"
      listLabel="Events"
      pathPrefix="events"
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
