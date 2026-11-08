import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { ADMIN_PAGE_SIDES, type AdminPageSide } from "@/lib/admin-dashboard/admin-page"
import { PAGE_MAX_LENGTH, type StoredPage } from "@/lib/notes/page-body"
import {
  getAdminPage,
  saveAdminPageBody,
  setAdminPageCover,
  setAdminPageLock,
} from "@/server/admin-dashboard/page"
import { adminGet, adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "./error-message"

/**
 * The Admin dashboard's two pages. Each tab's own data comes from its reader
 * (`api/traffic`, `api/ai`, `api/billing/usage`, `api/people/admin-users`,
 * `api/feedback`).
 */

const sideSchema = z.enum(ADMIN_PAGE_SIDES)

const loadPagesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<Record<AdminPageSide, StoredPage>> => {
    const workspaceId = await workspaceIdForRequest(context.user.id)
    const [left, right] = await Promise.all([
      getAdminPage(workspaceId, "left"),
      getAdminPage(workspaceId, "right"),
    ])
    return { left, right }
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

/**
 * A cover is a picture the media library or a pasted address gave: https, or
 * a path on this site. Never `//…`, which a browser reads as another site.
 */
const coverSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => /^\/(?!\/)/.test(value) || /^https:\/\//.test(value))
  .nullable()

const setCoverFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ side: sideSchema, coverUrl: coverSchema }))
  .handler(async ({ data, context }) => {
    const workspaceId = await workspaceIdForRequest(context.user.id)
    await setAdminPageCover(workspaceId, data.side, data.coverUrl || null)
    return { coverUrl: data.coverUrl || null }
  })

export function loadAdminPages() {
  return loadPagesFn()
}

export function saveAdminPage(side: AdminPageSide, body: string) {
  return savePageFn({ data: { side, body } })
}

export function lockAdminPage(side: AdminPageSide, locked: boolean) {
  return setLockFn({ data: { side, locked } })
}

export function setAdminPageCoverPhoto(side: AdminPageSide, coverUrl: string | null) {
  return setCoverFn({ data: { side, coverUrl } })
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
