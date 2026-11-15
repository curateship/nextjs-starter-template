import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { PAGE_MAX_LENGTH, type StoredPage } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import {
  getAutomationPage,
  saveAutomationPageBody,
  setAutomationPageCover,
  setAutomationPageLock,
} from "@/server/automations/page"
import { automationSectionCounts } from "@/server/automations/runs"
import { adminGet, adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

/**
 * The Automations dashboard's left page and the Dashboards block's counts.
 * Each section's own rows come from `automations.ts` and `automation-runs.ts`.
 */

/** The two pills: every flow, and every run waiting on you. */
export type AutomationSectionCounts = { automations: number; waiting: number }

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<{ page: StoredPage; counts: AutomationSectionCounts }> => {
    const workspaceId = await workspaceIdForRequest(context.user.id)
    const [page, counts] = await Promise.all([getAutomationPage(workspaceId), automationSectionCounts(workspaceId)])
    return { page, counts }
  })

const loadCountsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<AutomationSectionCounts> =>
    automationSectionCounts(await workspaceIdForRequest(context.user.id))
  )

const savePageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) => {
    await saveAutomationPageBody(await workspaceIdForRequest(context.user.id), data.body)
    return { saved: true }
  })

const setLockFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) => {
    await setAutomationPageLock(await workspaceIdForRequest(context.user.id), data.locked)
    return { locked: data.locked }
  })

const setCoverFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  // Checked by the shared cover rules (`src/lib/notes/page-cover.ts`).
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) => {
    const cover = { coverUrl: data.coverUrl || null, coverImages: data.coverImages }
    await setAutomationPageCover(await workspaceIdForRequest(context.user.id), cover)
    return cover
  })

export function loadAutomationPage() {
  return loadPageFn()
}

export function loadAutomationSectionCounts() {
  return loadCountsFn()
}

export function saveAutomationPage(body: string) {
  return savePageFn({ data: { body } })
}

export function lockAutomationPage(locked: boolean) {
  return setLockFn({ data: { locked } })
}

export function setAutomationPageCoverPhoto(cover: { coverUrl: string | null; coverImages: string[] }) {
  return setCoverFn({ data: cover })
}

export const getAutomationPageErrorMessage = createErrorMessage(
  {
    AUTOMATION_PAGE_LOCKED: "The page is locked. Unlock it in the ⋮ to write on it.",
    AUTOMATION_PAGE_TOO_LONG: "The page is too long to save. Take something off it.",
  },
  "That did not save. Try again."
)
