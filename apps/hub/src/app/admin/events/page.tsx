"use client"

import dynamic from "next/dynamic"
import { Calendar } from "lucide-react"

import {
  AdminModalContent,
  AdminModalDescription,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
import { ContentListPage } from "@/components/admin/layout/content/ContentListPage"
import {
  deleteEventAction,
  deleteEventsAction,
  duplicateEventAction,
  getEventIdsAction,
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
      getIds={getEventIdsAction}
      getItems={getSiteEventsWithCategoriesAction}
      icon={Calendar}
      itemLabel="Event"
      itemLabelPlural="Events"
      listLabel="Events"
      pathPrefix="events"
      renderCreateModal={({ onCancel, onSuccess }) => (
        <AdminModalContent>
          <AdminModalHeader>
            <AdminModalTitle>Create New Event Item</AdminModalTitle>
            <AdminModalDescription>
              Add a new item to your events. You can customize the content after creation.
            </AdminModalDescription>
          </AdminModalHeader>
          <CreateEventModal onSuccess={onSuccess} onCancel={onCancel} />
        </AdminModalContent>
      )}
      renderSettingsModal={({ currentSite, item, onOpenChange, onSuccess, open }) => (
        <EventSettingsModal
          open={open}
          onOpenChange={onOpenChange}
          event={item}
          site={currentSite}
          onSuccess={onSuccess}
        />
      )}
      searchPlaceholder="Search events"
      showNoSiteMessage
    />
  )
}
