import { z } from "zod"

import type { IndicatorParamField } from "@/lib/indicators/contract"

import { eraseKind, type StrategyKindModule } from "./contract"

/**
 * The DCA ladder's knobs. Unlike signal strategies (indicator + the universal
 * settings block), DCA is position management with no indicator: buy a base
 * order, add a bigger buy at each price step down (safety orders), sell the
 * whole stack at a set profit above the AVERAGE entry, repeat. Long-only, no
 * stop-loss — validated in workspace/docs/dca-strategy-validation.md.
 */
export const dcaParamsSchema = z.object({
  /** Notional of the first buy, USD. Safeties scale off this. */
  baseOrderUsd: z.number().positive().max(1_000_000),
  /** How far below the anchor the first safety rests, percent. */
  priceStepPct: z.number().positive().max(50),
  /** Each next safety's step grows by this factor (1 = evenly spaced). */
  stepMultiplier: z.number().min(0.5).max(5),
  /** Each safety's notional vs the previous rung (base counts as rung 0). */
  sizeMultiplier: z.number().min(1).max(5),
  /** How many safety orders rest below the base order. */
  safetyOrders: z.number().int().min(0).max(15),
  /** Sell the whole stack this percent above the average entry price. */
  takeProfitPct: z.number().positive().max(100),
})

export type DcaParams = z.infer<typeof dcaParamsSchema>

/** The validated vol-basket winner: 0.5% step · ×1.75 · TP 0.5% · 8 safeties.
 * Base $49 makes the full ladder ≈ $10k — a normal 1× bet on $10k equity. */
export const DEFAULT_DCA_PARAMS: DcaParams = {
  baseOrderUsd: 49,
  priceStepPct: 0.5,
  stepMultiplier: 1,
  sizeMultiplier: 1.75,
  safetyOrders: 8,
  takeProfitPct: 0.5,
}

const DCA_PARAM_FIELDS: IndicatorParamField[] = [
  { key: "baseOrderUsd", label: "Base order (USD)", step: 1 },
  { key: "priceStepPct", label: "Price step %", step: 0.1 },
  { key: "stepMultiplier", label: "Step multiplier", step: 0.05 },
  { key: "sizeMultiplier", label: "Size multiplier", step: 0.05 },
  { key: "safetyOrders", label: "Safety orders", step: 1 },
  { key: "takeProfitPct", label: "Take profit %", step: 0.1 },
]

export const dcaStrategyConfigSchema = z.object({
  v: z.literal(2),
  kind: z.literal("dca"),
  interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]),
  dca: dcaParamsSchema,
})

export type DcaStrategyConfig = z.infer<typeof dcaStrategyConfigSchema>

/** USD the ladder holds if every safety fills — the "is this a 1× bet?" number. */
export function maxLadderDeploymentUsd(params: DcaParams): number {
  let total = params.baseOrderUsd
  let rung = params.baseOrderUsd
  for (let i = 1; i <= params.safetyOrders; i += 1) {
    rung *= params.sizeMultiplier
    total += rung
  }
  return total
}

const dcaKindModule: StrategyKindModule<DcaStrategyConfig> = {
  kind: "dca",
  configSchema: dcaStrategyConfigSchema,
  typeIds: () => ["dca"],
  typeOf: () => "dca",
  typeLabel: () => "DCA Ladder",
  typeDescription: () =>
    "Buys a small base order, adds a bigger buy each step the price falls, and sells everything at a set profit above the average entry. Long only, no stop.",
  defaultConfig: (_typeId, interval) => ({
    v: 2,
    kind: "dca",
    interval,
    dca: { ...DEFAULT_DCA_PARAMS },
  }),
  paramFields: DCA_PARAM_FIELDS,
  params: (config) => ({ ...config.dca }),
  setParam: (config, key, value) => ({
    ...config,
    dca: { ...config.dca, [key]: Number(value) },
  }),
  editorNote: (config) =>
    `Full ladder deploys ≈ $${Math.round(
      maxLadderDeploymentUsd(config.dca)
    ).toLocaleString()} if every safety fills — keep this near your starting equity for a normal 1× bet.`,
  summary: (config) => {
    const p = config.dca
    return [
      "long",
      `base $${p.baseOrderUsd}`,
      `${p.safetyOrders} safeties ×${p.sizeMultiplier} every ${p.priceStepPct}%`,
      `TP ${p.takeProfitPct}%`,
    ].join(" · ")
  },
  inputRows: (config) => [
    { label: "Strategy", value: "DCA Ladder" },
    ...DCA_PARAM_FIELDS.map((field) => ({
      label: field.label,
      value: String(config.dca[field.key as keyof DcaParams]),
    })),
  ],
  // DCA reads no indicator — a token runway keeps the fetch cheap.
  warmupBars: () => 5,
  takeProfitPct: (config) => config.dca.takeProfitPct,
}

export const dcaKind = eraseKind(dcaKindModule)
