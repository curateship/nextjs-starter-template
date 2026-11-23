import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { guardianHasLimit } from "@/lib/trading/guardian"
import type { GuardianStatus } from "@/server/guardian"

export type { GuardianStatus }

const guardianConfigSchema = z
  .object({
    enabled: z.boolean(),
    dailyLossLimitUsd: z.number().positive().max(1_000_000_000).nullable(),
    dailyLossLimitPct: z.number().positive().max(100).nullable(),
    maxDrawdownPct: z.number().positive().max(100).nullable(),
    action: z.enum(["pause_all", "flatten_all"]),
  })
  .refine((config) => !config.enabled || guardianHasLimit(config), {
    message: "Set at least one limit before turning the guardian on.",
  })

export function getGuardianErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Guardian request failed."
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) throw new Error("Missing Custom Shell session")
  return user
}

const loadGuardianStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<GuardianStatus> => {
    const user = await requireUser()
    const { getGuardianStatus } = await import("@/server/guardian")
    return getGuardianStatus(user.id)
  }
)

const saveGuardianConfigFn = createServerFn({ method: "POST" })
  .inputValidator(guardianConfigSchema)
  .handler(async ({ data }): Promise<GuardianStatus> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { saveGuardianConfig } = await import("@/server/guardian")
    return saveGuardianConfig(user.id, data)
  })

const rearmGuardianFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<GuardianStatus> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { rearmGuardian } = await import("@/server/guardian")
    return rearmGuardian(user.id)
  }
)

export function loadGuardianStatus() {
  return loadGuardianStatusFn()
}

export function saveGuardianConfig(
  config: z.infer<typeof guardianConfigSchema>
) {
  return saveGuardianConfigFn({ data: config })
}

export function rearmGuardian() {
  return rearmGuardianFn()
}
