import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { ANTI_DETECT_PAGE_ERRORS } from "@/lib/anti-detect/page"
import { ANTI_DETECT_LIST_SECTIONS } from "@/lib/anti-detect/search"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { PAGE_MAX_LENGTH } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import {
  getAntiDetectPageAndSections,
  getAntiDetectWidgets,
  saveAntiDetectPageBody,
  saveAntiDetectSections,
  saveAntiDetectWidgets,
  setAntiDetectPageCover,
  setAntiDetectPageLock,
  type AntiDetectSections,
} from "@/server/anti-detect/page"
import { adminGet, adminPost } from "@/server/guards"

import { createErrorMessage } from "./error-message"

export type { AntiDetectSections }

/**
 * The Anti Detect dashboard's own records (Tyler, 12 Nov 2026): each
 * person's left page and Overview layout. Every one is admin only and the
 * signed-in person's own.
 */

export const getAntiDetectErrorMessage = createErrorMessage(
  {
    [ANTI_DETECT_PAGE_ERRORS.tooLong]: ANTI_DETECT_PAGE_ERRORS.tooLong,
    [ANTI_DETECT_PAGE_ERRORS.locked]: ANTI_DETECT_PAGE_ERRORS.locked,
  },
  "That did not work. Please try again."
)

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => getAntiDetectPageAndSections(context.user.id))

const sectionSchema = z
  .array(z.enum(ANTI_DETECT_LIST_SECTIONS as [string, ...string[]]))
  .max(ANTI_DETECT_LIST_SECTIONS.length)

const saveSectionsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ hidden: sectionSchema, order: sectionSchema }))
  .handler(async ({ data, context }) => saveAntiDetectSections(context.user.id, data as AntiDetectSections))

const savePageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) => saveAntiDetectPageBody(context.user.id, data.body))

const lockPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) => setAntiDetectPageLock(context.user.id, data.locked))

const coverFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) => setAntiDetectPageCover(context.user.id, data))

const rowSchema = z.object({
  columns: z.number().int().min(0).max(4),
  spots: z.array(z.string().max(80).nullable()).max(4),
})

const loadWidgetsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<WidgetLayout> => getAntiDetectWidgets(context.user.id))

const saveWidgetsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ top: rowSchema, bottom: rowSchema }))
  .handler(async ({ data, context }): Promise<WidgetLayout> => saveAntiDetectWidgets(context.user.id, data))

/** The left page and the Dashboards block's hidden sections and order. */
export function loadAntiDetectPage() {
  return loadPageFn()
}
export function saveAntiDetectPageSections(sections: AntiDetectSections) {
  return saveSectionsFn({ data: sections })
}
export function saveAntiDetectPage(body: string) {
  return savePageFn({ data: { body } })
}
export function lockAntiDetectPage(locked: boolean) {
  return lockPageFn({ data: { locked } })
}
export function setAntiDetectPageCoverPhoto(cover: { coverUrl: string | null; coverImages: string[] }) {
  return coverFn({ data: cover })
}
export function loadAntiDetectWidgets() {
  return loadWidgetsFn()
}
export function saveAntiDetectWidgetLayout(layout: WidgetLayout) {
  return saveWidgetsFn({ data: layout })
}
