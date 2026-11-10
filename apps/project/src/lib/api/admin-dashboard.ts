import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { ADMIN_PAGE_SIDES, type AdminPageSide } from "@/lib/admin-dashboard/admin-page"
import { WIDGET_BOARDS, type WidgetBoard, type WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { PAGE_MAX_LENGTH, type StoredPage } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import {
  getAdminPage,
  saveAdminPageBody,
  setAdminPageCover,
  setAdminPageLock,
} from "@/server/admin-dashboard/page"
import { adminSectionCounts, type AdminSectionCounts } from "@/server/admin-dashboard/section-counts"
import { getWidgetLayout, saveWidgetLayout } from "@/server/admin-dashboard/widgets"
import { adminGet, adminPost } from "@/server/guards"
import { publicPagesWorkspaceId, workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "./error-message"

/**
 * The Admin dashboard's page, the Dashboards block's counts and
 * Overview's widget layout. Each section's own data comes from its reader
 * (`api/traffic`, `api/ai`, `api/billing/usage`, `api/people/admin-users`,
 * `api/feedback`, `api/media/admin-media`).
 */

export type { AdminSectionCounts }

const sideSchema = z.enum(ADMIN_PAGE_SIDES)

const loadPagesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<Record<AdminPageSide, StoredPage>> => {
    const workspaceId = await workspaceIdForRequest(context.user.id)
    return { left: await getAdminPage(workspaceId, "left") }
  })

const savePageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ side: sideSchema, body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) => {
    const workspaceId = await workspaceIdForRequest(context.user.id)
    await saveAdminPageBody(workspaceId, data.side, data.body)
    return { saved: true }
  })

const setLockFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ side: sideSchema, locked: z.boolean() }))
  .handler(async ({ data, context }) => {
    const workspaceId = await workspaceIdForRequest(context.user.id)
    await setAdminPageLock(workspaceId, data.side, data.locked)
    return { locked: data.locked }
  })

const setCoverFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  // Checked by the shared cover rules (`src/lib/notes/page-cover.ts`).
  .inputValidator(z.object({ side: sideSchema, coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) => {
    const workspaceId = await workspaceIdForRequest(context.user.id)
    const cover = { coverUrl: data.coverUrl || null, coverImages: data.coverImages }
    await setAdminPageCover(workspaceId, data.side, cover)
    return cover
  })

const loadCountsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<AdminSectionCounts> => {
    const [workspaceId, pagesWorkspaceId] = await Promise.all([
      workspaceIdForRequest(context.user.id),
      publicPagesWorkspaceId(context.user.id),
    ])
    return adminSectionCounts(workspaceId, pagesWorkspaceId)
  })

const boardSchema = z.enum(WIDGET_BOARDS)

const loadWidgetsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ board: boardSchema }))
  .handler(async ({ data, context }): Promise<WidgetLayout> => {
    const workspaceId = await workspaceIdForRequest(context.user.id)
    return getWidgetLayout(workspaceId, data.board)
  })

// The shape only; `saveWidgetLayout` cleans the values (columns in range,
// known widgets, each once) before anything is stored.
const rowSchema = z.object({
  columns: z.number().int().min(0).max(4),
  spots: z.array(z.string().max(80).nullable()).max(4),
})

const saveWidgetsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ board: boardSchema, layout: z.object({ top: rowSchema, bottom: rowSchema }) }))
  .handler(async ({ data, context }): Promise<WidgetLayout> => {
    const workspaceId = await workspaceIdForRequest(context.user.id)
    return saveWidgetLayout(workspaceId, data.board, data.layout)
  })

export function loadAdminSectionCounts() {
  return loadCountsFn()
}

/** A dashboard's Overview widgets: the Admin dashboard's, or the CRM's. */
export function loadOverviewWidgets(board: WidgetBoard) {
  return loadWidgetsFn({ data: { board } })
}

export function saveOverviewWidgets(board: WidgetBoard, layout: WidgetLayout) {
  return saveWidgetsFn({ data: { board, layout } })
}

export function loadAdminPages() {
  return loadPagesFn()
}

export function saveAdminPage(side: AdminPageSide, body: string) {
  return savePageFn({ data: { side, body } })
}

export function lockAdminPage(side: AdminPageSide, locked: boolean) {
  return setLockFn({ data: { side, locked } })
}

export function setAdminPageCoverPhoto(side: AdminPageSide, cover: { coverUrl: string | null; coverImages: string[] }) {
  return setCoverFn({ data: { side, ...cover } })
}

export const getAdminPageErrorMessage = createErrorMessage(
  {
    ADMIN_PAGE_LOCKED: "The page is locked. Unlock it in the ⋮ to write on it.",
    ADMIN_PAGE_TOO_LONG: "The page is too long to save. Take something off it.",
  },
  "That did not save. Try again."
)

export const getAdminErrorMessage = createErrorMessage(
  { FORBIDDEN: "Only an admin can see the Admin dashboard." },
  "The dashboard could not be loaded. Please try again."
)
