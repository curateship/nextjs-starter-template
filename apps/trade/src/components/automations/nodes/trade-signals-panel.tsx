import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { TradeNumberField } from "@/components/automations/nodes/trade-number-field"
import { IndicatorRow } from "@/components/trade/indicator-fields"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import {
  MAX_SIGNAL_CHASE_PCT,
  tradeSignalsNode,
  tradeSignalsSettingsSchema,
  type TradeSignalsSettings,
} from "@/lib/automations/nodes/trade-signals"
import {
  DEFAULT_BACKTEST_START_USD,
  chosenWallet,
  tradeWalletNode,
} from "@/lib/automations/nodes/trade-wallet"
import { CANDLE_INTERVALS } from "@/lib/protocols/contracts"
import { DEFAULT_TRADING_ZONE } from "@/lib/trade/chart-timezone"
import { formatUsdRounded } from "@/lib/trade/format"
import {
  SIGNAL_INDICATORS,
  defaultParamsOf,
  signalIndicatorsOn,
  type IndicatorSettings,
} from "@/lib/trade/indicators/registry"

/**
 * The Signals step's settings.
 *
 * The indicator form is the chart's own, from `indicator-fields.tsx`, so a
 * setting means the same thing in both places and gains a field in both at
 * once. Only the indicators that can actually call a trade are listed: one that
 * merely draws would be a switch here that quietly does nothing.
 */

export default function TradeSignalsFields({
  node,
  graph,
  onChange,
}: AutomationNodeFieldsProps) {
  const parsed = tradeSignalsSettingsSchema.safeParse(node.settings)
  const settings = parsed.success
    ? parsed.data
    : tradeSignalsSettingsSchema.parse(tradeSignalsNode.createSettings())

  const write = (next: TradeSignalsSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...next } })

  const setIndicator = (kind: string, patch: Partial<IndicatorSettings[string]>) =>
    write({
      ...settings,
      indicators: {
        ...settings.indicators,
        [kind]: { ...settings.indicators[kind], ...patch },
      },
    })

  // The pot these sums are a share of, read the same way the ladder step reads
  // it — straight off the wallet step rather than through a parse of the whole
  // thing, because a whole-step parse fails on any one bad field and every
  // figure below would then quietly fall back to a default.
  const walletNode = graph?.nodes.find((one) => one.kind === tradeWalletNode.kind)
  const named = walletNode ? chosenWallet(walletNode.settings) : null
  const saved = walletNode?.settings as { startingUsd?: unknown } | undefined
  const pretendUsd =
    typeof saved?.startingUsd === "number" && saved.startingUsd > 0
      ? saved.startingUsd
      : DEFAULT_BACKTEST_START_USD
  // A named wallet's pot is its spend cap, never the pretend figure.
  const potUsd = named ? (named.capUsd ?? 0) : pretendUsd
  const perCoinUsd = (potUsd * settings.stakePct) / 100

  const on = signalIndicatorsOn(settings.indicators)

  return (
    <>
      <InspectorCard title="What it trades on">
        {SIGNAL_INDICATORS.map((module) => (
          <IndicatorRow
            key={module.kind}
            module={module}
            state={settings.indicators[module.kind]}
            // A flow runs on the server, where there is no chart and so no
            // clock somebody picked. UTC is the honest answer, and no indicator
            // offered on this step reads it: the opening range draws but does
            // not trade, so it is not in this list.
            context={{
              zone: DEFAULT_TRADING_ZONE,
              interval: settings.interval,
            }}
            tone="panel"
            idPrefix={`signals-${node.id}`}
            // The library describes what an indicator DRAWS, which is the right
            // sentence on a chart and the wrong one here. What matters on this
            // step is which way each arrow reads as an instruction.
            description="A confirmed floor is a buy. A confirmed ceiling sells the whole position."
            onOpenChange={(open) => setIndicator(module.kind, { open })}
            onCardOpenChange={(title, open) =>
              setIndicator(module.kind, {
                shutCards: open
                  ? settings.indicators[module.kind].shutCards.filter(
                      (one) => one !== title
                    )
                  : [...settings.indicators[module.kind].shutCards, title],
              })
            }
            onToggle={(next) => setIndicator(module.kind, { on: next })}
            onSet={(key, value) =>
              setIndicator(module.kind, {
                params: { ...settings.indicators[module.kind].params, [key]: value },
              })
            }
            onReset={() =>
              setIndicator(module.kind, { params: defaultParamsOf(module.kind) })
            }
          />
        ))}
        {on === 0 ? (
          <InspectorNote>
            <p className="text-destructive">
              Nothing is switched on, so this step will never buy anything.
              Switch an indicator on above.
            </p>
          </InspectorNote>
        ) : (
          <InspectorNote>
            Switching a side off switches that half of the trading off — no
            ceilings means it never sells on a signal. These are this flow&rsquo;s
            own settings: changing them on the chart moves what you see, not what
            this trades.
          </InspectorNote>
        )}
      </InspectorCard>

      <InspectorCard title="Candles">
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`signals-${node.id}-interval`}
            className="text-xs"
            hint="The bar size the arrows are read on. An arrow can only print when a bar has closed, so a bigger bar means fewer and slower signals."
          >
            Candle size
          </FieldLabel>
          <Select
            value={settings.interval}
            onValueChange={(interval) =>
              write({
                ...settings,
                interval: interval as TradeSignalsSettings["interval"],
              })
            }
          >
            <SelectTrigger
              id={`signals-${node.id}-interval`}
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
        <InspectorNote>
          A base&rsquo;s arrow prints on the candle that FINISHED its wait, which
          is however many candles it had to hold — so a buy here is a buy some
          way above the floor itself, not at it. That is what the indicator
          means, and a smaller candle does not change it.
        </InspectorNote>
      </InspectorCard>

      <InspectorCard title="How much per coin">
        <TradeNumberField
          id={`signals-${node.id}-stake`}
          label="Share of the pot per coin"
          hint="What one buy signal spends. Every coin on the list draws from the same pot, so this also decides how many it can be in at once."
          value={settings.stakePct}
          min={0.1}
          max={100}
          suffix="%"
          onChange={(stakePct) => write({ ...settings, stakePct })}
        />
        <InspectorNote>
          {settings.stakePct}% of{" "}
          {named
            ? `the ${formatUsdRounded(potUsd)} this flow may use`
            : `a ${formatUsdRounded(potUsd)} pot`}
          {walletNode ? "" : ", which is what the wallet step starts at"} — up to{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatUsdRounded(perCoinUsd)}
          </span>{" "}
          in each coin, and about{" "}
          {Math.max(1, Math.floor(100 / settings.stakePct))} of them at once
          before the money runs out.
        </InspectorNote>
      </InspectorCard>

      <InspectorCard title="How it buys">
        <TradeNumberField
          id={`signals-${node.id}-chase`}
          label="How far it follows a price that runs"
          hint="A buy asks for a price rather than taking one. If price moves away before it fills, the order is placed again at the new price — up to this far above where the arrow printed, and then it gives up."
          value={settings.chaseGiveUpPct}
          min={0}
          max={MAX_SIGNAL_CHASE_PCT}
          suffix="%"
          onChange={(chaseGiveUpPct) => write({ ...settings, chaseGiveUpPct })}
        />
        <InspectorNote>
          {settings.chaseGiveUpPct === 0 ? (
            <>
              At zero it does not follow at all, and this is the strictest
              setting there is: it buys at the arrow&rsquo;s price or better,
              and the moment price rises above it that arrow is dropped and the
              coin waits for the next one. Expect most signals to buy nothing.
            </>
          ) : (
            <>
              An arrow at $100 would buy up to{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatUsdRounded(100 * (1 + settings.chaseGiveUpPct / 100))}
              </span>{" "}
              and no further. Selling never gives up — being half out of a
              position is worse than any price it would have got.
            </>
          )}
          <p className="mt-1.5">
            Nothing is ever sent at the market price, in either direction. That
            is what stops a fast market filling a buy well past the level the
            arrow was about.
          </p>
        </InspectorNote>
      </InspectorCard>
    </>
  )
}
