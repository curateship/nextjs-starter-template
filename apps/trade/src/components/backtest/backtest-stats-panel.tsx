import { FlaskConicalIcon } from "lucide-react"
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from "recharts"

import {
  BacktestKpi,
  heldFor,
  sharePct,
  signedPct,
} from "@/components/backtest/backtest-kpi"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { Badge } from "@/components/ui/badge"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { ScrollArea } from "@/components/ui/scroll-area"
import type {
  BacktestResult,
  BacktestSpecSnapshot,
  BacktestSummary,
} from "@/lib/trade/backtest/result"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { formatSignedUsd, formatUsd } from "@/lib/trade/format"

/**
 * The whole run in tiles, down the left: what it made, what it cost you on the
 * way, how many coins did the work — and the pot's own line underneath them.
 *
 * A grid of tiles rather than a column of sentences because these are the eight
 * numbers you check first and then stop reading. The line under them is the
 * same money over time, which is the one thing the tiles cannot say.
 */
const potConfig: ChartConfig = {
  usd: { label: "The pot", color: "var(--foreground)" },
}

/**
 * A figure a run is too old to carry: the engine was not measuring it when that
 * run finished, and results are never rewritten after the fact. Read through
 * these rather than off the row, so an older run shows a dash instead of taking
 * the page down with it.
 */
function figure(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function BacktestStatsPanel({
  summary,
  result,
  spec,
  coinsTotal,
  running,
}: {
  summary: BacktestSummary | null
  result: BacktestResult | null
  spec: BacktestSpecSnapshot
  coinsTotal: number
  /** The run has not finished, so these figures are still moving. */
  running: boolean
}) {
  return (
    <>
      <WorkspacePanelHeader
        icon={<FlaskConicalIcon />}
        title="Backtest · all coins"
        action={<Badge variant="secondary">Read-only</Badge>}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          {!summary ? (
            <p className="p-2 text-xs text-muted-foreground">
              {running
                ? "Still loading its candles — nothing is worked out yet."
                : "This run finished without a result."}
            </p>
          ) : (
            <>
              {/* The old app's eight, in its order and with its captions:
                  what it made, how often it won, how far it fell and what was
                  left in the pot at the bottom, how many coins were tested,
                  how many finished ahead, then the three about the money —
                  how hard the one shared pot was worked at its heaviest and
                  for how long, what it typically ran at, and what was still
                  open when the window closed. */}
              <div className="grid grid-cols-2 gap-2">
                <BacktestKpi
                  label="Net P&L"
                  value={signedPct(summary.madeOrLostPct)}
                  sub={formatSignedUsd(summary.madeOrLost)}
                  tone={summary.madeOrLost}
                />
                <BacktestKpi
                  label="Win rate"
                  value={sharePct(summary.tradesWon, summary.tradesClosed)}
                  sub={`${summary.tradesWon}W / ${summary.tradesClosed - summary.tradesWon}L`}
                />
                {/* How many trades there were at all. A win rate with no count
                    behind it is unreadable — 100% off two trades and 100% off
                    two hundred are not the same result, and only this tile
                    tells them apart. */}
                <BacktestKpi
                  label="Trades"
                  value={String(summary.trades)}
                  sub={
                    summary.trades === summary.tradesClosed
                      ? "all closed"
                      : `${summary.trades - summary.tradesClosed} still open`
                  }
                />
                <BacktestKpi
                  label="Buy & hold"
                  value={formatSignedUsd(summary.buyAndHold)}
                  sub="if you just held"
                  tone={summary.buyAndHold}
                />
                <BacktestKpi
                  label="Max drawdown"
                  value={
                    // Against the top it fell FROM, not what the run started
                    // with — see `worstDip`. Older runs did not record the top,
                    // and a wrong percent is worse than none.
                    figure(summary.worstDipPct) === null
                      ? "—"
                      : `-${summary.worstDipPct!.toFixed(2)}%`
                  }
                  sub={
                    figure(summary.worstDipPeakUsd) === null
                      ? `${formatUsd(summary.worstDipUsd)} off the top`
                      : `${formatUsd(summary.worstDipUsd)} off ${formatUsd(summary.worstDipPeakUsd!)}`
                  }
                  tone={summary.worstDipUsd > 0 ? -1 : undefined}
                />
                <BacktestKpi
                  label="Coins"
                  value={`${summary.coinsTested}/${coinsTotal}`}
                  sub="tested"
                />
                <BacktestKpi
                  label="Green"
                  value={`${summary.coinsThatMadeMoney}/${summary.coinsTested}`}
                  sub="net positive"
                />
                <BacktestKpi
                  label="Peak wallet"
                  value={
                    summary.startingUsd > 0
                      ? `${Math.round((summary.peakInPlayUsd / summary.startingUsd) * 100)}%`
                      : "—"
                  }
                  sub={peakSub(summary)}
                />
                <BacktestKpi
                  label="Avg wallet"
                  value={
                    summary.startingUsd > 0
                      ? `${Math.round((summary.typicalInPlayUsd / summary.startingUsd) * 100)}%`
                      : "—"
                  }
                  sub="typically in use"
                />
                <BacktestKpi
                  label="In coins"
                  value={formatUsd(summary.openAtEndUsd)}
                  sub={
                    (figure(summary.coinsOpenAtEnd) ?? 0) > 0
                      ? `${summary.coinsOpenAtEnd} ${summary.coinsOpenAtEnd === 1 ? "coin" : "coins"} open`
                      : "everything closed"
                  }
                />
              </div>

              {result && result.equity.length > 1 ? (
                <section className="grid gap-1 rounded-lg border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-xs font-semibold">The pot</h3>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDate(new Date(spec.from))} –{" "}
                      {formatDate(new Date(spec.to))}
                    </span>
                  </div>
                  <div className="h-28 w-full min-w-0">
                    <ChartContainer config={potConfig} className="h-full w-full">
                      <AreaChart
                        data={result.equity.map((point) => ({
                          label: formatDate(new Date(point.t)),
                          usd: Math.round(point.usd),
                        }))}
                        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                      >
                        {/* Hidden, and only here so the tooltip has a date to
                            show. Without an axis naming the category, the
                            chart hands the tooltip a row NUMBER, which falls
                            back to the series name — so pointing at the line
                            read "The pot / The pot 11,676" and the one thing
                            it could not tell you was when. */}
                        <XAxis dataKey="label" hide />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 9 }}
                          width={52}
                          domain={["auto", "auto"]}
                        />
                        {/* What it started with, so the line above or below it
                            is the whole answer at a glance. */}
                        <ReferenceLine
                          y={spec.startingUsd}
                          stroke="currentColor"
                          strokeDasharray="4 4"
                          className="text-muted-foreground"
                        />
                        {/* Just the money, in the colour of what it means.
                            The row used to read "The pot  11,676" — the
                            series name repeated from the heading directly
                            above it, and a swatch for a chart with one line.
                            Neither said anything. What it is worth, and
                            whether that is above or below what you started
                            with, is the whole question. */}
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              // Fixed, and narrow. The shared tooltip reserves
                              // 8rem for charts with several series and a
                              // swatch each; this one has a date and one
                              // number, so that floor left half the box empty.
                              // A fixed width also stops it resizing as the
                              // number under the pointer changes length.
                              // Overridden here rather than in `ui/chart.tsx`,
                              // which belongs to the shell — editing that would
                              // fork a file every app shares.
                              className="w-28 gap-0.5"
                              hideIndicator
                              formatter={(value) => {
                                const usd = Number(value)
                                const up = usd >= spec.startingUsd
                                return (
                                  <span
                                    className={
                                      up
                                        ? "font-medium text-teal-600 dark:text-teal-400"
                                        : "font-medium text-red-600 dark:text-red-400"
                                    }
                                  >
                                    {formatUsd(usd)}
                                  </span>
                                )
                              }}
                            />
                          }
                        />
                        <Area
                          dataKey="usd"
                          type="natural"
                          isAnimationActive={false}
                          stroke="var(--color-usd)"
                          strokeWidth={1.5}
                          fill="var(--color-usd)"
                          fillOpacity={0.08}
                        />
                      </AreaChart>
                    </ChartContainer>
                  </div>
                </section>
              ) : null}

              <dl className="grid gap-1 border-t pt-3 text-[11px]">
                <Line label="Window" value={`${spec.days} ${plural(spec.days, "day", "days")} of ${spec.interval}`} />
                <Line label="Rungs" value={String(spec.params.rungs.length)} />
                <Line
                  label="Most of the pot, per coin"
                  value={`${spec.params.maxPositionPct}%`}
                />
                <Line label="Size ramp" value={`${spec.params.sizeMultiplier}×`} />
                <Line
                  label="Costs"
                  value={`${spec.takerFeePct}% / ${spec.makerFeePct}% / ${spec.slippagePct}%`}
                />
                <Line
                  label="Funding paid"
                  value={
                    figure(summary.fundingPaid) === null
                      ? "—"
                      : summary.fundingPaid >= 0
                        ? formatUsd(summary.fundingPaid)
                        : `-${formatUsd(Math.abs(summary.fundingPaid))}`
                  }
                />
              </dl>

              {summary.warnings.length > 0 ? (
                <div className="grid gap-1.5 border-t pt-3">
                  <p className="text-xs font-semibold">
                    Read this before you believe the top number
                  </p>
                  <ul className="grid list-disc gap-1.5 pl-4 text-[11px] leading-4 text-muted-foreground">
                    {summary.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      </ScrollArea>
    </>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="min-w-0 flex-1 text-muted-foreground">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * "Jun 6 2026 · held 12h" — WHEN the pot was working hardest beside how long it
 * stayed there. The date is what makes the number checkable: it names the crash
 * the wallet was answering.
 */
function peakSub(summary: BacktestSummary): string {
  const at = figure(summary.peakInPlayAt)
  const held = figure(summary.peakInPlayHeldMs)
  if (at === null) return held === null ? "" : heldFor(held)
  const day = formatDate(new Date(at))
  return held === null ? day : `${day} · ${heldFor(held)}`
}
