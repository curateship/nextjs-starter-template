import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import { PAGE_MAX_LENGTH } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import { FLOW_TABS, type FlowTab } from "@/lib/video/flow/flow-search"
import { userGet, userPost } from "@/server/guards"
import type { FlowPage } from "@/server/video/flow/page"

export type { FlowPage }

/**
 * The Flow dashboard's left page, the person's own: read, written on,
 * locked, its cover, and the Dashboards block's rows. Every one reads and
 * writes the signed-in person's row and nobody else's.
 */

const server = () => import("@/server/video/flow/page")
const sectionsSchema = z.array(z.enum(FLOW_TABS)).max(FLOW_TABS.length)

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => server().then((m) => m.getFlowPage(context.user.id)))

const savePageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) => {
    await (await server()).saveFlowPageBody(context.user.id, data.body)
    return { saved: true }
  })

const setLockFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) => {
    await (await server()).setFlowPageLock(context.user.id, data.locked)
    return { locked: data.locked }
  })

const setCoverFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  // Checked by the shared cover rules (`src/lib/notes/page-cover.ts`).
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) => {
    const cover = { coverUrl: data.coverUrl || null, coverImages: data.coverImages }
    await (await server()).setFlowPageCover(context.user.id, cover)
    return cover
  })

const setSectionsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ hiddenSections: sectionsSchema.optional(), sectionOrder: sectionsSchema.optional() }))
  .handler(async ({ data, context }) => {
    await (await server()).setFlowPageSections(context.user.id, data)
    return { saved: true }
  })

export function loadFlowPage() {
  return loadPageFn()
}

export function saveFlowPage(body: string) {
  return savePageFn({ data: { body } })
}

export function lockFlowPage(locked: boolean) {
  return setLockFn({ data: { locked } })
}

export function setFlowPageCoverPhoto(cover: { coverUrl: string | null; coverImages: string[] }) {
  return setCoverFn({ data: cover })
}

export function setFlowPageSections(sections: { hiddenSections?: FlowTab[]; sectionOrder?: FlowTab[] }) {
  return setSectionsFn({ data: sections })
}

export const getFlowPageErrorMessage = createErrorMessage(
  {
    FLOW_PAGE_LOCKED: "The page is locked. Unlock it in the ⋮ to write on it.",
    FLOW_PAGE_TOO_LONG: "The page is too long to save. Take something off it.",
  },
  "That did not save. Try again."
)
