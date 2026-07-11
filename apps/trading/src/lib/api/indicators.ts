import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { IndicatorConfig } from "@/lib/trading/indicators-config"

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

// The indicator's type is derived server-side from its id, so it isn't sent.
const saveSchema = z.object({
  id: z.string().min(1).max(40),
  enabled: z.boolean(),
  pinned: z.boolean(),
  params: z.record(z.string(), z.number().finite().nonnegative()),
  name: z.string().trim().max(80).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be #rrggbb")
    .optional(),
  session: z
    .enum(["nyse", "tokyo", "london", "utcAsia", "utcLondon", "utcNewYork"])
    .optional(),
})

const listIndicatorsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ indicators: IndicatorConfig[] }> => {
    const user = await requireUser()
    const { listUserIndicators } = await import("@/server/indicators")
    return { indicators: await listUserIndicators(user.id) }
  }
)

const saveIndicatorFn = createServerFn({ method: "POST" })
  .inputValidator(saveSchema)
  .handler(async ({ data }): Promise<{ indicator: IndicatorConfig }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { upsertUserIndicator } = await import("@/server/indicators")
    return { indicator: await upsertUserIndicator(user.id, data) }
  })

export async function loadIndicators(): Promise<IndicatorConfig[]> {
  const { indicators } = await listIndicatorsFn()
  return indicators
}

/** Persists one indicator's settings (modal saves and checkbox toggles alike). */
export async function saveIndicator(
  config: IndicatorConfig
): Promise<IndicatorConfig> {
  const { indicator } = await saveIndicatorFn({
    data: {
      id: config.id,
      enabled: config.enabled,
      pinned: config.pinned ?? false,
      params: config.params,
      name: config.name?.trim() || undefined,
      color: config.color,
      session: config.session,
    },
  })
  return indicator
}
