import * as React from "react"
import { TriangleAlertIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { pileupKey, type CoinExposure, type FleetSummary } from "./fleet-overview"

export type FleetFilter = { key: string; label: string; botIds: string[] }

const EXPOSURE_CHIP_LIMIT = 6

function money(value: number, { signed = false } = {}) {
  const rounded = Math.round(Math.abs(value))
  const sign = value < 0 ? "-" : signed ? "+" : ""
  return `${sign}$${rounded.toLocaleString("en-US")}`
}

function pnlText(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`
}

function pnlTone(value: number) {
  return value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : undefined
}

/**
 * Fleet-level summary above the bots table: per-mode combined P&L, open
 * exposure per coin, and same-direction pile-up warnings that filter the
 * table to the bots involved. Paper and live are never blended.
 */
export function FleetOverviewStrip({
  summaries,
  filter,
  onFilterChange,
}: {
  summaries: FleetSummary[]
  filter: FleetFilter | null
  onFilterChange: (filter: FleetFilter | null) => void
}) {
  return (
    <div className="grid gap-2 md:gap-3">
      {summaries.map((summary) => (
        <section
          key={summary.mode}
          className="rounded-xl border border-foreground/5 bg-card p-3"
        >
          <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
            <Badge variant={summary.mode === "live" ? "default" : "secondary"}>
              {summary.mode}
            </Badge>
            <Stat label="Bots">
              {summary.runningBots} running · {summary.pausedBots} paused ·{" "}
              {summary.totalBots} total
            </Stat>
            <Stat label="P&L today" className={pnlTone(summary.pnlToday)}>
              {pnlText(summary.pnlToday)}
            </Stat>
            <Stat label="P&L total" className={pnlTone(summary.pnlTotal)}>
              {pnlText(summary.pnlTotal)}
            </Stat>
            <Stat label="Open positions">{summary.openPositions}</Stat>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {summary.exposures.length > 0 ? (
              <>
                <span
                  className="text-xs text-muted-foreground"
                  title="Position size × entry price. Mark-price moves are not reflected here."
                >
                  Exposure (at entry):
                </span>
                {summary.exposures
                  .slice(0, EXPOSURE_CHIP_LIMIT)
                  .map((exposure) => (
                    <ExposureChip key={exposure.coin} exposure={exposure} />
                  ))}
                {summary.exposures.length > EXPOSURE_CHIP_LIMIT ? (
                  <span className="text-xs text-muted-foreground">
                    +{summary.exposures.length - EXPOSURE_CHIP_LIMIT} more
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {summary.mode === "live"
                  ? "Live bot positions aren't tracked on this page yet."
                  : "No open positions."}
              </span>
            )}
          </div>

          {summary.pileups.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {summary.pileups.map((pileup) => {
                const key = pileupKey(summary.mode, pileup)
                const active = filter?.key === key
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    title={pileup.bots.map((bot) => bot.name).join(", ")}
                    onClick={() =>
                      onFilterChange(
                        active
                          ? null
                          : {
                              key,
                              label: `${pileup.bots.length} bots ${pileup.direction} ${pileup.coin}`,
                              botIds: pileup.bots.map((bot) => bot.id),
                            }
                      )
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
                      active
                        ? "border-amber-500/60 bg-amber-500/20 text-amber-700 dark:text-amber-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
                    )}
                  >
                    <TriangleAlertIcon className="size-3" />
                    {pileup.bots.length} bots {pileup.direction} {pileup.coin}
                  </button>
                )
              })}
              {filter?.key.startsWith(`${summary.mode}:`) ? (
                <button
                  type="button"
                  onClick={() => onFilterChange(null)}
                  className="inline-flex items-center gap-1 rounded-md border border-foreground/10 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                >
                  <XIcon className="size-3" />
                  Showing only: {filter.label} — clear
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  )
}

function Stat({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-sm tabular-nums", className)}>
        {children}
      </div>
    </div>
  )
}

function ExposureChip({ exposure }: { exposure: CoinExposure }) {
  const tooltip = [
    exposure.longNotional > 0
      ? `Long ${money(exposure.longNotional)} (${exposure.longBots
          .map((bot) => bot.name)
          .join(", ")})`
      : null,
    exposure.shortNotional > 0
      ? `Short ${money(exposure.shortNotional)} (${exposure.shortBots
          .map((bot) => bot.name)
          .join(", ")})`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <Badge
      variant="secondary"
      className="font-mono tabular-nums"
      title={tooltip}
    >
      {exposure.coin}
      <span className={cn("ml-1", pnlTone(exposure.netNotional))}>
        {money(exposure.netNotional, { signed: true })}
      </span>
    </Badge>
  )
}
