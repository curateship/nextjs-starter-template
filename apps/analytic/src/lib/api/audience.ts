import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { OverviewBreakdownItem, OverviewRange } from "@/lib/api/overview"

export type SiteAudience = {
  from: string
  to: string
  devices: OverviewBreakdownItem[]
  browsers: OverviewBreakdownItem[]
  countries: OverviewBreakdownItem[]
}

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")

const audienceInputSchema = z.object({
  siteId: z.string().min(1),
  range: z.enum(["today", "7d", "30d", "custom"]),
  from: dayString.optional(),
  to: dayString.optional(),
})

export type AudienceInput = z.infer<typeof audienceInputSchema>

export function getAudienceErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Audience request failed."
}

const loadAudienceFn = createServerFn({ method: "GET" })
  .inputValidator(audienceInputSchema)
  .handler(async ({ data }): Promise<SiteAudience> => {
    const { findCurrentUser } = await import("@/server/security")
    const { getSiteAudience } = await import("@/server/audience")
    const { resolveRange, utcToday } = await import("@/server/overview")

    const user = await findCurrentUser()
    if (!user) throw new Error("Missing Custom Shell session")

    const { from, to } = resolveRange(data.range, utcToday(), {
      from: data.from,
      to: data.to,
    })
    return getSiteAudience(user.id, data.siteId, from, to)
  })

export function loadAudience(input: {
  siteId: string
  range: OverviewRange
  from?: string
  to?: string
}) {
  return loadAudienceFn({ data: input })
}
