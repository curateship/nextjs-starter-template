import { createServerFn } from "@tanstack/react-start"
import type { z } from "zod"

import { adminTimeZoneSchema, myStatusOrderSchema } from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import { loadAdminDashboard, setAdminStatusOrder, setAdminTimeZone } from "@/server/project/admin-dashboard"

export type {
  AdminDashboard,
  AdminProject,
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
