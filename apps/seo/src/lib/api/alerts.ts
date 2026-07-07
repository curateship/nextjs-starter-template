import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { RankingAlertRow } from "@/server/ranking-alerts"

export type { RankingAlertRow }
export type RankingAlert = RankingAlertRow

export function getAlertErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Alert request failed."
}

const projectIdSchema = z.object({ projectId: z.string().min(1) })

const listAlertsFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      unreadOnly: z.boolean().optional(),
      pagination: z.object({
        page: z.number().int().min(1),
        pageSize: z.number().int().min(1).max(100),
      }),
    })
  )
  .handler(
    async ({ data }): Promise<{ rows: RankingAlertRow[]; total: number }> => {
      const user = await requireUser()
      const { listAlertsForProject } = await import("@/server/ranking-alerts")
      return listAlertsForProject(user.id, data)
    }
  )

const countUnreadFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<{ unread: number }> => {
    const user = await requireUser()
    const { countUnreadAlerts } = await import("@/server/ranking-alerts")
    return { unread: await countUnreadAlerts(user.id, data.projectId) }
  })

const markReadFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema.extend({ alertId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { markAlertRead } = await import("@/server/ranking-alerts")
    return markAlertRead(user.id, data.projectId, data.alertId)
  })

const markAllReadFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<{ updated: number }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { markAllAlertsRead } = await import("@/server/ranking-alerts")
    return markAllAlertsRead(user.id, data.projectId)
  })

export function listAlerts(input: {
  projectId: string
  unreadOnly?: boolean
  pagination: { page: number; pageSize: number }
}) {
  return listAlertsFn({ data: input })
}

export function countUnreadAlerts(projectId: string) {
  return countUnreadFn({ data: { projectId } })
}

export function markAlertRead(projectId: string, alertId: string) {
  return markReadFn({ data: { projectId, alertId } })
}

export function markAllAlertsRead(projectId: string) {
  return markAllReadFn({ data: { projectId } })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}
