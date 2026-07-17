import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export type OverviewTotals = { pageViews: number; visitors: number }
export type OverviewPoint = { day: string; pageViews: number; visitors: number }
export type OverviewBreakdownItem = { key: string; count: number }

export type SiteOverview = {
  from: string
  to: string
  totals: OverviewTotals
  previous: OverviewTotals
  series: OverviewPoint[]
  topPages: OverviewBreakdownItem[]
  topReferrers: OverviewBreakdownItem[]
}

export type OverviewRange = "today" | "7d" | "30d" | "custom"

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")

const overviewInputSchema = z.object({
  siteId: z.string().min(1),
  range: z.enum(["today", "7d", "30d", "custom"]),
  from: dayString.optional(),
  to: dayString.optional(),
})

export type OverviewInput = z.infer<typeof overviewInputSchema>

export function getOverviewErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Overview request failed."
}

const loadOverviewFn = createServerFn({ method: "GET" })
  .inputValidator(overviewInputSchema)
  .handler(async ({ data }): Promise<SiteOverview> => {
    const { findCurrentUser } = await import("@/server/security")
    const { getSiteOverview, resolveRange, utcToday } = await import(
      "@/server/overview"
    )

    const user = await findCurrentUser()
    if (!user) throw new Error("Missing Custom Shell session")

    const { from, to } = resolveRange(data.range, utcToday(), {
      from: data.from,
      to: data.to,
    })
    return getSiteOverview(user.id, data.siteId, from, to)
  })

export function loadOverview(input: OverviewInput) {
  return loadOverviewFn({ data: input })
}
