import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  GUIDE_SORT_COLUMNS,
  MAX_GUIDE_INTRO,
  MAX_GUIDE_LISTINGS,
  MAX_GUIDE_TITLE,
  type GuideSortColumn,
  type GuideStatus,
} from "@/lib/directory/guides"
import { adminGet, adminPost } from "@/server/guards"
import {
  createGuide,
  deleteGuides,
  findGuideForEdit,
  listGuides,
  updateGuide,
  type DirectoryGuide,
  type GuideForEdit,
  type GuideListing,
  type GuideSummary,
} from "@/server/directory/guides"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { getListingErrorMessage } from "./listings"

export type { DirectoryGuide, GuideForEdit, GuideListing, GuideSummary }

/**
 * Admin → Listings → Guides. Every door is admin-only and works on the site
 * the admin has open, read on the server. The server's refusals are sentences
 * about what the admin typed ("Another guide already uses the address
 * best-brunch"), so they pass through.
 */
export const getGuideErrorMessage = getListingErrorMessage

export type GuidesPage = {
  guides: GuideSummary[]
  total: number
  page: number
  pageSize: number
}

const idInput = z.string().min(1).max(36)
const statusInput = z.enum(["draft", "published"])

const loadGuidesPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      search: z.string().max(120).optional(),
      status: statusInput.optional(),
      sort: z.enum(GUIDE_SORT_COLUMNS).optional(),
      direction: z.enum(["asc", "desc"]).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<GuidesPage> => {
    const pageSize = data.limit ?? 50
    const page = data.page ?? 1
    const site = await workspaceIdForRequest(context.user.id)
    const { guides, total } = await listGuides(site, {
      search: data.search,
      status: data.status,
      sort: data.sort,
      direction: data.direction,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
    return { guides, total, page, pageSize }
  })

export function loadGuidesPage(input: {
  search?: string
  status?: GuideStatus
  sort?: GuideSortColumn
  direction?: "asc" | "desc"
  page?: number
  limit?: number
}) {
  return loadGuidesPageFn({ data: input })
}

const loadGuideForEditFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: idInput }))
  .handler(async ({ data, context }): Promise<GuideForEdit | null> => {
    return findGuideForEdit(await workspaceIdForRequest(context.user.id), data.id)
  })

/** The window's whole load: the guide and its listings in order. */
export function loadGuideForEdit(id: string) {
  return loadGuideForEditFn({ data: { id } })
}

const createGuideFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      title: z.string().min(1).max(MAX_GUIDE_TITLE),
      slug: z.string().max(160).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<DirectoryGuide> => {
    return createGuide(await workspaceIdForRequest(context.user.id), data)
  })

export function saveNewGuide(input: { title: string; slug?: string }) {
  return createGuideFn({ data: input })
}

const updateGuideFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: idInput,
      title: z.string().min(1).max(MAX_GUIDE_TITLE).optional(),
      slug: z.string().max(160).optional(),
      intro: z.string().max(MAX_GUIDE_INTRO).optional(),
      coverImage: z.string().max(600).optional(),
      status: statusInput.optional(),
      listingIds: z.array(idInput).max(MAX_GUIDE_LISTINGS).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<DirectoryGuide> => {
    const { id, ...rest } = data
    return updateGuide(await workspaceIdForRequest(context.user.id), id, rest)
  })

export function saveGuide(input: {
  id: string
  title?: string
  slug?: string
  intro?: string
  coverImage?: string
  status?: GuideStatus
  /** The whole list, in the guide's new order. */
  listingIds?: string[]
}) {
  return updateGuideFn({ data: input })
}

const deleteGuidesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(idInput).min(1).max(500) }))
  .handler(
    async ({ data, context }): Promise<{ done: string[]; kept: string[] }> => {
      return deleteGuides(await workspaceIdForRequest(context.user.id), data.ids)
    }
  )

/** One request for the whole selection; the result counts honestly. */
export function removeGuides(ids: string[]) {
  return deleteGuidesFn({ data: { ids } })
}
