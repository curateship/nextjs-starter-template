import type { ChartPriceLine } from "@/components/chart/price-chart"
import { dcaAllocationPcts, dcaLevels } from "@/lib/automations/dca"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"

const RUNG_COLOR = "#f59e0b"

function fmtUsd(amount: number): string {
  const rounded =
    amount >= 100 ? Math.round(amount) : Number(amount.toFixed(2))
  return `$${rounded.toLocaleString("en-US")}`
}

function fmtPct(pct: number): string {
  return `${Number(pct.toFixed(1)).toLocaleString("en-US")}% of equity`
}

function rungLine(
  rungNumber: number,
  price: number,
  amountLabel: string | null
): ChartPriceLine {
  return {
    id: `bot:rung:${rungNumber}`,
    price,
    color: RUNG_COLOR,
    title: amountLabel
      ? `Waiting for rung ${rungNumber} · ${amountLabel}`
      : `Waiting for rung ${rungNumber}`,
    lineStyle: "dashed",
    lineWidth: 1,
  }
}

/**
 * The DCA ladder's pending buys as yellow chart lines, labeled with the
 * DOLLARS each rung will buy (the line's height already shows the price).
 * An armed cycle knows its exact budgets — allocationPct of the equity
 * frozen when the ladder armed; a confirmed base that hasn't armed yet
 * previews the ladder from the config, with amounts estimated ("~") from
 * the caller's equity figure when one is available, else the rung's percent
 * share. The worker's state arrives as a JSON blob from the DB, so every
 * read is defensive — a bad shape draws nothing.
 */
export function buildBotRungLines(
  strategyState: unknown,
  dca: AutomationConfig["dca"] | null | undefined,
  equityEstimate: number | null = null
): ChartPriceLine[] {
  if (!dca || !strategyState || typeof strategyState !== "object") return []
  const state = strategyState as {
    candidateBase?: unknown
    active?: { rungs?: unknown; frozenEquity?: unknown } | null
  }

  const rungs = state.active?.rungs
  if (Array.isArray(rungs)) {
    const frozenEquity = Number(state.active?.frozenEquity)
    const lines: ChartPriceLine[] = []
    for (const raw of rungs) {
      const rung = raw as {
        index?: unknown
        plannedPx?: unknown
        allocationPct?: unknown
        entryComplete?: unknown
      } | null
      const price = Number(rung?.plannedPx)
      if (!(price > 0) || rung?.entryComplete === true) continue
      const index = Number(rung?.index)
      const allocationPct = Number(rung?.allocationPct)
      const amount =
        allocationPct > 0 && frozenEquity > 0
          ? fmtUsd((frozenEquity * allocationPct) / 100)
          : allocationPct > 0
            ? fmtPct(allocationPct)
            : null
      lines.push(
        rungLine(
          Number.isFinite(index) ? index + 1 : lines.length + 1,
          price,
          amount
        )
      )
    }
    return lines
  }

  const base = Number(state.candidateBase)
  if (base > 0) {
    const pcts = dcaAllocationPcts(
      dca.rungs.length,
      dca.maxPositionPct,
      dca.sizeMultiplier
    )
    return dcaLevels(base, dca.rungs).map((price, index) => {
      const pct = pcts[index] ?? 0
      const amount =
        equityEstimate != null && equityEstimate > 0 && pct > 0
          ? `~${fmtUsd((equityEstimate * pct) / 100)}`
          : pct > 0
            ? fmtPct(pct)
            : null
      return rungLine(index + 1, price, amount)
    })
  }
  return []
}
