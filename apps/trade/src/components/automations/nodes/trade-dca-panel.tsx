import { PlusIcon, Trash2Icon } from "lucide-react"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { TradeNumberField } from "@/components/automations/nodes/trade-number-field"
import { defaultCascade } from "@/lib/trade/cascade"
import { formatUsdRounded } from "@/lib/trade/format"
import { cappedHold } from "@/lib/trade/indicators/base"
import {
  DEFAULT_BACKTEST_START_USD,
  tradeWalletNode,
  tradeWalletSettingsSchema,
} from "@/lib/automations/nodes/trade-wallet"
import { cn } from "@/lib/utils"
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
  dcaAllocationPcts,
  MAX_DCA_RUNGS,
  nextDcaRung,
  type DcaTpMode,
} from "@/lib/trade/dca"

/** The four columns, on the header and every rung, so they line up. */
const RUNG_GRID =
  "grid grid-cols-[1rem_minmax(0,1fr)_minmax(0,1fr)_1.75rem] items-center gap-2"

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
  graph,
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
  const crash = params.cascade ?? null

  // What each rung actually buys, in money.
  //
  // A percentage of a percentage is not something anybody can check by eye: a
  // ramp of 2 over nine rungs turns "3% of the pot" into shares from 0.01% to
  // 3%, and nobody reads that as "six dollars, then twelve". So the money is
  // shown, exactly as the app this is a port of shows it — and it is the same
  // arithmetic the run itself uses, not a second sum drawn for the panel.
  //
  // The pot comes off the money step in the same flow, so changing it there
  // changes these. A flow with no money step yet falls back to the same figure
  // that step starts life with, rather than showing nothing.
  const walletNode = graph?.nodes.find(
    (one) => one.kind === tradeWalletNode.kind
  )
  const walletRead = walletNode
    ? tradeWalletSettingsSchema.safeParse(walletNode.settings)
    : null
  const potUsd = walletRead?.success
    ? walletRead.data.startingUsd
    : DEFAULT_BACKTEST_START_USD
  const perCoinUsd = (potUsd * params.maxPositionPct) / 100
  const shares = dcaAllocationPcts(
    params.rungs.length,
    params.maxPositionPct,
    params.sizeMultiplier
  )

  return (
    <>
      <InspectorCard title="Ladder">
        <div className="rounded-md border bg-background px-2.5 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Most one coin can spend</span>
            <span className="font-medium tabular-nums">
              {formatUsdRounded(perCoinUsd)}
            </span>
          </div>
          <p className="mt-0.5 text-muted-foreground">
            {params.maxPositionPct}% of a {formatUsdRounded(potUsd)} pot
            {walletNode ? "" : ", which is what the money step starts at"}. The
            buys below add up to it. {params.compound
              ? "Later ladders rise or fall with the pot."
              : "Every later ladder stays based on this starting pot."}
          </p>
        </div>

        <div className={cn(RUNG_GRID, "text-[11px] text-muted-foreground")}>
          <span>#</span>
          <span>% below the buy above</span>
          <span>Buy size</span>
          <span />
        </div>

        {params.rungs.map((rung, index) => (
          <div key={index} className={RUNG_GRID}>
            <span className="text-right text-xs text-muted-foreground">
              {index + 1}
            </span>
            <Input
              inputMode="decimal"
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
            {/* Read-only, and shaped like the field beside it so the row reads
                as one line rather than an input next to a stray number. */}
            <div
              className="flex h-8 items-center rounded-lg border bg-muted/40 px-2.5 text-xs text-muted-foreground tabular-nums"
              aria-label={`Rung ${index + 1} buy size`}
            >
              {formatUsdRounded((potUsd * (shares[index] ?? 0)) / 100)}
            </div>
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
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`dca-${node.id}-compound`}
            className="text-xs"
            hint="Compound sizes each new ladder from the pot at that moment, so wins and losses change later buys. Fixed always sizes from the starting pot."
          >
            Bet sizing
          </FieldLabel>
          <Select
            value={params.compound ? "compound" : "fixed"}
            onValueChange={(value) =>
              setParams({ compound: value === "compound" })
            }
          >
            <SelectTrigger id={`dca-${node.id}-compound`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compound">
                Compound — grow bets with the account
              </SelectItem>
              <SelectItem value="fixed">Fixed — same bet every time</SelectItem>
            </SelectContent>
          </Select>
        </div>
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

      {/* Where the floor is, which is the level the whole ladder hangs off.
          These two used to be nowhere: fixed at the Base indicator's factory
          numbers, unreachable from here and unreachable from the chart, so
          every run tested one definition of a base and no other could be
          tried. */}
      <InspectorCard title="What counts as a base">
        <TradeNumberField
          id={`dca-${node.id}-search`}
          label="Candles to search back"
          hint="How far back to look for the lowest low that makes a base. Bigger means fewer bases, and the ones it finds matter more."
          value={params.baseDetection.searchBars}
          min={4}
          max={500}
          onChange={(searchBars) =>
            setParams({
              baseDetection: {
                ...params.baseDetection,
                searchBars: Math.round(searchBars),
              },
            })
          }
        />
        <TradeNumberField
          id={`dca-${node.id}-hold`}
          label="Candles it must hold"
          hint="How long that new low has to stand without being broken before it counts as a base. It can never be as long as the search itself — a low found in the last 36 candles cannot then wait 40 for nothing to beat it."
          value={params.baseDetection.holdBars}
          min={1}
          max={499}
          onChange={(holdBars) =>
            setParams({
              baseDetection: {
                ...params.baseDetection,
                holdBars: Math.round(holdBars),
              },
            })
          }
        />
        <TradeNumberField
          id={`dca-${node.id}-apart`}
          label="Fewest candles between bases"
          hint="Two bases can never count closer together than this. It stops the ladder re-aiming at every little shelf on the way down, and it is the same setting that stops the chart's arrows bunching up."
          value={params.baseDetection.minBarsApart}
          min={1}
          max={1000}
          onChange={(minBarsApart) =>
            setParams({
              baseDetection: {
                ...params.baseDetection,
                minBarsApart: Math.round(minBarsApart),
              },
            })
          }
        />
        <label className="flex items-start gap-2 text-xs">
          <Checkbox
            checked={params.baseDetection.withTrendOnly}
            onCheckedChange={(on) =>
              setParams({
                baseDetection: {
                  ...params.baseDetection,
                  withTrendOnly: on === true,
                },
              })
            }
          />
          <span>
            Only levels with the trend
            <span className="mt-0.5 block text-muted-foreground">
              A base only counts when it sits above the base before it. Off,
              the ladder follows every floor down a falling market.
            </span>
          </span>
        </label>
        <InspectorNote>
          {/* The same sentence the Base indicator's own panel shows, from the
              same function — a wait longer than the search is a question with
              no answer, and the run quietly shortens it. Saying so in one place
              and not the other is how the chart and the strategy start
              disagreeing without anybody noticing. */}
          {cappedHold(
            params.baseDetection.searchBars,
            params.baseDetection.holdBars
          ) !== params.baseDetection.holdBars ? (
            <p className="mb-1.5 text-foreground">
              The wait has to be shorter than the search, so it is acting as{" "}
              {cappedHold(
                params.baseDetection.searchBars,
                params.baseDetection.holdBars
              )}{" "}
              candles.
            </p>
          ) : null}
          These are the Base indicator&rsquo;s own two settings, kept here so a
          saved flow tests the same thing every time it runs. Changing them on
          the chart moves what you see, not what this tests.
        </InspectorNote>
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

      {/* Directly under Take profit because that is the only thing it changes:
          it pauses the "sell at previous rung" exits and nothing else. */}
      <InspectorCard title="Market crash">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`dca-${node.id}-cascade-on`}
            checked={crash !== null}
            onCheckedChange={(next) =>
              setParams({ cascade: next === true ? defaultCascade() : null })
            }
          />
          <FieldLabel
            htmlFor={`dca-${node.id}-cascade-on`}
            className="text-xs"
            hint="When many coins collapse together, hold instead of selling at the previous rung. The ladder's deepest rung is its biggest bet, and the rung above it is barely off the floor."
          >
            Hold through a market-wide crash
          </FieldLabel>
        </div>

        {crash ? (
          <>
            <TradeNumberField
              id={`dca-${node.id}-cascade-fall`}
              label="Each coin falls at least"
              hint="Measured from any high to a later low. In six years of Binance history, at most one coin ever fell 50% this fast on a day that was not a real market-wide crash."
              value={crash.fallPct}
              min={20}
              max={95}
              suffix="%"
              onChange={(fallPct) => setParams({ cascade: { ...crash, fallPct } })}
            />
            <TradeNumberField
              id={`dca-${node.id}-cascade-within`}
              label="Within"
              hint="October 2025 fell that far in 8 minutes, but May 2021 took nearer four hours. An hour would have half-missed May."
              value={crash.withinHours}
              min={0.25}
              max={24}
              suffix="hours"
              onChange={(withinHours) =>
                setParams({ cascade: { ...crash, withinHours } })
              }
            />
            <TradeNumberField
              id={`dca-${node.id}-cascade-coins`}
              label="Coins doing it at once"
              hint="The half that matters. One coin falling 70% is a catastrophe that may never come back; ten unrelated coins falling together is the order book emptying, and that refills."
              value={crash.minCoins}
              min={2}
              max={500}
              onChange={(minCoins) => setParams({ cascade: { ...crash, minCoins } })}
            />
            <TradeNumberField
              id={`dca-${node.id}-cascade-hold`}
              label="Hold for"
              hint="How long before it goes back to selling normally. Long enough to read the news and decide, not a bet that the market recovers."
              value={crash.holdHours}
              min={0.25}
              max={720}
              suffix="hours"
              onChange={(holdHours) =>
                setParams({ cascade: { ...crash, holdHours } })
              }
            />
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
