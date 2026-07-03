import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  API_USAGE_LIMIT_MAX,
  API_USAGE_LIMIT_MIN,
  API_USAGE_LIMIT_RANGE_MESSAGE,
} from "@/lib/api-usage-constants"
import type {
  ApiUsageAdminDashboard,
  ApiUsageEventPage,
  ApiUsageSummary,
} from "@/server/api-usage"

export type {
  ApiUsageAdminDashboard,
  ApiUsageAdminUser,
  ApiUsageDailyPoint,
  ApiUsageEventItem,
  ApiUsageEventPage,
  ApiUsageSummary,
} from "@/server/api-usage"

const MAX_PAGE_SIZE = 100

const listEventsSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  userId: z.string().min(1).max(36).optional(),
})

const userLimitSchema = z.object({
  userId: z.string().min(1).max(36),
  monthlyCredits: z
    .number()
    .int()
    .min(API_USAGE_LIMIT_MIN)
    .max(API_USAGE_LIMIT_MAX)
    .nullable(),
})

const safeErrorMessages = new Set([
  "API usage limit reached. Try again next month.",
  "Invalid API usage cursor",
  "Monthly credits must be a number",
  API_USAGE_LIMIT_RANGE_MESSAGE,
  "Not authorized",
  "User not found",
])

export function getApiUsageErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "API usage request failed."
  if (safeErrorMessages.has(error.message)) return error.message
  return "API usage request failed."
}

const getSummaryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApiUsageSummary> => {
    const { getCurrentUserApiUsageSummary } = await import("@/server/api-usage")
    return getCurrentUserApiUsageSummary()
  }
)

const listCurrentEventsFn = createServerFn({ method: "GET" })
  .inputValidator(listEventsSchema.omit({ userId: true }))
  .handler(async ({ data }): Promise<ApiUsageEventPage> => {
    const { listCurrentUserApiUsageEvents } = await import("@/server/api-usage")
    return listCurrentUserApiUsageEvents(data)
  })

const getAdminDashboardFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApiUsageAdminDashboard> => {
    const { getAdminApiUsageDashboard } = await import("@/server/api-usage")
    return getAdminApiUsageDashboard()
  }
)

const listAdminEventsFn = createServerFn({ method: "GET" })
  .inputValidator(listEventsSchema)
  .handler(async ({ data }): Promise<ApiUsageEventPage> => {
    const { listAdminApiUsageEvents } = await import("@/server/api-usage")
    return listAdminApiUsageEvents(data)
  })

const saveUserLimitFn = createServerFn({ method: "POST" })
  .inputValidator(userLimitSchema)
  .handler(
    async ({
      data,
    }): Promise<{ userId: string; monthlyCredits: number | null }> => {
      const { saveUserApiUsageLimitForCurrentUser } =
        await import("@/server/api-usage")
      return saveUserApiUsageLimitForCurrentUser(
        data.userId,
        data.monthlyCredits
      )
    }
  )

export function getCurrentApiUsageSummary() {
  return getSummaryFn()
}

export function listCurrentApiUsageEvents(
  payload: {
    cursor?: string
    limit?: number
  } = {}
) {
  return listCurrentEventsFn({ data: payload })
}

export function getAdminApiUsageDashboard() {
  return getAdminDashboardFn()
}

export function listAdminApiUsageEvents(
  payload: {
    cursor?: string
    limit?: number
    userId?: string
  } = {}
) {
  return listAdminEventsFn({ data: payload })
}

export function saveUserApiUsageLimit(
  userId: string,
  monthlyCredits: number | null
) {
  return saveUserLimitFn({ data: { userId, monthlyCredits } })
}
