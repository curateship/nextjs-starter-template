import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { PAGE_MAX_LENGTH } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import { VIRAL_LIST_SECTIONS } from "@/lib/viral/dashboard-search"
import { adminGet, adminPost } from "@/server/guards"
import {
  getViralPage,
  getViralWidgets,
  saveViralPageBody,
  saveViralSections,
  saveViralWidgets,
  setViralPageCover,
  setViralPageLock,
  viralPageFigures,
  type ViralFolderBlockRow,
  type ViralPageFigures,
  type ViralProjectBlockRow,
  type ViralSectionCounts,
  type ViralSections,
} from "@/server/viral/dashboard-page"

export type { ViralFolderBlockRow, ViralPageFigures, ViralProjectBlockRow, ViralSectionCounts, ViralSections }

/**
 * The Viral dashboard's own records (task features/03): the person's left
 * page, its rows, its figures and Overview's layout. Admin only, like every
 * Viral door, and always the signed-in person's own. Errors read through
 * `getViralErrorMessage`.
 */

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => getViralPage(context.user.id))

const loadFiguresFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<ViralPageFigures> => viralPageFigures(context.user.id))

const sectionSchema = z.array(z.enum(VIRAL_LIST_SECTIONS as [string, ...string[]])).max(VIRAL_LIST_SECTIONS.length)

const saveSectionsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ hidden: sectionSchema, order: sectionSchema }))
  .handler(async ({ data, context }) => saveViralSections(context.user.id, data as ViralSections))

const savePageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) => saveViralPageBody(context.user.id, data.body))

const lockPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) => setViralPageLock(context.user.id, data.locked))

const coverFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) =>
    setViralPageCover(context.user.id, { coverUrl: data.coverUrl || null, coverImages: data.coverImages })
  )

const rowSchema = z.object({
  columns: z.number().int().min(0).max(4),
  spots: z.array(z.string().max(80).nullable()).max(4),
})

const loadWidgetsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<WidgetLayout> => getViralWidgets(context.user.id))

const saveWidgetsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ top: rowSchema, bottom: rowSchema }))
  .handler(async ({ data, context }): Promise<WidgetLayout> => saveViralWidgets(context.user.id, data))

export function loadViralDashboardPage() {
  return loadPageFn()
}
/** Every row's count, the projects and the folders again, after something changed one of them. */
export function loadViralPageFigures() {
  return loadFiguresFn()
}
export function saveViralDashboardSections(sections: ViralSections) {
  return saveSectionsFn({ data: sections })
}
export function saveViralDashboardPage(body: string) {
  return savePageFn({ data: { body } })
}
export function lockViralDashboardPage(locked: boolean) {
  return lockPageFn({ data: { locked } })
}
export function setViralDashboardCover(cover: { coverUrl: string | null; coverImages: string[] }) {
  return coverFn({ data: cover })
}
export function loadViralWidgets() {
  return loadWidgetsFn()
}
export function saveViralWidgetLayout(layout: WidgetLayout) {
  return saveWidgetsFn({ data: layout })
}
