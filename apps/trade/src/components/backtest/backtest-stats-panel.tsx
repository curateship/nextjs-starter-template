import { ChevronDownIcon, FlaskConicalIcon } from "lucide-react"

import {
  BacktestKpi,
  roundedPct,
  sharePct,
  signedPct,
  signedUsd,
  toneClass,
  usd,
} from "@/components/backtest/backtest-kpi"
import { BacktestPotMini } from "@/components/backtest/backtest-pot-mini"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing } from "@/lib/layout/focus-ring"
import type {
  BacktestResult,
  BacktestSpecSnapshot,
  BacktestSummary,
} from "@/lib/trade/backtest/result"
import type { GraphSeries, GraphWindow, WindowStats } from "@/lib/trade/backtest/graph"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { signalIndicatorsOn } from "@/lib/trade/indicators/registry"
import { cn } from "@/lib/utils"

/**
 * The run in figures, down the left — and **all of them answer for whatever
 * stretch of the graph is picked**, not just for the whole run.
 *
 * That is the change worth knowing about. Drag a box across the graph in the
 * middle panel and every tile here recounts itself for those dates: the
 * headline names them, "Trades closed" counts only the round trips that
 * finished inside them, "Coins tested" says how many coins traded in that
 * window rather than in the run. The little chart at the bottom shades the
 * same stretch, so the numbers always have a place.
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
  series,
  stats,
  window,
  onWindow,
  coinsTotal,
  running,
  stopRequested,
  onStop,
}: {
  summary: BacktestSummary | null
  result: BacktestResult | null
  spec: BacktestSpecSnapshot
  /** The pot's lines. Null while the run has nothing to draw. */
  series: GraphSeries | null
  /** Every figure, for the picked stretch of time. */
  stats: WindowStats | null
  window: GraphWindow
  onWindow: (next: GraphWindow) => void
  /** How much the run borrows — see the tooltip in the graph. */
  coinsTotal: number
  /** The run has not finished, so these figures are still moving. */
  running: boolean
  /** True once a stop has been asked for, so the button says so. */
  stopRequested?: boolean
  /** Asks the run to stop. Left out on a run that has already finished. */
  onStop?: () => void
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

  return (
    <>
      <WorkspacePanelHeader
        icon={<FlaskConicalIcon />}
        title="Backtest · all markets"
        action={
          running && onStop ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              disabled={stopRequested}
              onClick={onStop}
            >
              {stopRequested ? "Stopping…" : "Stop"}
            </Button>
          ) : null
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 px-5 py-4">
          {!summary ? (
            <p className="p-2 text-xs text-muted-foreground">
              {running
                ? "Still loading its candles — nothing is worked out yet."
                : "This run ended without testing a market — it was stopped, or every market was skipped."}
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
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xl font-semibold tracking-tight tabular-nums",
                      (stats ? stats.net : summary.madeOrLost) >= 0
                        ? "bg-teal-600/10 text-teal-600 dark:bg-teal-400/10 dark:text-teal-400"
                        : "bg-red-600/10 text-red-600 dark:bg-red-400/10 dark:text-red-400"
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

              {/* Ruled, not gapped: one hairline between cells so the figures
                  line up in two columns and read as a table of results. The
                  grid is pulled out to the panel's edges, the way the design
                  runs its rules the full width. */}
              <div className="-mx-5 grid grid-cols-2 border-t">
                <BacktestKpi
                  label="Win rate"
                  value={
                    stats && stats.tradesClosed !== null && stats.tradesWon !== null
                      ? sharePct(stats.tradesWon, stats.tradesClosed)
                      : "—"
                  }
                  sub={
                    stats && stats.tradesClosed !== null && stats.tradesWon !== null
                      ? `${stats.tradesWon}W / ${stats.tradesClosed - stats.tradesWon}L`
                      : "needs the run's trades"
                  }
                />
                <BacktestKpi
                  label="Trades closed"
                  value={count(stats?.tradesClosed ?? null)}
                  sub={
                    stats?.openNow === null || stats?.openNow === undefined
                      ? "in this window"
                      : `${stats.openNow} open at the end`
                  }
                />
                <BacktestKpi
                  label="Max drawdown"
                  value={stats ? `-${roundedPct(stats.worstDipPct)}` : "—"}
                  sub={
                    stats
                      ? `${usd(stats.worstDipUsd)} off ${usd(stats.worstDipPeak)}`
                      : ""
                  }
                  tone={stats && stats.worstDipUsd > 0 ? -1 : undefined}
                />
                <BacktestKpi
                  label="Recovery"
                  value={
                    !stats
                      ? "—"
                      : stats.recoveryDays === null
                        ? "not yet"
                        : `${stats.recoveryDays}d`
                  }
                  sub={
                    stats?.worstDipAt
                      ? `trough ${formatDate(new Date(stats.worstDipAt))}`
                      : "back to the old high"
                  }
                />
                {/* Whole-run, always. There is nothing saved per bar to slice a
                    hold-it-instead figure out of, so a windowed one would be
                    invented. Saying "whole run" is cheaper than being wrong. */}
                <BacktestKpi
                  label="Buy & hold"
                  value={signedUsd(summary.buyAndHold)}
                  sub={scoped ? "whole run · if you just held" : "if you just held"}
                  tone={summary.buyAndHold}
                />
                <BacktestKpi
                  label="Profit factor"
                  value={
                    !stats || stats.tradesClosed === null
                      ? "—"
                      : stats.profitFactor === null
                        ? "no losses"
                        : stats.profitFactor.toFixed(2)
                  }
                  sub={
                    !stats || stats.profitFactor === null
                      ? "made against lost"
                      : stats.profitFactor >= 1
                        ? "wins outweigh losses"
                        : "losses outweigh wins"
                  }
                />
                <BacktestKpi
                  label="Expectancy"
                  value={
                    stats && stats.expectancy !== null
                      ? signedUsd(stats.expectancy)
                      : "—"
                  }
                  sub="per closed trade"
                  tone={stats?.expectancy ?? undefined}
                />
                <BacktestKpi
                  label="Markets green"
                  value={
                    stats && stats.coinsGreen !== null && stats.coinsTraded !== null
                      ? `${stats.coinsGreen}/${stats.coinsTraded}`
                      : "—"
                  }
                  sub="net positive of traded"
                />
                {/* Only on a window where it happened. A permanent zero tile is
                    one the eye stops reading — including on the day it matters. */}
                {showLiquidated ? (
                  <BacktestKpi
                    label="Liquidated"
                    value={signedUsd(stats?.liquidatedUsd ?? 0)}
                    sub={`${liquidatedCount} ${plural(liquidatedCount, "trade", "trades")} taken by the exchange`}
                    tone={-1}
                  />
                ) : null}
                <BacktestKpi
                  label="Peak wallet"
                  value={stats ? `${Math.round(stats.peakWalletPct)}%` : "—"}
                  sub={
                    stats
                      ? `${usd(stats.peakWalletUsd)} · ${formatDate(new Date(stats.peakWalletAt))}`
                      : ""
                  }
                />
                <BacktestKpi
                  label="Avg wallet"
                  value={stats ? `${Math.round(stats.typicalWalletPct)}%` : "—"}
                  sub={
                    stats ? `${usd(stats.typicalWalletUsd)} typically` : ""
                  }
                />
                <BacktestKpi
                  label="Time in market"
                  value={
                    stats && stats.timeInMarketPct !== null
                      ? `${Math.round(stats.timeInMarketPct)}%`
                      : "—"
                  }
                  sub={
                    stats && stats.avgHoldMs !== null
                      ? `avg hold ${Math.round(stats.avgHoldMs / 3_600_000)}h`
                      : "needs the run's trades"
                  }
                />
                <BacktestKpi
                  label="In markets now"
                  // Already the coin bought, not the margin behind it —
                  // `windowStats` multiplies the borrowing in. Multiplying
                  // again here doubled the tile against the graph's own
                  // tooltip: $13,541 on the card beside $6,770 on the chart.
                  value={stats ? usd(stats.inCoinsUsd) : "—"}
                  sub={
                    stats?.openNow === null || stats?.openNow === undefined
                      ? "at the end of the window"
                      : `${stats.openNow} ${plural(stats.openNow, "position", "positions")} open`
                  }
                />
                <BacktestKpi
                  label="Markets tested"
                  value={
                    scoped && stats?.coinsTraded !== null && stats?.coinsTraded !== undefined
                      ? `${stats.coinsTraded}/${coinsTotal}`
                      : `${summary.coinsTested}/${coinsTotal}`
                  }
                  sub={scoped ? "traded in this window" : "in this run"}
                />
                {/* Holds the last row up when the Liquidated tile is away and
                    the count is odd, so the rule between the columns does not
                    run down past the last figure into nothing. */}
                {showLiquidated ? null : <div className="border-b" />}
              </div>

              {series ? (
                <BacktestPotMini
                  series={series}
                  window={window}
                  onReset={() =>
                    onWindow({ preset: "all", from: null, to: null, sel: null })
                  }
                />
              ) : null}

              <dl className="grid gap-1 border-t pt-3 text-[11px]">
                {/* Follows the box dragged on the graph, like every figure
                    above it. It was the run's own window and nothing else —
                    so dragging out a fortnight left this saying "90 days",
                    which is the one line on the panel somebody checks the
                    dates against. Whole run, and it is the run's window
                    again. */}
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
                ) : (
                  <>
                    <Line
                      label="Indicators"
                      value={String(signalIndicatorsOn(spec.strategy.indicators))}
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
                )}
                <Line
                  label="Costs"
                  value={`${spec.takerFeePct}% / ${spec.makerFeePct}% / ${spec.slippagePct}%`}
                />
                {/* The engine counts a charge as positive and a payment to
                    us as negative. Shown as "-$1,489" under a label reading
                    "paid" it looks like an enormous cost, when it is money the
                    run took in — so the label follows the sign. */}
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
                {/* Not saved anywhere as one figure — it is the coins' own fee
                    totals added up, and a run too old to carry them says so
                    rather than reporting nothing spent. */}
                <Line label="Fees paid" value={feesPaid(result)} />
              </dl>

              {/* Shut by default, and it says how many there are on the line
                  you open it with. Three paragraphs about missing history sat
                  permanently under the figures and pushed the pot's own chart
                  off the bottom of the panel — and a warning you scroll past
                  every visit is one you stop reading. It still cannot be
                  missed: the count is in the heading. */}
              {summary.warnings.length > 0 ? (
                <Collapsible className="border-t pt-3">
                  <CollapsibleTrigger
                    className={cn(
                      "group flex w-full items-center gap-2 text-left text-xs font-semibold",
                      focusRing
                    )}
                  >
                    <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    Read this before you believe the top number
                    <span className="ml-auto font-normal text-muted-foreground">
                      {summary.warnings.length}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="grid list-disc gap-1.5 pt-2 pl-4 text-[11px] leading-4 text-muted-foreground">
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
      </ScrollArea>
    </>
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

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="min-w-0 flex-1 text-muted-foreground">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  )
}
