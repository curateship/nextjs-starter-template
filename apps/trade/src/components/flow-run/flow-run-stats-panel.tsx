import { ActivityIcon } from "lucide-react"

import {
  BacktestKpi,
  roundedPct,
  sharePct,
  signedPct,
  signedUsd,
  toneClass,
  usd,
} from "@/components/backtest/backtest-kpi"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { GraphWindow, WindowStats } from "@/lib/trade/backtest/graph"
import type { FlowRunReport } from "@/lib/api/flow-runs"
import { formatDate } from "@/lib/format/format-time"
import { formatHeld } from "@/lib/trade/live-trades"
import { plural } from "@/lib/format/plural"
import { signalIndicatorsOn } from "@/lib/trade/indicators/registry"
import { cn } from "@/lib/utils"

/**
 * The run in figures, down the left, answering for whatever stretch of the
 * money line is picked — the same promise the backtest screen makes, and the
 * same arithmetic behind it (`windowStats`), so the two screens can never
 * disagree about what a win rate is.
 *
 * **Two of the backtest's tiles are missing on purpose.**
 *
 * "Buy & hold" needs a fixed window and an equal pretend stake to compare
 * against; a run that is still going has neither, and any version of it here
 * would be a made-up figure sitting beside real ones. "Markets tested" means
 * nothing either — a live run tests nothing, it watches a list somebody chose.
 *
 * In their place are the five things only a live run can say: how many of its
 * coins are working, what it is holding right now, what it is stuck on, how
 * long it has been going, and how many trades on this wallet were not its.
 */
export function FlowRunStatsPanel({
  report,
  stats,
  window,
  now,
}: {
  report: FlowRunReport
  /** Every figure, for the picked stretch of time. Null before there is a line. */
  stats: WindowStats | null
  window: GraphWindow
  now: number
}) {
  const { head, spec } = report
  const scoped =
    stats !== null &&
    (window.sel !== null ||
      window.preset !== "all" ||
      window.from !== null ||
      window.to !== null)

  const openUsd = report.positions.reduce(
    (sum, position) => sum + (position.unrealisedUsd ?? 0),
    0
  )
  const banked = report.trades.reduce((sum, trade) => sum + trade.pnl, 0)
  const fees = report.trades.reduce((sum, trade) => sum + trade.feesUsd, 0)
  const problems = report.coins.filter((coin) => coin.problem).length
  const liquidated = stats?.liquidatedCount ?? 0

  return (
    <>
      {/* No wallet or venue up here: both are in the settings list at the
          foot of this panel, and saying them twice on one screen made the
          header read as a second, shorter answer to the same question. */}
      <WorkspacePanelHeader icon={<ActivityIcon />} title="Live run" />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 px-5 py-4">
          {/* Made or lost, and what of. The banked figure leads because it is
              the money that is actually in the wallet; what open positions are
              worth is on the tile below, where it can be read as the guess it
              is until they close. */}
          <div className="pb-2">
            <div className="mt-0.5 flex items-baseline gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xl font-semibold tracking-tight tabular-nums",
                  (stats ? stats.net : banked) >= 0
                    ? "bg-teal-600/10 text-teal-600 dark:bg-teal-400/10 dark:text-teal-400"
                    : "bg-red-600/10 text-red-600 dark:bg-red-400/10 dark:text-red-400"
                )}
              >
                {signedPct(stats ? stats.netPct : 0)}
              </span>
              <span
                className={cn(
                  "text-xl font-semibold tracking-tight tabular-nums",
                  toneClass(stats ? stats.net : banked)
                )}
              >
                {signedUsd(stats ? stats.net : banked)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {scoped
                ? "over the stretch picked on the line"
                : `out of the ${usd(head.capUsd)} this run was given`}
            </p>
          </div>

          <div className="-mx-5 grid grid-cols-2 border-t">
            <BacktestKpi
              label="Running for"
              value={
                head.status === "running"
                  ? runningFor(now - head.startedAt)
                  : "Stopped"
              }
              sub={
                head.status === "running"
                  ? head.paused
                    ? "paused — looking at nothing"
                    : `since ${formatDate(new Date(head.startedAt))}`
                  : (head.stoppedReason ??
                    `stopped ${formatDate(new Date(head.stoppedAt ?? head.startedAt))}`)
              }
            />
            <BacktestKpi
              label="Coins working"
              value={`${head.working}`}
              sub={`of ${head.coins} ${plural(head.coins, "coin", "coins")} watched`}
            />
            <BacktestKpi
              label="Open now"
              value={`${report.positions.length}`}
              sub={
                report.positions.length === 0
                  ? "nothing held"
                  : `${signedUsd(openUsd)} on paper`
              }
              tone={report.positions.length === 0 ? undefined : openUsd}
            />
            <BacktestKpi
              label="Waiting on you"
              value={`${problems}`}
              sub={
                problems === 0
                  ? "nothing needs fixing"
                  : (report.headline?.words ?? "see the coins")
              }
              tone={problems > 0 ? -1 : undefined}
            />
            <BacktestKpi
              label="Win rate"
              value={
                stats && stats.tradesClosed && stats.tradesWon !== null
                  ? sharePct(stats.tradesWon, stats.tradesClosed)
                  : "—"
              }
              sub={
                stats && stats.tradesClosed
                  ? `${stats.tradesWon ?? 0}W / ${stats.tradesClosed - (stats.tradesWon ?? 0)}L`
                  : "no finished trades yet"
              }
            />
            <BacktestKpi
              label="Trades closed"
              value={`${stats?.tradesClosed ?? report.trades.length}`}
              sub={
                report.notMine === 0
                  ? "this run's own"
                  : `${report.notMine} on this wallet were not this run's`
              }
            />
            <BacktestKpi
              label="Worst dip"
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
                  ? `low on ${formatDate(new Date(stats.worstDipAt))}`
                  : "back to the old high"
              }
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
              value={stats?.expectancy === null || !stats ? "—" : usd(stats.expectancy)}
              sub="the average trade"
              tone={stats?.expectancy ?? undefined}
            />
            <BacktestKpi
              label="Coins that made money"
              value={
                stats && stats.coinsGreen !== null && stats.coinsTraded !== null
                  ? `${stats.coinsGreen}/${stats.coinsTraded}`
                  : "—"
              }
              sub="of the ones it traded"
            />
            <BacktestKpi
              label="Fees paid"
              value={usd(fees)}
              sub="what the exchange charged"
            />
            {/* Only when it has happened. A permanent "0 liquidated" is a
                sentence about nothing that takes a whole tile to say. */}
            {liquidated > 0 ? (
              <BacktestKpi
                label="Liquidated"
                value={`${liquidated}`}
                sub={usd(Math.abs(stats?.liquidatedUsd ?? 0))}
                tone={-1}
              />
            ) : null}
            {liquidated > 0 ? <div className="border-b" /> : null}
          </div>

          {/* What it was set up to do, frozen when it was switched on. Editing
              the drawing since then has changed nothing here, which is the
              whole reason it is worth showing. */}
          <dl className="grid gap-1.5 pt-2 text-[11px]">
            <Line label="Wallet">
              {head.walletLabel} · {head.real ? "real money" : "practice"}
            </Line>
            <Line label="Venue">{head.venue}</Line>
            <Line label="Most it may spend">{usd(head.capUsd)}</Line>
            <Line label="Candles">{spec.strategy.interval}</Line>
            {spec.strategy.kind === "dca" ? (
              <>
                <Line label="Rungs">
                  {spec.strategy.params.rungs.length}
                </Line>
                <Line label="Most of the pot per coin">
                  {roundedPct(spec.strategy.params.maxPositionPct)}
                </Line>
                {spec.strategy.params.takeProfit ? (
                  <Line label="Gets out at">
                    {roundedPct(spec.strategy.params.takeProfit.pct)}
                  </Line>
                ) : null}
              </>
            ) : (
              <>
                <Line label="Indicators switched on">
                  {signalIndicatorsOn(spec.strategy.indicators)}
                </Line>
                <Line label="Each trade spends">
                  {roundedPct(spec.strategy.stakePct)} of the cap
                </Line>
              </>
            )}
          </dl>
        </div>
      </ScrollArea>
    </>
  )
}

/** "3d 4h" — how long it has been going, in the words a person would use. */
function runningFor(ms: number): string {
  return formatHeld(Math.max(0, ms))
}

function Line({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  )
}
