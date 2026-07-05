import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { UsageLogRow, UsageSummary } from "@/server/api-usage"

export type { UsageLogRow, UsageSummary }

export function getUsageErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Usage request failed."
}

const loadUsageSummaryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ summary: UsageSummary; endpoints: string[] }> => {
    const user = await requireUser()
    const { getUsageSummaryForUser, listUsageEndpointsForUser } = await import(
      "@/server/api-usage"
    )
    const summary = await getUsageSummaryForUser(user.id)
    const endpoints = await listUsageEndpointsForUser(user.id)
    return { summary, endpoints }
  }
)

const listUsageLogsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string().min(1).optional(),
      endpoint: z.string().min(1).optional(),
      success: z.boolean().optional(),
      pagination: z.object({
        page: z.number().int().min(1),
        pageSize: z.number().int().min(1).max(100),
      }),
    })
  )
  .handler(
    async ({ data }): Promise<{ rows: UsageLogRow[]; total: number }> => {
      const user = await requireUser()
      const { listUsageLogsForUser } = await import("@/server/api-usage")
      return listUsageLogsForUser(user.id, data)
    }
  )

export function loadUsageSummary() {
  return loadUsageSummaryFn()
}

export function listUsageLogs(input: {
  projectId?: string
  endpoint?: string
  success?: boolean
  pagination: { page: number; pageSize: number }
}) {
  return listUsageLogsFn({ data: input })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}
