import { PlusIcon, Trash2Icon } from "lucide-react"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { TradeNumberField } from "@/components/automations/nodes/trade-number-field"
import { BaseStopFields } from "@/components/trade/base-stop-fields"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import {
  tradeDcaNode,
  tradeDcaSettingsSchema,
  type TradeDcaSettings,
} from "@/lib/automations/nodes/trade-dca"
import { CANDLE_INTERVALS } from "@/lib/protocols/contracts"
import {
  DCA_TP_MODE_HINTS,
  DCA_TP_MODE_LABELS,
  DCA_TP_MODES,
  DEFAULT_BASE_STOP_RECLAIM_DAYS,
  DEFAULT_BASE_STOP_UNDER_PCT,
  DEFAULT_DCA_STOP_LOSS_PCT,
  DEFAULT_DCA_TAKE_PROFIT_PCT,
  MAX_DCA_RUNGS,
  nextDcaRung,
  type DcaTpMode,
} from "@/lib/trade/dca"

/**
 * The ladder to test — the same settings as the right-click window on the
 * chart, arranged for a panel rather than a dialog, plus the candle size.
 *
 * Deliberately the *same* settings and not a copy of them: both read
 * `dcaParamsSchema`, so a rule the chart refuses is refused here too, in the
 * same words. Two lists of ladder settings would drift within a month and the
 * whole promise of this build — that the tested ladder and the real one are one
 * ladder — would quietly stop being true.
 */
export default function TradeDcaFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const parsed = tradeDcaSettingsSchema.safeParse(node.settings)
  const settings = parsed.success
    ? parsed.data
    : tradeDcaSettingsSchema.parse(tradeDcaNode.createSettings())
  const { params } = settings

  const write = (next: TradeDcaSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...next } })
  const setParams = (patch: Partial<TradeDcaSettings["params"]>) =>
    write({ ...settings, params: { ...params, ...patch } })

  const stop = params.stopLoss
  const baseStop = stop?.base ?? null

  return (
    <>
      <InspectorCard title="Ladder">
        {params.rungs.map((rung, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-4 text-right text-xs text-muted-foreground">
              {index + 1}
            </span>
            <Input
              inputMode="decimal"
              className="w-20"
              value={String(rung.deviation)}
              aria-label={`Rung ${index + 1}, percent below the buy above`}
              onChange={(event) => {
                const next = Number(event.target.value.trim())
                if (!Number.isFinite(next) || next <= 0 || next > 99) return
                setParams({
                  rungs: params.rungs.map((one, at) =>
                    at === index ? { deviation: next } : one
                  ),
                })
              }}
            />
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
              % below the buy above
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={params.rungs.length <= 1}
              aria-label={`Remove rung ${index + 1}`}
              onClick={() =>
                setParams({
                  rungs: params.rungs.filter((_, at) => at !== index),
                })
              }
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={params.rungs.length >= MAX_DCA_RUNGS}
          onClick={() =>
            setParams({
              rungs: [...params.rungs, nextDcaRung(params.rungs)],
            })
          }
        >
          <PlusIcon className="size-3.5" />
          Add rung
        </Button>
      </InspectorCard>

      <InspectorCard title="Position">
        <TradeNumberField
          id={`dca-${node.id}-pot`}
          label="Most of the pot, per coin"
          hint="The most of the shared pot one coin's ladder may ever spend, split across its buys by the size ramp. Twenty coins at 25% each cannot all be full at once — first come, first served, and that is what running this for real would be like."
          value={params.maxPositionPct}
          min={0.01}
          max={100}
          suffix="%"
          onChange={(maxPositionPct) => setParams({ maxPositionPct })}
        />
        <TradeNumberField
          id={`dca-${node.id}-ramp`}
          label="Size ramp"
          hint="How much bigger each buy is than the one above it. 1 = every buy equal; 2 = each buy doubles the last, so far more is bought the deeper price falls."
          value={params.sizeMultiplier}
          min={1}
          max={10}
          suffix="×"
          onChange={(sizeMultiplier) => setParams({ sizeMultiplier })}
        />
      </InspectorCard>

      <InspectorCard title="Candles">
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`dca-${node.id}-interval`}
            className="text-xs"
            hint="The bar size the run walks. Smaller bars mean a finer replay and far less history — the exchange keeps roughly 5,000 bars of each size, so a 1h test tops out near 200 days."
          >
            Candle size
          </FieldLabel>
          <Select
            value={settings.interval}
            onValueChange={(interval) =>
              write({
                ...settings,
                interval: interval as TradeDcaSettings["interval"],
              })
            }
          >
            <SelectTrigger
              id={`dca-${node.id}-interval`}
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANDLE_INTERVALS.map((interval) => (
                <SelectItem key={interval} value={interval}>
                  {interval}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </InspectorCard>

      <InspectorCard title="Take profit">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`dca-${node.id}-tp-on`}
            checked={params.takeProfit !== null}
            onCheckedChange={(next) =>
              setParams({
                takeProfit:
                  next === true
                    ? { mode: "average", pct: DEFAULT_DCA_TAKE_PROFIT_PCT }
                    : null,
              })
            }
          />
          <FieldLabel
            htmlFor={`dca-${node.id}-tp-on`}
            className="text-xs"
            hint="Off means the ladder only ever leaves through its stop."
          >
            Take profit
          </FieldLabel>
        </div>

        {params.takeProfit ? (
          <>
            <div className="grid gap-1.5">
              <FieldLabel
                htmlFor={`dca-${node.id}-tp-mode`}
                className="text-xs"
                hint={DCA_TP_MODE_HINTS[params.takeProfit.mode]}
              >
                Exit
              </FieldLabel>
              <Select
                value={params.takeProfit.mode}
                onValueChange={(mode) =>
                  setParams({
                    takeProfit: {
                      ...params.takeProfit!,
                      mode: mode as DcaTpMode,
                    },
                  })
                }
              >
                <SelectTrigger
                  id={`dca-${node.id}-tp-mode`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DCA_TP_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {DCA_TP_MODE_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {params.takeProfit.mode === "average" ? (
              <TradeNumberField
                id={`dca-${node.id}-tp-pct`}
                label="Target"
                hint="How far above the average buy price the sell sits. It is re-aimed after every fill, so a deeper rung pulls the target down with it."
                value={params.takeProfit.pct}
                min={0.01}
                max={999}
                suffix="%"
                onChange={(pct) =>
                  setParams({ takeProfit: { ...params.takeProfit!, pct } })
                }
              />
            ) : null}
          </>
        ) : null}
      </InspectorCard>

      <InspectorCard title="Stop loss">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`dca-${node.id}-sl-on`}
            checked={stop !== null}
            onCheckedChange={(next) =>
              setParams({
                stopLoss:
                  next === true
                    ? { pct: DEFAULT_DCA_STOP_LOSS_PCT, base: null }
                    : null,
              })
            }
          />
          <FieldLabel
            htmlFor={`dca-${node.id}-sl-on`}
            className="text-xs"
            hint="Off means nothing ever cuts a losing ladder — every rung rides to the end of the test."
          >
            Stop loss
          </FieldLabel>
        </div>

        {stop ? (
          <>
            <TradeNumberField
              id={`dca-${node.id}-sl-pct`}
              label="Stop"
              hint="How far below the average buy price the stop rests, following it as it moves. 100 means price would have to reach zero, which is how you say no stop until a base arrives."
              value={stop.pct}
              min={0.01}
              max={100}
              suffix="%"
              onChange={(pct) => setParams({ stopLoss: { ...stop, pct } })}
            />
            <BaseStopFields
              on={baseStop !== null}
              underPct={String(baseStop?.underPct ?? DEFAULT_BASE_STOP_UNDER_PCT)}
              reclaimDays={String(
                baseStop?.reclaimDays ?? DEFAULT_BASE_STOP_RECLAIM_DAYS
              )}
              disabled={false}
              onOn={(on) =>
                setParams({
                  stopLoss: {
                    ...stop,
                    base: on
                      ? {
                          underPct: DEFAULT_BASE_STOP_UNDER_PCT,
                          reclaimDays: DEFAULT_BASE_STOP_RECLAIM_DAYS,
                        }
                      : null,
                  },
                })
              }
              onUnderPct={(text) => {
                const next = Number(text.trim())
                if (!baseStop || !Number.isFinite(next) || next < 0 || next > 50)
                  return
                setParams({
                  stopLoss: { ...stop, base: { ...baseStop, underPct: next } },
                })
              }}
              onReclaimDays={(text) => {
                const next = Number(text.trim())
                if (!baseStop || !Number.isFinite(next) || next < 0 || next > 90)
                  return
                setParams({
                  stopLoss: {
                    ...stop,
                    base: { ...baseStop, reclaimDays: next },
                  },
                })
              }}
            />
          </>
        ) : null}
      </InspectorCard>

      <InspectorCard title="Advanced settings">
        {/* No "rungs measured from" choice here on purpose.
        
            The app this is a port of has no such setting: its first rung is
            always measured from the base, full stop. The other answer — "the
            price you clicked" — belongs to right-clicking a live chart, and in
            a flow there is nothing to click. It quietly meant "start the
            ladder wherever price happens to be", which put buys halfway up a
            rally with no floor under them and made every result meaningless.
            The step is always measured from the base now. */}

        <TradeNumberField
          id={`dca-${node.id}-vol-guard`}
          label="Max order, share of the day's volume"
          hint="Liquidity guard: no single buy bigger than this share of the coin's last-24-hours trading volume, so thin coins get small orders. 0 turns it off."
          value={params.maxOrderVolPct}
          min={0}
          max={5}
          suffix="%"
          onChange={(maxOrderVolPct) => setParams({ maxOrderVolPct })}
        />

        <div className="flex items-center gap-2">
          <Checkbox
            id={`dca-${node.id}-two-green`}
            checked={params.twoGreen}
            onCheckedChange={(next) => setParams({ twoGreen: next === true })}
          />
          <FieldLabel
            htmlFor={`dca-${node.id}-two-green`}
            className="text-xs"
            hint={`Nothing rests waiting: the ladder watches the ${settings.interval} candles and buys at market once two rising closes confirm the turn — so fills sit a little off the lines.`}
          >
            Only buy after 2 rising candles
          </FieldLabel>
        </div>
      </InspectorCard>

      <InspectorNote>
        Pressing Run above the canvas starts the test. Nothing follows this
        step — it is the end of the flow, and where it got to shows in the
        Backtests tab below.
      </InspectorNote>
    </>
  )
}
