import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { DATING_WIDGET_IDS, type DatingSections } from "@/lib/dating/dating-page"
import { LEAD_TABS } from "@/lib/dating/leads"
import { PAGE_MAX_LENGTH, type StoredPage } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import { requestAccount } from "@/server/dating/accounts"
import {
  getDatingPage,
  getDatingSections,
  getDatingWidgets,
  saveDatingHiddenSections,
  saveDatingPageBody,
  saveDatingSectionOrder,
  saveDatingWidgets,
  setDatingPageCover,
  setDatingPageLock,
} from "@/server/dating/page"
import { inWords } from "@/server/dating/words"
import { userGet, userPost } from "@/server/guards"

/**
 * The Dating dashboard's left page and Overview's widget layout (task
 * "features/07-three-panel-design"). Every one is behind sign-in and acts on
 * the open profile the server keeps for the member, never on an id sent from
 * the browser.
 */

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ page: StoredPage; sections: DatingSections }> =>
    inWords(async () => {
      const account = await requestAccount(context.user.id)
      const [page, sections] = await Promise.all([getDatingPage(account), getDatingSections(account)])
      return { page, sections }
    })
  )

const savePageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      await saveDatingPageBody(await requestAccount(context.user.id), data.body)
      return { saved: true }
    })
  )

const setLockFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      await setDatingPageLock(await requestAccount(context.user.id), data.locked)
      return { locked: data.locked }
    })
  )

const setCoverFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  // Checked by the shared cover rules (`src/lib/notes/page-cover.ts`).
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const cover = { coverUrl: data.coverUrl || null, coverImages: data.coverImages }
      await setDatingPageCover(await requestAccount(context.user.id), cover)
      return cover
    })
  )

const loadWidgetsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<WidgetLayout> => inWords(async () => getDatingWidgets(await requestAccount(context.user.id))))

const spot = z.enum(DATING_WIDGET_IDS as [string, ...string[]]).nullable()
const row = z.object({ columns: z.number().int().min(0).max(4), spots: z.array(spot).max(4) })

const saveWidgetsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ top: row, bottom: row }))
  .handler(async ({ data, context }): Promise<WidgetLayout> =>
    inWords(async () => saveDatingWidgets(await requestAccount(context.user.id), data))
  )

const sectionList = z.array(z.enum(LEAD_TABS)).max(LEAD_TABS.length)

const saveHiddenFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ hidden: sectionList }))
  .handler(async ({ data, context }) => inWords(async () => saveDatingHiddenSections(await requestAccount(context.user.id), data.hidden)))

const saveOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ order: sectionList }))
  .handler(async ({ data, context }) => inWords(async () => saveDatingSectionOrder(await requestAccount(context.user.id), data.order)))

/** The left page and the Dashboards block's hidden rows and order, together. */
export function loadDatingPage() {
  return loadPageFn()
}

export function saveDatingPage(body: string) {
  return savePageFn({ data: { body } })
}

export function lockDatingPage(locked: boolean) {
  return setLockFn({ data: { locked } })
}

export function setDatingPageCoverPhoto(cover: { coverUrl: string | null; coverImages: string[] }) {
  return setCoverFn({ data: cover })
}

export function loadDatingWidgets() {
  return loadWidgetsFn()
}

export function saveDatingWidgetLayout(layout: WidgetLayout) {
  return saveWidgetsFn({ data: layout })
}

export function saveDatingHiddenSectionList(hidden: string[]) {
  return saveHiddenFn({ data: { hidden: hidden as (typeof LEAD_TABS)[number][] } })
}

export function saveDatingSectionOrderList(order: string[]) {
  return saveOrderFn({ data: { order: order as (typeof LEAD_TABS)[number][] } })
}
