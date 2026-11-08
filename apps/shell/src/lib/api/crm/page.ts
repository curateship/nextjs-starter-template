import { createServerFn } from "@tanstack/react-start"

import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import { z } from "zod"

import type { StoredPage } from "@/lib/notes/page-body"
import { PAGE_MAX_LENGTH } from "@/lib/notes/page-body"
import {
  addInboundAddress,
  INBOUND_ADDRESS_MAX,
  INBOUND_LABEL_MAX,
  removeInboundAddress,
  renameInboundAddress,
} from "@/server/crm/addresses"
import {
  getCrmBlockFigures,
  getCrmPage,
  saveCrmPageBody,
  setCrmPageCover,
  setCrmPageLock,
  type CrmBlockFigures,
} from "@/server/crm/page"
import { saveCrmUnansweredDays } from "@/server/email/settings"
import { adminGet, adminPost } from "@/server/guards"
import { currentWorkspaceId } from "@/server/people/workspaces"

import { createErrorMessage } from "../error-message"

/**
 * The CRM dashboard's left page and what its blocks draw (the Admin 3 panel
 * design, 7 Nov 2026), and the addresses mail arrives at, which the + in that
 * panel's header adds to.
 */

export type { CrmBlockFigures }

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<{ page: StoredPage; figures: CrmBlockFigures }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const [page, figures] = await Promise.all([
      getCrmPage(workspaceId),
      getCrmBlockFigures(workspaceId),
    ])
    return { page, figures }
  })

const loadFiguresFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<CrmBlockFigures> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return getCrmBlockFigures(workspaceId)
  })

const savePageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await saveCrmPageBody(workspaceId, data.body)
    return { saved: true }
  })

const setLockFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await setCrmPageLock(workspaceId, data.locked)
    return { locked: data.locked }
  })

// The cover picked and the page's pictures, checked by the shared rules
// (`src/lib/notes/page-cover.ts`): none, the sky, or a picture at https or a
// path on this site.
const setCoverFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const cover = { coverUrl: data.coverUrl || null, coverImages: data.coverImages }
    await setCrmPageCover(workspaceId, cover)
    return cover
  })

const addAddressFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      address: z.string().trim().min(1).max(INBOUND_ADDRESS_MAX),
      label: z.string().trim().max(INBOUND_LABEL_MAX).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const result = await addInboundAddress(workspaceId, data)
    if (!result.added) {
      throw new Error(
        result.reason === "taken" ? "CRM_ADDRESS_TAKEN" : "CRM_ADDRESS_INVALID"
      )
    }
    return result.address
  })

// Up to 300: the Settings → Email address not yet on the list has an id of
// `settings:` and the address.
const addressIdSchema = z.object({ id: z.string().min(1).max(300) })

const renameAddressFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(addressIdSchema.extend({ label: z.string().max(INBOUND_LABEL_MAX) }))
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    if (!(await renameInboundAddress(workspaceId, data.id, data.label))) {
      throw new Error("CRM_ADDRESS_NOT_FOUND")
    }
    return { renamed: true }
  })

const removeAddressFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(addressIdSchema)
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    if (!(await removeInboundAddress(workspaceId, data.id))) {
      throw new Error("CRM_ADDRESS_NOT_FOUND")
    }
    return { removed: true }
  })

const setUnansweredDaysFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ days: z.number().int().min(0).max(60) }))
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await saveCrmUnansweredDays(workspaceId, data.days)
    return { days: data.days }
  })

/** After how many days the bell chases unanswered mail; 0 turns it off. */
export function setCrmUnansweredDays(days: number) {
  return setUnansweredDaysFn({ data: { days } })
}

export function loadCrmPage() {
  return loadPageFn()
}

export function loadCrmBlockFigures() {
  return loadFiguresFn()
}

export function saveCrmPage(body: string) {
  return savePageFn({ data: { body } })
}

export function lockCrmPage(locked: boolean) {
  return setLockFn({ data: { locked } })
}

export function setCrmPageCoverPhoto(cover: { coverUrl: string | null; coverImages: string[] }) {
  return setCoverFn({ data: cover })
}

export function addCrmAddress(address: string, label?: string) {
  return addAddressFn({ data: { address, label } })
}

export function renameCrmAddress(id: string, label: string) {
  return renameAddressFn({ data: { id, label } })
}

export function removeCrmAddress(id: string) {
  return removeAddressFn({ data: { id } })
}

export const getCrmPageErrorMessage = createErrorMessage(
  {
    CRM_PAGE_LOCKED: "The page is locked. Unlock it in the ⋮ to write on it.",
    CRM_PAGE_TOO_LONG: "The page is too long to save. Take something off it.",
    CRM_ADDRESS_TAKEN: "That address is already on the list.",
    CRM_ADDRESS_INVALID: "That is not an email address.",
    CRM_ADDRESS_NOT_FOUND: "That address is no longer on the list.",
  },
  "That did not save. Try again."
)
