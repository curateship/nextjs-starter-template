import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { WORKER_KINDS, type WorkersDashboardData } from "@/lib/workers"

const workerKindSchema = z.enum(WORKER_KINDS)
const enabledSchema = z.object({
  kind: workerKindSchema,
  enabled: z.boolean(),
})
const pausedSchema = z.object({ kind: workerKindSchema, paused: z.boolean() })
const userPausedSchema = z.object({ paused: z.boolean() })

const loadWorkersFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorkersDashboardData> => {
    const user = await requireUser()
    const { getWorkersDashboard } = await import("@/server/workers/status")
    return getWorkersDashboard(user.id, user.role === "admin")
  }
)

const setWorkerEnabledFn = createServerFn({ method: "POST" })
  .inputValidator(enabledSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    await requireAdminUser()
    const { setWorkerEnabled } = await import("@/server/workers/control")
    const control = await setWorkerEnabled(data.kind, data.enabled)
    return { enabled: control.enabled, paused: control.paused }
  })

const setWorkerPausedFn = createServerFn({ method: "POST" })
  .inputValidator(pausedSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    await requireAdminUser()
    const { setWorkerPaused } = await import("@/server/workers/control")
    const control = await setWorkerPaused(data.kind, data.paused)
    return { enabled: control.enabled, paused: control.paused }
  })

const setMarketRulesPausedFn = createServerFn({ method: "POST" })
  .inputValidator(userPausedSchema)
  .handler(async ({ data }) => {
    await requireMutation()
    const user = await requireUser()
    const { setMarketScannerPaused } = await import("@/server/market-scanner")
    return { paused: await setMarketScannerPaused(user.id, data.paused) }
  })

export function loadWorkers() {
  return loadWorkersFn()
}

export function updateWorkerEnabled(
  kind: z.infer<typeof workerKindSchema>,
  enabled: boolean
) {
  return setWorkerEnabledFn({ data: { kind, enabled } })
}

export function updateWorkerPaused(
  kind: z.infer<typeof workerKindSchema>,
  paused: boolean
) {
  return setWorkerPausedFn({ data: { kind, paused } })
}

export function updateMarketRulesPaused(paused: boolean) {
  return setMarketRulesPausedFn({ data: { paused } })
}

async function requireMutation() {
  const { requireAppOrigin } = await import("@/server/origin")
  requireAppOrigin()
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) throw new Error("Missing Custom Shell session")
  return user
}

async function requireAdminUser() {
  const user = await requireUser()
  if (user.role !== "admin") throw new Error("Administrator access required")
  return user
}
