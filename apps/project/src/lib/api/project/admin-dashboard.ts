import { createServerFn } from "@tanstack/react-start"
import type { z } from "zod"

import { adminPageCoverSchema, adminPageLockSchema, adminPageSchema, adminTimeZoneSchema, myStatusOrderSchema } from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import {
  loadAdminDashboard,
  setAdminPage,
  setAdminPageCover,
  setAdminPageLock,
  setAdminStatusOrder,
  setAdminTimeZone,
} from "@/server/project/admin-dashboard"

// Types only: a value from the server's module here would carry it, its
// database and argon2 into the browser.
export type {
  AdminAttention,
  AdminDashboard,
  AdminProject,
  AdminProjectCards,
  AttentionAsk,
  HandToPerson,
  ProjectFace,
} from "@/server/project/admin-dashboard"

const loadAdminDashboardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadAdminDashboard(context.user.id))

const setAdminTimeZoneFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(adminTimeZoneSchema)
  .handler(async ({ data, context }) => setAdminTimeZone(context.user.id, data.timeZone))

const setAdminPageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(adminPageSchema)
  .handler(async ({ data, context }) => setAdminPage(context.user.id, data.notes))

const setAdminPageLockFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(adminPageLockSchema)
  .handler(async ({ data, context }) => setAdminPageLock(context.user.id, data.locked))

const setAdminPageCoverFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(adminPageCoverSchema)
  .handler(async ({ data, context }) => setAdminPageCover(context.user.id, data))

const setAdminStatusOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(myStatusOrderSchema)
  .handler(async ({ data, context }) => setAdminStatusOrder(context.user.id, data.statusOrder))

/** The site admin's My dashboard: their tasks across every team, their own list and the admin cards. */
export function loadAdminDashboardPage() {
  return loadAdminDashboardFn()
}
/** The site admin's own time zone, from My settings. */
export function saveAdminTimeZone(data: z.input<typeof adminTimeZoneSchema>) {
  return setAdminTimeZoneFn({ data })
}
/** The site admin's own page at the top of My dashboard. */
export function saveAdminPage(notes: unknown) {
  return setAdminPageFn({ data: { notes } })
}
/** The site admin's own page locked or unlocked, from My settings. */
export function saveAdminPageLock(locked: boolean) {
  return setAdminPageLockFn({ data: { locked } })
}
/** The site admin's page cover and its pictures, from its Cover photo row in My settings. */
export function saveAdminPageCover(cover: { coverUrl: string; coverImages: string[] }) {
  return setAdminPageCoverFn({ data: cover })
}
/** The site admin's Board columns in their own order. */
export function saveAdminStatusOrder(statusOrder: z.input<typeof myStatusOrderSchema>["statusOrder"]) {
  return setAdminStatusOrderFn({ data: { statusOrder } })
}
