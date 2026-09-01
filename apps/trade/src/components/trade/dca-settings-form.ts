import { parseOrderNumber } from "@/components/trade/order-window-form"
import {
  BASE_STOP_DAYS_REFUSAL,
  BASE_STOP_UNDER_REFUSAL,
  badBaseReclaimDays,
  badBaseUnderPct,
} from "@/lib/trade/base-stop"
import {
  DEFAULT_BASE_STOP_RECLAIM_DAYS,
  DEFAULT_BASE_STOP_UNDER_PCT,
  DEFAULT_DCA_EXIT_GAP_PCT,
  DEFAULT_DCA_STOP_LOSS_PCT,
  DEFAULT_DCA_TAKE_PROFIT_PCT,
  MAX_DCA_EXIT_GAP_PCT,
  dcaLadderSettingsSchema,
  type DcaAnchor,
  type DcaLadderSettings,
  type DcaTpMode,
} from "@/lib/trade/dca"

export type RungField = { id: string; value: string }

export type DcaSettingsFormState = {
  rungs: RungField[]
  maxPositionPct: string
  sizeMultiplier: string
  leverage: string
  maxOrderVolPct: string
  twoGreen: boolean
  anchor: DcaAnchor
  tpOn: boolean
  tpMode: DcaTpMode
  tpPct: string
  exitGapPct: string
  slOn: boolean
  slPct: string
  baseOn: boolean
  baseUnderPct: string
  baseReclaimDays: string
}

let nextRungId = 0

export function rungFields(deviations: readonly number[]): RungField[] {
  return deviations.map((deviation) => ({
    id: `dca-field-rung-${(nextRungId += 1)}`,
    value: String(deviation),
  }))
}

export function dcaSettingsFormState(
  settings: DcaLadderSettings
): DcaSettingsFormState {
  return {
    rungs: rungFields(settings.rungs.map((rung) => rung.deviation)),
    maxPositionPct: String(settings.maxPositionPct),
    sizeMultiplier: String(settings.sizeMultiplier),
    leverage: String(settings.leverage),
    maxOrderVolPct: String(settings.maxOrderVolPct),
    twoGreen: settings.twoGreen,
    anchor: settings.anchor,
    tpOn: settings.takeProfit !== null,
    tpMode: settings.takeProfit?.mode ?? "average",
    tpPct: String(settings.takeProfit?.pct ?? DEFAULT_DCA_TAKE_PROFIT_PCT),
    exitGapPct: String(
      settings.takeProfit?.exitGapPct ?? DEFAULT_DCA_EXIT_GAP_PCT
    ),
    slOn: settings.stopLoss !== null,
    slPct: String(settings.stopLoss?.pct ?? DEFAULT_DCA_STOP_LOSS_PCT),
    baseOn: settings.stopLoss?.base != null,
    baseUnderPct: String(
      settings.stopLoss?.base?.underPct ?? DEFAULT_BASE_STOP_UNDER_PCT
    ),
    baseReclaimDays: String(
      settings.stopLoss?.base?.reclaimDays ?? DEFAULT_BASE_STOP_RECLAIM_DAYS
    ),
  }
}

type InvalidFields = {
  rungs: boolean[]
  rungCount: boolean
  maxPositionPct: boolean
  sizeMultiplier: boolean
  leverage: boolean
  maxOrderVolPct: boolean
  takeProfit: boolean
  exitGap: boolean
  stopLoss: boolean
  baseUnder: boolean
  baseDays: boolean
}

export type DcaSettingsInspection = {
  settings: DcaLadderSettings | null
  exits: Pick<DcaLadderSettings, "takeProfit" | "stopLoss"> | null
  refusal: string | null
  invalid: InvalidFields
}

export function inspectDcaSettingsForm(
  form: DcaSettingsFormState,
  maxBorrowing: number,
  full: boolean
): DcaSettingsInspection {
  const rungValues = form.rungs.map((rung) => parseOrderNumber(rung.value))
  const invalidRungs = rungValues.map(
    (value) => value === null || value <= 0 || value > 99
  )
  const rungCount = form.rungs.length < 1 || form.rungs.length > 20
  const maxPositionPct = parseOrderNumber(form.maxPositionPct)
  const badPosition =
    full &&
    (maxPositionPct === null || maxPositionPct <= 0 || maxPositionPct > 100)
  const sizeMultiplier = parseOrderNumber(form.sizeMultiplier)
  const badMultiplier =
    full &&
    (sizeMultiplier === null || sizeMultiplier < 1 || sizeMultiplier > 10)
  const leverage = parseOrderNumber(form.leverage)
  const badLeverage =
    full &&
    (leverage === null ||
      !Number.isInteger(leverage) ||
      leverage < 1 ||
      leverage > maxBorrowing)
  const maxOrderVolPct = parseOrderNumber(form.maxOrderVolPct)
  const badVolume =
    full &&
    (maxOrderVolPct === null || maxOrderVolPct < 0 || maxOrderVolPct > 5)
  const tpPct = parseOrderNumber(form.tpPct)
  const badTakeProfit =
    form.tpOn &&
    form.tpMode === "average" &&
    (tpPct === null || tpPct <= 0 || tpPct > 999)
  const exitGapPct = parseOrderNumber(form.exitGapPct)
  const badExitGap =
    form.tpOn &&
    form.tpMode === "exitLadder" &&
    (exitGapPct === null || exitGapPct < 0 || exitGapPct > MAX_DCA_EXIT_GAP_PCT)
  const slPct = parseOrderNumber(form.slPct)
  const badStopLoss = form.slOn && (slPct === null || slPct <= 0 || slPct > 100)
  const badBaseUnder =
    form.slOn && form.baseOn && badBaseUnderPct(form.baseUnderPct)
  const badBaseDays =
    form.slOn && form.baseOn && badBaseReclaimDays(form.baseReclaimDays)
  const baseUnderPct = parseOrderNumber(form.baseUnderPct)
  const baseReclaimDays = parseOrderNumber(form.baseReclaimDays)

  const invalid: InvalidFields = {
    rungs: invalidRungs,
    rungCount,
    maxPositionPct: badPosition,
    sizeMultiplier: badMultiplier,
    leverage: badLeverage,
    maxOrderVolPct: badVolume,
    takeProfit: badTakeProfit,
    exitGap: badExitGap,
    stopLoss: badStopLoss,
    baseUnder: badBaseUnder,
    baseDays: badBaseDays,
  }
  const exits =
    badTakeProfit || badExitGap || badStopLoss || badBaseUnder || badBaseDays
      ? null
      : {
          takeProfit: form.tpOn
            ? {
                mode: form.tpMode,
                pct:
                  form.tpMode === "average"
                    ? (tpPct as number)
                    : DEFAULT_DCA_TAKE_PROFIT_PCT,
                exitGapPct:
                  form.tpMode === "exitLadder"
                    ? (exitGapPct as number)
                    : DEFAULT_DCA_EXIT_GAP_PCT,
              }
            : null,
          stopLoss: form.slOn
            ? {
                pct: slPct as number,
                base: form.baseOn
                  ? {
                      underPct: baseUnderPct as number,
                      reclaimDays: baseReclaimDays as number,
                    }
                  : null,
              }
            : null,
        }
  const candidate =
    full &&
    exits &&
    !rungCount &&
    !invalidRungs.some(Boolean) &&
    !badPosition &&
    !badMultiplier &&
    !badLeverage &&
    !badVolume
      ? dcaLadderSettingsSchema.safeParse({
          rungs: rungValues.map((deviation) => ({
            deviation: deviation as number,
          })),
          maxPositionPct,
          sizeMultiplier,
          leverage,
          maxOrderVolPct,
          twoGreen: form.twoGreen,
          anchor: form.anchor,
          ...exits,
        })
      : null
  const settings = candidate?.success ? candidate.data : null
  const refusal =
    full && (rungCount || invalidRungs.some(Boolean))
      ? "Every rung step has to be a number above zero and below 100."
      : badPosition
        ? "Max position has to be a number above zero and no more than 100%."
        : badMultiplier
          ? "Size ramp has to be from 1× to 10×."
          : badLeverage
            ? `Borrowing has to be a whole number from 1× to ${maxBorrowing}× on this market.`
            : badTakeProfit
              ? "Target % has to be a number above zero and no more than 999%."
              : badExitGap
                ? `Extra exit gap has to be from 0 to ${MAX_DCA_EXIT_GAP_PCT}%.`
                : badStopLoss
                  ? "Stop loss has to be a number above zero and no more than 100%."
                  : badBaseUnder
                    ? BASE_STOP_UNDER_REFUSAL
                    : badBaseDays
                      ? BASE_STOP_DAYS_REFUSAL
                      : badVolume
                        ? "The liquidity limit has to be from 0 to 5% of the market's daily volume."
                        : null

  return { settings, exits, refusal, invalid }
}
