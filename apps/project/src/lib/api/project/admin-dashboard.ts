import { createServerFn } from "@tanstack/react-start"
import type { z } from "zod"

import { adminProjectListSchema, adminTimeZoneSchema, myStatusOrderSchema } from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import {
  loadAdminDashboard,
  setAdminHiddenProjects,
  setAdminProjectOrder,
  setAdminStatusOrder,
  setAdminTimeZone,
} from "@/server/project/admin-dashboard"

export type {
  AdminDashboard,
  AdminProject,
  AdminProjectCards,
  ProjectFace,
  DonePerson,
  MilestoneDue,
  PendingInvite,
  TeamAttention,
  TodayMeeting,
  UnassignedTask,
  WaitingAsk,
} from "@/server/project/admin-dashboard"

const loadAdminDashboardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadAdminDashboard(context.user.id))

const setAdminTimeZoneFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(adminTimeZoneSchema)
  .handler(async ({ data, context }) => setAdminTimeZone(context.user.id, data.timeZone))

const setAdminStatusOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(myStatusOrderSchema)
  .handler(async ({ data, context }) => setAdminStatusOrder(context.user.id, data.statusOrder))

const setAdminHiddenProjectsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(adminProjectListSchema)
  .handler(async ({ data, context }) => setAdminHiddenProjects(context.user.id, data.projectIds))

const setAdminProjectOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(adminProjectListSchema)
  .handler(async ({ data, context }) => setAdminProjectOrder(context.user.id, data.projectIds))

/** The site admin's My dashboard: their tasks across every team, their own list and the admin cards. */
export function loadAdminDashboardPage() {
  return loadAdminDashboardFn()
}
/** The site admin's own time zone, from My settings. */
export function saveAdminTimeZone(data: z.input<typeof adminTimeZoneSchema>) {
  return setAdminTimeZoneFn({ data })
}
/** The site admin's Board columns in their own order. */
export function saveAdminStatusOrder(statusOrder: z.input<typeof myStatusOrderSchema>["statusOrder"]) {
  return setAdminStatusOrderFn({ data: { statusOrder } })
}
/** The projects the site admin hid from their Projects card. */
export function saveAdminHiddenProjects(projectIds: string[]) {
  return setAdminHiddenProjectsFn({ data: { projectIds } })
}
/** The site admin's Projects card in their own order. */
export function saveAdminProjectOrder(projectIds: string[]) {
  return setAdminProjectOrderFn({ data: { projectIds } })
}
