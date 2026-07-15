import { createServerFn } from "@tanstack/react-start"

import { applyPomoderAdminAction, loadPomoderAdminData } from "@/server/admin"
import {
  adminActionSchema,
  adminLoadSchema,
  type PomoderAdminAction,
  type PomoderAdminLoad,
} from "@/server/admin-contract"
import { requireAppOrigin } from "@/server/origin"
import { requireUser } from "@/server/security"

const loadFn = createServerFn({ method: "GET" })
  .inputValidator(adminLoadSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    if (user.role !== "admin") throw new Error("ADMIN_REQUIRED")
    return loadPomoderAdminData(data)
  })

const actionFn = createServerFn({ method: "POST" })
  .inputValidator(adminActionSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireUser()
    if (user.role !== "admin") throw new Error("ADMIN_REQUIRED")
    return applyPomoderAdminAction(user.id, data)
  })

export type AdminAction = PomoderAdminAction
export const loadAdminData = (query: PomoderAdminLoad) =>
  loadFn({ data: query })
export const runAdminAction = (action: AdminAction) =>
  actionFn({ data: action })
export type AdminData = Awaited<ReturnType<typeof loadAdminData>>
