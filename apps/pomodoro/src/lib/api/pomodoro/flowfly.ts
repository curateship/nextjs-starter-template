import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { PAGE_MAX_LENGTH } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import { FLOWFLY_PAGE_ERRORS } from "@/lib/pomodoro/flowfly-page"
import { FLOWFLY_LIST_SECTIONS } from "@/lib/pomodoro/flowfly-search"
import { adminGet, adminPost } from "@/server/guards"
import {
  readAdminRoomRecord,
  readAdminTaskRecord,
  readFlowflyCounts,
  readFlowflyOverview,
  readWaitingList,
  type AdminRoomRecord,
  type AdminTaskRecord,
  type FlowflyCounts,
  type FlowflyOverview,
  type WaitingList,
} from "@/server/pomodoro/flowfly-overview"
import {
  getFlowflyPageAndSections,
  getFlowflyWidgets,
  saveFlowflyPageBody,
  saveFlowflySections,
  saveFlowflyWidgets,
  setFlowflyPageCover,
  setFlowflyPageLock,
  type FlowflySections,
} from "@/server/pomodoro/flowfly-page"

export type { AdminRoomRecord, AdminTaskRecord, FlowflyCounts, FlowflyOverview, FlowflySections, WaitingList }
export type { WaitingItem } from "@/server/pomodoro/flowfly-overview"

/**
 * The Flowfly admin dashboard's own doors (Tyler, 13 Nov 2026): each admin's
 * left page and Overview layout, the Dashboards block's counts, Waiting on
 * you, and the Overview figures. Every one is admin only, and the page ones
 * are the signed-in admin's own.
 */

export const getFlowflyErrorMessage = createErrorMessage(
  {
    [FLOWFLY_PAGE_ERRORS.tooLong]: FLOWFLY_PAGE_ERRORS.tooLong,
    [FLOWFLY_PAGE_ERRORS.locked]: FLOWFLY_PAGE_ERRORS.locked,
  },
  "That did not work. Please try again."
)

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => getFlowflyPageAndSections(context.user.id))

const sectionSchema = z.array(z.enum(FLOWFLY_LIST_SECTIONS as [string, ...string[]])).max(FLOWFLY_LIST_SECTIONS.length)

const saveSectionsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ hidden: sectionSchema, order: sectionSchema }))
  .handler(async ({ data, context }) => saveFlowflySections(context.user.id, data as FlowflySections))

const savePageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) => saveFlowflyPageBody(context.user.id, data.body))

const lockPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) => setFlowflyPageLock(context.user.id, data.locked))

const coverFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) => setFlowflyPageCover(context.user.id, data))

const rowSchema = z.object({
  columns: z.number().int().min(0).max(4),
  spots: z.array(z.string().max(80).nullable()).max(4),
})

const loadWidgetsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<WidgetLayout> => getFlowflyWidgets(context.user.id))

const saveWidgetsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ top: rowSchema, bottom: rowSchema }))
  .handler(async ({ data, context }): Promise<WidgetLayout> => saveFlowflyWidgets(context.user.id, data))

const countsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<FlowflyCounts> => readFlowflyCounts())

const waitingFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<WaitingList> => readWaitingList())

const overviewFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<FlowflyOverview> => readFlowflyOverview())

const taskRecordFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ taskId: z.string().uuid() }))
  .handler(async ({ data }): Promise<AdminTaskRecord | null> => readAdminTaskRecord(data.taskId))

const roomRecordFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ roomId: z.string().uuid() }))
  .handler(async ({ data }): Promise<AdminRoomRecord | null> => readAdminRoomRecord(data.roomId))

/** One room's reports, invitations, bans and weekly rule, for its record on the right. */
export function loadFlowflyRoom(roomId: string) {
  return roomRecordFn({ data: { roomId } })
}

/** One task's steps, tags, due date and runs, for its record on the right. */
export function loadFlowflyTask(taskId: string) {
  return taskRecordFn({ data: { taskId } })
}

/** The left page and the Dashboards block's hidden sections and order. */
export function loadFlowflyPage() {
  return loadPageFn()
}
export function saveFlowflyPageSections(sections: FlowflySections) {
  return saveSectionsFn({ data: sections })
}
export function saveFlowflyPage(body: string) {
  return savePageFn({ data: { body } })
}
export function lockFlowflyPage(locked: boolean) {
  return lockPageFn({ data: { locked } })
}
export function setFlowflyPageCoverPhoto(cover: { coverUrl: string | null; coverImages: string[] }) {
  return coverFn({ data: cover })
}
export function loadFlowflyWidgets() {
  return loadWidgetsFn()
}
export function saveFlowflyWidgetLayout(layout: WidgetLayout) {
  return saveWidgetsFn({ data: layout })
}
/** Each section's pill on the Dashboards block. */
export function loadFlowflyCounts() {
  return countsFn()
}
/** Reports, shared files and held lines waiting, oldest first. */
export function loadFlowflyWaiting() {
  return waitingFn()
}
/** The five Overview widgets' figures. */
export function loadFlowflyOverview() {
  return overviewFn()
}
