import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  normalizeStrategyConfig,
  strategyConfigSchema,
  type StrategyConfig,
} from "@/lib/strategies/strategy-config"

export type StrategyListItem = {
  id: string
  name: string
  config: StrategyConfig
  created_at: string
  updated_at: string
}

export type SavedStrategyConfig = Exclude<
  StrategyConfig,
  { kind: "automation" }
>

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

function serialize(row: {
  id: string
  name: string
  config: unknown
  createdAt: Date
  updatedAt: Date
}): StrategyListItem {
  return {
    id: row.id,
    name: row.name,
    // Normalized so `config.kind` is always set (pre-kind rows lack it).
    config:
      normalizeStrategyConfig(row.config) ?? (row.config as StrategyConfig),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

const upsertSchema = z.object({
  strategyId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  config: strategyConfigSchema.refine(
    (config) => config.kind !== "automation",
    "Automations must be saved from the Automations canvas."
  ),
})

const idSchema = z.object({ strategyId: z.string().uuid() })

const listStrategiesFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ strategies: StrategyListItem[] }> => {
    const user = await requireUser()
    const { listUserStrategies } = await import("@/server/strategies")
    const rows = await listUserStrategies(user.id)
    return { strategies: rows.map(serialize) }
  }
)

const saveStrategyFn = createServerFn({ method: "POST" })
  .inputValidator(upsertSchema)
  .handler(async ({ data }): Promise<{ strategy: StrategyListItem }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { createUserStrategy, updateUserStrategy } = await import(
      "@/server/strategies"
    )
    if (data.strategyId) {
      const row = await updateUserStrategy(user.id, data.strategyId, data)
      if (!row) throw new Error("Strategy not found")
      return { strategy: serialize(row) }
    }
    const row = await createUserStrategy(user.id, data)
    return { strategy: serialize(row) }
  })

const deleteStrategyFn = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { deleteUserStrategy } = await import("@/server/strategies")
    return { ok: await deleteUserStrategy(user.id, data.strategyId) }
  })

export function loadStrategies() {
  return listStrategiesFn()
}

export function saveStrategy(input: z.infer<typeof upsertSchema>) {
  return saveStrategyFn({ data: input })
}

export function deleteStrategy(strategyId: string) {
  return deleteStrategyFn({ data: { strategyId } })
}
