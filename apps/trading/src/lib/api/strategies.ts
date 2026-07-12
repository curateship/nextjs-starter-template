import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { priceActionParamsFromChart } from "@/lib/indicators/defs/price-action"
import {
  INDICATORS,
  INDICATOR_IDS,
  indicatorIdSchema,
  type IndicatorId,
} from "@/lib/indicators/registry"
import {
  defaultStrategyConfig,
  normalizeStrategyConfig,
  signalStrategyConfigSchema,
  type SignalStrategyConfig,
} from "@/lib/strategies/strategy-config"

export type StrategyTemplateListItem = {
  id: string
  name: string
  config: SignalStrategyConfig
  created_at: string
  updated_at: string
}

export type FixedStrategyItem = {
  type: IndicatorId
  label: string
  description: string
  config: SignalStrategyConfig
  pinned: boolean
  templates: StrategyTemplateListItem[]
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

function serializeTemplate(row: {
  id: string
  name: string
  config: unknown
  createdAt: Date
  updatedAt: Date
}): StrategyTemplateListItem | null {
  const config = normalizeStrategyConfig(row.config)
  if (!config || config.kind !== "signal") return null
  return {
    id: row.id,
    name: row.name,
    config,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

const upsertTemplateSchema = z.object({
  strategyId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  config: signalStrategyConfigSchema,
})

const saveSettingsSchema = z
  .object({
    strategyType: indicatorIdSchema,
    config: signalStrategyConfigSchema,
    pinned: z.boolean(),
  })
  .refine((value) => value.config.indicator.type === value.strategyType, {
    message: "Strategy settings must match the selected strategy.",
    path: ["config", "indicator", "type"],
  })

const idSchema = z.object({ strategyId: z.string().uuid() })

const loadStrategyLibraryFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ strategies: FixedStrategyItem[] }> => {
    const user = await requireUser()
    const { listUserStrategies, listUserStrategySettings } = await import(
      "@/server/strategies"
    )
    const { listUserIndicators } = await import("@/server/indicators")
    const [templateRows, settingRows, chartIndicators] = await Promise.all([
      listUserStrategies(user.id),
      listUserStrategySettings(user.id),
      listUserIndicators(user.id),
    ])
    const templates = templateRows.flatMap((row) => {
      const template = serializeTemplate(row)
      return template ? [template] : []
    })
    const settings = new Map(
      settingRows.flatMap((row) => {
        const config = normalizeStrategyConfig(row.config)
        return config?.kind === "signal" &&
          config.indicator.type === row.strategyType
          ? [[row.strategyType as IndicatorId, { config, pinned: row.pinned }] as const]
          : []
      })
    )
    // A fresh Price Action strategy starts as an exact copy of the chart's
    // Price Action settings; only its own save diverges from the chart later.
    const chartPriceAction = chartIndicators.find(
      (indicator) => indicator.type === "priceAction"
    )
    const seededDefault = (type: IndicatorId): SignalStrategyConfig => {
      const config = defaultStrategyConfig(type, "15m") as SignalStrategyConfig
      if (type === "price_action" && chartPriceAction) {
        config.indicator.params = priceActionParamsFromChart(
          chartPriceAction.params
        )
      }
      return config
    }
    return {
      strategies: INDICATOR_IDS.map((type) => ({
        type,
        label: INDICATORS[type].label,
        description: INDICATORS[type].description,
        config: settings.get(type)?.config ?? seededDefault(type),
        pinned: settings.get(type)?.pinned ?? false,
        templates: templates.filter(
          (template) => template.config.indicator.type === type
        ),
      })),
    }
  }
)

const saveStrategySettingsFn = createServerFn({ method: "POST" })
  .inputValidator(saveSettingsSchema)
  .handler(async ({ data }): Promise<{ config: SignalStrategyConfig }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { saveUserStrategySettings } = await import("@/server/strategies")
    const row = await saveUserStrategySettings(
      user.id,
      data.strategyType,
      data.config,
      data.pinned
    )
    const config = normalizeStrategyConfig(row.config)
    if (!config || config.kind !== "signal") {
      throw new Error("Saved strategy settings are invalid")
    }
    return { config }
  })

const saveStrategyTemplateFn = createServerFn({ method: "POST" })
  .inputValidator(upsertTemplateSchema)
  .handler(async ({ data }): Promise<{ template: StrategyTemplateListItem }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { createUserStrategy, updateUserStrategy } = await import(
      "@/server/strategies"
    )
    if (data.strategyId) {
      const row = await updateUserStrategy(user.id, data.strategyId, data)
      if (!row) throw new Error("Strategy not found")
      const template = serializeTemplate(row)
      if (!template) throw new Error("Saved template is invalid")
      return { template }
    }
    const row = await createUserStrategy(user.id, data)
    const template = serializeTemplate(row)
    if (!template) throw new Error("Saved template is invalid")
    return { template }
  })

const deleteStrategyTemplateFn = createServerFn({ method: "POST" })
  .inputValidator(idSchema)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { deleteUserStrategy } = await import("@/server/strategies")
    return { ok: await deleteUserStrategy(user.id, data.strategyId) }
  })

export function loadStrategyLibrary() {
  return loadStrategyLibraryFn()
}

export function saveStrategySettings(input: z.infer<typeof saveSettingsSchema>) {
  return saveStrategySettingsFn({ data: input })
}

export function saveStrategyTemplate(
  input: z.infer<typeof upsertTemplateSchema>
) {
  return saveStrategyTemplateFn({ data: input })
}

export function deleteStrategyTemplate(strategyId: string) {
  return deleteStrategyTemplateFn({ data: { strategyId } })
}
