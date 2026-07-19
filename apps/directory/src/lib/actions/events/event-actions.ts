import { createServerFn } from "@tanstack/react-start"
import { getSiteEventsActionImpl, getSiteEventsWithCategoriesActionImpl, getSiteEventsWithMergedBlocksActionImpl, updateEventActionImpl, deleteEventActionImpl, deleteEventsActionImpl, duplicateEventActionImpl, updateEventBlocksActionImpl } from "./event-actions.server"
import type { UpdateEventData } from "./event-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./event-actions.server"

export const getSiteEventsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number; selectedSlug?: string } }) => data)
  .handler(async ({ data }) => getSiteEventsActionImpl(data.siteId, data.options))

export const getSiteEventsWithCategoriesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getSiteEventsWithCategoriesActionImpl(data.siteId, data.options))

export const getSiteEventsWithMergedBlocksAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number; selectedSlug?: string } }) => data)
  .handler(async ({ data }) => getSiteEventsWithMergedBlocksActionImpl(data.siteId, data.options))

export const updateEventAction = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string; data: UpdateEventData }) => data)
  .handler(async ({ data }) => updateEventActionImpl(data.eventId, data.data))

export const deleteEventAction = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string }) => data)
  .handler(async ({ data }) => deleteEventActionImpl(data.eventId))

export const deleteEventsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { eventIds: string[] }) => data)
  .handler(async ({ data }) => deleteEventsActionImpl(data.eventIds))

export const duplicateEventAction = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string; newTitle: string }) => data)
  .handler(async ({ data }) => duplicateEventActionImpl(data.eventId, data.newTitle))

export const updateEventBlocksAction = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string; contentBlocks: Record<string, any> }) => data)
  .handler(async ({ data }) => updateEventBlocksActionImpl(data.eventId, data.contentBlocks))
