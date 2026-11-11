import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { parseMarketKey, protocolLabel } from "@/lib/protocols/contracts"

import {
  roundedPct,
  sharePct,
  signedPct,
  signedUsd,
  toneClass,
  usd,
} from "@/components/backtest/backtest-kpi"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Meter } from "@/components/ui/meter"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { focusRing } from "@/lib/layout/focus-ring"
import { emaGridCleanHours } from "@/lib/recipes/trade-grid"
import type {
  BacktestResult,
  BacktestSpecSnapshot,
  BacktestSummary,
} from "@/lib/trade/backtest/result"
import type {
  GraphWindow,
  WindowStats,
} from "@/lib/trade/backtest/graph"
import { formatDate, formatDuration } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { signalIndicatorsOn } from "@/lib/trade/indicators/registry"
import { moneyToneSurface } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

/**
 * The run in figures, down the left — and **all of them answer for whatever
 * stretch of the graph is picked**, not just for the whole run.
 *
 * That is the change worth knowing about. Drag a box across the graph in the
 * middle panel and every tile here recounts itself for those dates: the
 * headline names them, "Trades closed" counts only the round trips that
 * finished inside them, "Coins tested" says how many coins traded in that
 * window rather than in the run. The headline and the Window line name the
 * stretch, so the numbers always have a place.
 *
 * The sums are in `@/lib/trade/backtest/graph`, where a test can check them.
 * Nothing is worked out in this file: a panel doing its own arithmetic drifts
 * from the graph it sits beside the moment either changes.
 *
 * **A dash is an answer.** Figures that need the run's every trade show "—"
 * until those arrive, and on runs saved before they were kept. A zero would
 * read as "none happened", which is a different and wrong thing to say.
 */

/**
 * A figure a run is too old to carry: the engine was not measuring it when that
 * run finished, and results are never rewritten after the fact. Read through
 * these rather than off the row, so an older run shows a dash instead of taking
 * the page down with it.
 */
function figure(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** A whole number, or a dash when the trades that would answer are missing. */
function count(value: number | null): string {
  return value === null ? "—" : String(value)
}

export function BacktestStatsPanel({
  summary,
  result,
  spec,
  stats,
  window,
  coinsTotal,
  running,
  progress = 0,
  progressText = `${Math.round(progress * 100)}% through`,
}: {
  summary: BacktestSummary | null
  result: BacktestResult | null
  spec: BacktestSpecSnapshot
  /** Every figure, for the picked stretch of time. */
  stats: WindowStats | null
  window: GraphWindow
  /** How much the run borrows — see the tooltip in the graph. */
  coinsTotal: number
  /** How far the run has got, from zero to one. */
  progress?: number
  /** The bar's words, from `backtestMeter`. */
  progressText?: string
  /** The run has not finished, so these figures are still moving. */
  running: boolean
}) {
  const scoped =
    stats !== null &&
    (window.sel !== null ||
      window.preset !== "all" ||
      window.from !== null ||
      window.to !== null)

  // Worked out once because two things depend on it: the tile itself, and the
  // empty cell that keeps the last row of the grid even. If they ever disagreed
  // the rule between the two columns would run down past the last figure.
  const liquidatedCount = stats?.liquidatedCount ?? 0
  const showLiquidated = liquidatedCount > 0

  // The body of the right panel's Result card: the card is its frame and the
  // panel scrolls, so nothing here scrolls or pads itself.
  // One column the card's own width: an "auto" one grew to the widest line and
  // ran past the card's edge in a narrow panel.
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      {/* No lines over the headline: how long it took and how many coins it
          skipped are gone (Tyler, 10 Nov 2026: "remove [Took 10m]", "remove
          [3 coins skipped]"). The Backtests table has the time, and the
          Skipped card's heading has the count. */}
      {running ? (
        <div className="grid gap-2">
          <span className="text-xs tabular-nums">{progressText}</span>
          <Meter
            value={Math.round(progress * 100)}
            label="Backtest progress"
            valueText={progressText}
          />
        </div>
      ) : null}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          {!summary ? (
            <p className="p-2 text-xs text-muted-foreground">
              {running
                ? "Still loading its candles. Nothing is worked out yet."
                : "This run ended without testing a market. It was stopped, or every market was skipped."}
            </p>
          ) : (
            <>
              {/* What it made, and over what. The dates are the whole point of
                  the headline: with a box dragged on the graph this is no
                  longer the run's figure, and saying so is what stops it being
                  read as one. */}
              {/* `pb-2` on top of the grid's own gap, so the space under this
                  line matches the 20px at the sides and the top rather than
                  sitting tighter than both. */}
              <div className="pb-2">
                {/* The percent leads: it is the half of this line that can be
                    held against another run, another window or another
                    strategy, while the dollars only mean anything next to the
                    pot they came out of. Both at the same size and weight —
                    in a pill at 11px the comparable figure was the smallest
                    thing on the panel. */}
                {/* Wraps in a narrow panel, as the bot's does, rather than
                    running past the card's edge. */}
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xl font-semibold tracking-tight tabular-nums",
                      moneyToneSurface(stats ? stats.net : summary.madeOrLost)
                    )}
                  >
                    {signedPct(stats ? stats.netPct : summary.madeOrLostPct)}
                  </span>
                  {/* Coloured like every other figure in the app: made money is
                      teal, lost is red. */}
                  <span
                    className={cn(
                      "text-xl font-semibold tracking-tight tabular-nums",
                      toneClass(stats ? stats.net : summary.madeOrLost)
                    )}
                  >
                    {signedUsd(stats ? stats.net : summary.madeOrLost)}
                  </span>
                </div>
              </div>

              {/* Named groups of label and figure, one figure a line (Tyler,
                  10 Nov 2026: "revamp the results card", then "just make it
                  look like what I showed you"). Each figure's note, such as
                  "917W / 1181L" or the trough's date, is on its tooltip. */}
              <Group title="Trades">
                <Stat
                  label="Win rate"
                  value={
                    stats &&
                    stats.tradesClosed !== null &&
                    stats.tradesWon !== null
                      ? sharePct(stats.tradesWon, stats.tradesClosed)
                      : "—"
                  }
                  note={
                    stats &&
                    stats.tradesClosed !== null &&
                    stats.tradesWon !== null
                      ? `${stats.tradesWon} won, ${stats.tradesClosed - stats.tradesWon} lost`
                      : "Needs the run's trades"
                  }
                  tone={stats?.expectancy ?? undefined}
                />
                <Stat
                  label="Profit factor"
                  value={
                    !stats || stats.tradesClosed === null
                      ? "—"
                      : stats.profitFactor === null
                        ? "no losses"
                        : stats.profitFactor.toFixed(2)
                  }
                  note={
                    !stats || stats.profitFactor === null
                      ? "Made against lost"
                      : stats.profitFactor >= 1
                        ? "Wins outweigh losses"
                        : "Losses outweigh wins"
                  }
                  tone={
                    stats && stats.profitFactor !== null
                      ? stats.profitFactor - 1
                      : undefined
                  }
                />
                <Stat
                  label="Expectancy"
                  value={
                    stats && stats.expectancy !== null
                      ? signedUsd(stats.expectancy)
                      : "—"
                  }
                  note="What one closed trade made on average"
                  tone={stats?.expectancy ?? undefined}
                />
                <Stat
                  label="Trades closed"
                  value={count(stats?.tradesClosed ?? null)}
                  note={
                    stats?.openNow === null || stats?.openNow === undefined
                      ? "In this window"
                      : `${stats.openNow} still open at the end`
                  }
                />
              </Group>

              <Group title="Risk">
                <Stat
                  label="Max drawdown"
                  value={stats ? `-${roundedPct(stats.worstDipPct)}` : "—"}
                  note={
                    stats
                      ? `${usd(stats.worstDipUsd)} off ${usd(stats.worstDipPeak)}`
                      : null
                  }
                  tone={stats && stats.worstDipUsd > 0 ? -1 : undefined}
                />
                {/* Whole-run, always. There is nothing saved per bar to slice a
                    hold-it-instead figure out of, so a windowed one would be
                    invented. */}
                <Stat
                  label="Buy & hold"
                  value={signedUsd(summary.buyAndHold)}
                  note={
                    scoped
                      ? "Whole run: what you would have if you just held"
                      : "What you would have if you just held"
                  }
                  tone={summary.buyAndHold}
                />
                <Stat
                  label="Recovery"
                  value={
                    !stats
                      ? "—"
                      : stats.recoveryDays === null
                        ? "not yet"
                        : `${stats.recoveryDays}d`
                  }
                  note={
                    stats?.worstDipAt
                      ? `Back to the old high. Lowest on ${formatDate(new Date(stats.worstDipAt))}`
                      : "Back to the old high"
                  }
                />
                {/* Only on a window where it happened. A permanent zero line is
                    one the eye stops reading, including on the day it matters. */}
                {showLiquidated ? (
                  <Stat
                    label="Liquidated"
                    value={signedUsd(stats?.liquidatedUsd ?? 0)}
                    note={`${liquidatedCount} ${plural(liquidatedCount, "trade", "trades")} taken by the exchange`}
                    tone={-1}
                  />
                ) : null}
              </Group>

              <Group title="Exposure">
                <Stat
                  label="Time in market"
                  value={
                    stats && stats.timeInMarketPct !== null
                      ? `${Math.round(stats.timeInMarketPct)}%`
                      : "—"
                  }
                  note={
                    stats && stats.avgHoldMs !== null
                      ? `Average hold ${formatDuration(stats.avgHoldMs, {
                          zero: "under one candle",
                        })}`
                      : "Needs the run's trades"
                  }
                />
                <Stat
                  label="In markets now"
                  // Already the coin bought, not the margin behind it:
                  // `windowStats` multiplies the borrowing in.
                  value={stats ? usd(stats.inCoinsUsd) : "—"}
                  note={
                    stats?.openNow === null || stats?.openNow === undefined
                      ? "At the end of the window"
                      : `${stats.openNow} ${plural(stats.openNow, "position", "positions")} open`
                  }
                />
                <Stat
                  label="Peak wallet"
                  value={stats ? `${Math.round(stats.peakWalletPct)}%` : "—"}
                  note={
                    stats
                      ? `${usd(stats.peakWalletUsd)} on ${formatDate(new Date(stats.peakWalletAt))}`
                      : null
                  }
                />
                <Stat
                  label="Avg wallet"
                  value={stats ? `${Math.round(stats.typicalWalletPct)}%` : "—"}
                  note={stats ? `${usd(stats.typicalWalletUsd)} typically` : null}
                />
              </Group>

              <Group title="Markets">
                <Stat
                  label="Markets tested"
                  value={
                    scoped &&
                    stats?.coinsTraded !== null &&
                    stats?.coinsTraded !== undefined
                      ? `${stats.coinsTraded}/${coinsTotal}`
                      : `${summary.coinsTested}/${coinsTotal}`
                  }
                  note={scoped ? "Traded in this window" : "In this run"}
                />
                <Stat
                  label="Markets green"
                  value={
                    stats &&
                    stats.coinsGreen !== null &&
                    stats.coinsTraded !== null
                      ? `${stats.coinsGreen}/${stats.coinsTraded}`
                      : "—"
                  }
                  note="Made money, of the ones that traded"
                />
              </Group>

              <Group title="Setup" small>
                {/* Follows the box dragged on the graph, like every figure
                    above it. */}
                <Line
                  label={scoped ? "Picked" : "Window"}
                  value={
                    scoped && stats
                      ? `${stats.days} ${plural(stats.days, "day", "days")} of ${spec.interval}`
                      : `${spec.days} ${plural(spec.days, "day", "days")} of ${spec.interval}`
                  }
                />
                {scoped && stats ? (
                  <Line
                    label="From"
                    value={`${formatDate(new Date(stats.fromT))} to ${formatDate(new Date(stats.toT))}`}
                  />
                ) : null}
                {/* What the run tested, in the words of whichever strategy it
                    was. A signals run has no rungs and no ramp, and showing
                    those as zeroes would read as a ladder that did nothing. */}
                {spec.strategy.kind === "dca" ? (
                  <>
                    <Line
                      label="Rungs"
                      value={String(spec.strategy.params.rungs.length)}
                    />
                    <Line
                      label="Most of the pot, per market"
                      value={`${spec.strategy.params.maxPositionPct}%`}
                    />
                    <Line
                      label="Size ramp"
                      value={`${spec.strategy.params.sizeMultiplier}×`}
                    />
                  </>
                ) : spec.strategy.kind === "signals" ? (
                  <>
                    <Line
                      label="Indicators"
                      value={String(
                        signalIndicatorsOn(spec.strategy.indicators)
                      )}
                    />
                    <Line
                      label="Per market, per arrow"
                      value={`${spec.strategy.stakePct}%`}
                    />
                    <Line
                      label="Follows a price that runs"
                      value={
                        spec.strategy.chaseGiveUp === 0
                          ? "Not at all"
                          : `Up to ${(spec.strategy.chaseGiveUp * 100).toFixed(2).replace(/\.?0+$/, "")}%`
                      }
                    />
                  </>
                ) : (
                  <>
                    <Line
                      label="EMA"
                      value={`4h EMA ${spec.strategy.settings.emaPeriod}`}
                    />
                    <Line
                      label="Cross confirmation"
                      value={`${emaGridCleanHours(spec.strategy.settings)} clean hours`}
                    />
                    <Line
                      label="Grid"
                      value={`${spec.strategy.settings.grid.levels} rungs, ${spec.strategy.settings.grid.potPct}% per market`}
                    />
                    <Line
                      label="Follows price"
                      value={
                        spec.strategy.settings.grid.follow &&
                        spec.strategy.settings.grid.followDown
                          ? "Up and down"
                          : spec.strategy.settings.grid.follow
                            ? "Up"
                            : spec.strategy.settings.grid.followDown
                              ? "Down"
                              : "Off"
                      }
                    />
                  </>
                )}
                {/* Whose candles the run walked. */}
                <Line label="Prices from" value={pricesFrom(spec.marketKeys)} />
              </Group>

              <Group title="Costs" small>
                <Line
                  label="Costs"
                  value={`${spec.takerFeePct}% / ${spec.makerFeePct}% / ${spec.slippagePct}%`}
                />
                {/* The engine counts a charge as positive and a payment to
                    us as negative, so the label follows the sign. */}
                <Line
                  label={
                    figure(summary.fundingPaid) !== null &&
                    summary.fundingPaid < 0
                      ? "Funding earned"
                      : "Funding paid"
                  }
                  value={
                    figure(summary.fundingPaid) === null
                      ? "—"
                      : usd(Math.abs(summary.fundingPaid))
                  }
                />
                {(summary.fundingNotCounted ?? []).length > 0 ? (
                  // The stocks named on a tooltip: listed in full they were
                  // eleven lines (Tyler, 10 Nov 2026: "hide this in a
                  // tooltip or something").
                  <Line
                    label="Funding not counted"
                    value={`${summary.fundingNotCounted.length} ${plural(summary.fundingNotCounted.length, "stock", "stocks")}`}
                    note={`No funding was counted in this run for ${summary.fundingNotCounted.join(", ")}.`}
                  />
                ) : null}
                {/* The coins' own fee totals added up; a run too old to carry
                    them says so rather than reporting nothing spent. */}
                <Line label="Fees paid" value={feesPaid(result)} />
              </Group>

              {/* An amber box with the count in a circle, shut until opened:
                  a warning you scroll past every visit is one you stop
                  reading, and the count keeps it from being missed. */}
              {summary.warnings.length > 0 ? (
                <Collapsible className="rounded-lg border border-orange-200 bg-orange-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  <CollapsibleTrigger
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm leading-5 font-semibold",
                      focusRing
                    )}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-800 text-xs font-semibold text-white tabular-nums">
                      {summary.warnings.length}
                    </span>
                    <span className="min-w-0 flex-1">
                      Warning
                    </span>
                    <ChevronDownIcon className="size-3.5 shrink-0 text-amber-800 transition-transform group-data-[state=open]:rotate-180 dark:text-amber-300" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="grid list-disc gap-1.5 px-3 pb-3 pl-7 text-xs leading-4">
                      {summary.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </>
          )}
      </div>
    </div>
  )
}

/** Every coin's fees added up, or a dash when no coin recorded any. */
function feesPaid(result: BacktestResult | null): string {
  if (!result) return "—"
  let total = 0
  let known = false
  for (const coin of result.coins) {
    const fees = figure(coin.stats?.fees)
    if (fees === null) continue
    known = true
    total += fees
  }
  if (!known) return "—"
  return total > 0 ? `-${usd(total)}` : usd(0)
}

/** The sources behind a run's coins, by printed name, in the order first seen. */
function pricesFrom(marketKeys: readonly string[]): string {
  const labels: string[] = []
  for (const key of marketKeys) {
    const ref = parseMarketKey(key)
    if (!ref) continue
    const label = protocolLabel(ref.protocol)
    if (!labels.includes(label)) labels.push(label)
  }
  return labels.length > 0 ? labels.join(", ") : "—"
}

/**
 * One named group: a small grey capitals heading over its lines. `small`
 * is for the Setup and Costs groups, whose lines are settings rather than
 * results, so they read a size down and not in bold.
 */
function Group({
  title,
  small = false,
  children,
}: {
  title: string
  small?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-1">
      <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/80 uppercase">
        {title}
      </h3>
      <dl className={cn("grid", small ? "gap-1 text-[13px]" : "gap-1.5 text-sm")}>
        {children}
      </dl>
    </section>
  )
}

/** A result: its name on the left, the figure in bold on the right, coloured when it made or lost money. */
function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  /** What the figure is made of, on its tooltip. */
  note?: string | null
  tone?: number
}) {
  const figureText = (
    <dd
      className={cn(
        "shrink-0 font-semibold tabular-nums",
        value === "—" ? "text-muted-foreground" : toneClass(tone)
      )}
    >
      {value}
    </dd>
  )
  return (
    <div className="flex items-baseline gap-3">
      <dt className="min-w-0 flex-1 truncate text-foreground/75">{label}</dt>
      {note ? (
        <Tooltip>
          <TooltipTrigger asChild>{figureText}</TooltipTrigger>
          <TooltipContent className="max-w-64">{note}</TooltipContent>
        </Tooltip>
      ) : (
        figureText
      )}
    </div>
  )
}

/** A setting: its name on the left, the value on the right, in plain type. A `note` goes on the value's tooltip. */
function Line({ label, value, note }: { label: string; value: string; note?: string }) {
  const valueText = (
    <dd
      className={cn(
        "max-w-[66%] shrink-0 text-right break-words tabular-nums",
        note && "underline decoration-dotted underline-offset-4"
      )}
    >
      {value}
    </dd>
  )
  return (
    // A long value, such as six exchanges after "Prices from", takes at most
    // two thirds of the line and wraps at the right; the name wraps in what
    // is left. Neither runs over the other.
    <div className="flex items-baseline gap-3">
      <dt className="min-w-0 flex-1 text-foreground/75">{label}</dt>
      {note ? (
        <Tooltip>
          <TooltipTrigger asChild>{valueText}</TooltipTrigger>
          <TooltipContent className="max-w-64">{note}</TooltipContent>
        </Tooltip>
      ) : (
        valueText
      )}
    </div>
  )
}
