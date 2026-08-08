import { createServerFn } from "@tanstack/react-start"
import { getSegmentsBySiteImpl, getSegmentByIdImpl, getAvailableSegmentTagsImpl, createSegmentImpl, updateSegmentImpl, deleteSegmentsImpl, getSegmentsWithCountsImpl, refreshDynamicSegmentsForSiteImpl, addContactsToSegmentImpl, removeContactsFromSegmentImpl, getSegmentStatsImpl, getSegmentContactsImpl, getSegmentEngagementOverTimeImpl, getSegmentNewslettersImpl, searchContactsForSegmentImpl } from "./segment-actions.server"
import type { SegmentType, SegmentDynamicRule } from "./segment-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./segment-actions.server"

export const getSegmentsBySite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getSegmentsBySiteImpl(data.siteId, data.options))

export const getSegmentById = createServerFn({ method: "POST" })
  .inputValidator((data: { segmentId: string }) => data)
  .handler(async ({ data }) => getSegmentByIdImpl(data.segmentId))

export const getAvailableSegmentTags = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getAvailableSegmentTagsImpl(data.siteId))

export const createSegment = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof createSegmentImpl>[0] }) => data)
  .handler(async ({ data }) => createSegmentImpl(data.input))

export const updateSegment = createServerFn({ method: "POST" })
  .inputValidator((data: { segmentId: string; updates: { name?: string; description?: string; segmentType?: SegmentType; dynamicRule?: SegmentDynamicRule | null } }) => data)
  .handler(async ({ data }) => updateSegmentImpl(data.segmentId, data.updates))

export const deleteSegments = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => deleteSegmentsImpl(data.ids))

export const getSegmentsWithCounts = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getSegmentsWithCountsImpl(data.siteId, data.options))

export const refreshDynamicSegmentsForSite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => refreshDynamicSegmentsForSiteImpl(data.siteId))

export const addContactsToSegment = createServerFn({ method: "POST" })
  .inputValidator((data: { contactIds: string[]; segmentId: string }) => data)
  .handler(async ({ data }) => addContactsToSegmentImpl(data.contactIds, data.segmentId))

export const removeContactsFromSegment = createServerFn({ method: "POST" })
  .inputValidator((data: { contactIds: string[]; segmentId: string }) => data)
  .handler(async ({ data }) => removeContactsFromSegmentImpl(data.contactIds, data.segmentId))

export const getSegmentStats = createServerFn({ method: "POST" })
  .inputValidator((data: { segmentId: string }) => data)
  .handler(async ({ data }) => getSegmentStatsImpl(data.segmentId))

export const getSegmentContacts = createServerFn({ method: "POST" })
  .inputValidator((data: { segmentId: string; page?: number; pageSize?: number }) => data)
  .handler(async ({ data }) => getSegmentContactsImpl(data.segmentId, data.page, data.pageSize))

export const getSegmentEngagementOverTime = createServerFn({ method: "POST" })
  .inputValidator((data: { segmentId: string }) => data)
  .handler(async ({ data }) => getSegmentEngagementOverTimeImpl(data.segmentId))

export const getSegmentNewsletters = createServerFn({ method: "POST" })
  .inputValidator((data: { segmentId: string }) => data)
  .handler(async ({ data }) => getSegmentNewslettersImpl(data.segmentId))

export const searchContactsForSegment = createServerFn({ method: "POST" })
  .inputValidator((data: { segmentId: string; query: string }) => data)
  .handler(async ({ data }) => searchContactsForSegmentImpl(data.segmentId, data.query))
