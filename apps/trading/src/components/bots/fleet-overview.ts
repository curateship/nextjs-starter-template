import type { BotListItem } from "@/lib/api/bots"

export type ExposureBotRef = { id: string; name: string }

export type CoinExposure = {
  coin: string
  /** Entry-price notionals (|szi| × entryPx); marks aren't loaded on this page. */
  longNotional: number
  shortNotional: number
  netNotional: number
  longBots: ExposureBotRef[]
  shortBots: ExposureBotRef[]
}

export type FleetPileup = {
  coin: string
  direction: "long" | "short"
  bots: ExposureBotRef[]
}

export type FleetSummary = {
  mode: "paper" | "live"
  totalBots: number
  runningBots: number
  pausedBots: number
  pnlToday: number
  pnlTotal: number
  openPositions: number
  /** Sorted by gross (long + short) notional, largest first. */
  exposures: CoinExposure[]
  pileups: FleetPileup[]
}

/** Stable identity for a pile-up, shared by the strip and the table filter. */
export function pileupKey(mode: FleetSummary["mode"], pileup: FleetPileup) {
  return `${mode}:${pileup.coin}:${pileup.direction}`
}

/**
 * One summary per mode present in the fleet, live first. Paper and live are
 * never blended into one number.
 */
export function buildFleetSummaries(bots: BotListItem[]): FleetSummary[] {
  const modes: FleetSummary["mode"][] = ["live", "paper"]
  const summaries: FleetSummary[] = []
  for (const mode of modes) {
    const group = bots.filter((bot) => bot.mode === mode)
    if (group.length > 0) summaries.push(summarizeMode(mode, group))
  }
  return summaries
}

function summarizeMode(
  mode: FleetSummary["mode"],
  bots: BotListItem[]
): FleetSummary {
  const byCoin = new Map<string, CoinExposure>()
  let openPositions = 0

  for (const bot of bots) {
    for (const position of bot.positions) {
      if (position.szi === 0) continue
      openPositions += 1
      const exposure = byCoin.get(position.market) ?? {
        coin: position.market,
        longNotional: 0,
        shortNotional: 0,
        netNotional: 0,
        longBots: [],
        shortBots: [],
      }
      const notional = Math.abs(position.szi) * position.entry_px
      if (position.szi > 0) {
        exposure.longNotional += notional
        exposure.longBots.push({ id: bot.id, name: bot.name })
      } else {
        exposure.shortNotional += notional
        exposure.shortBots.push({ id: bot.id, name: bot.name })
      }
      exposure.netNotional = exposure.longNotional - exposure.shortNotional
      byCoin.set(position.market, exposure)
    }
  }

  const exposures = [...byCoin.values()].sort(
    (a, b) =>
      b.longNotional + b.shortNotional - (a.longNotional + a.shortNotional)
  )

  const pileups: FleetPileup[] = []
  for (const exposure of exposures) {
    if (exposure.longBots.length >= 2) {
      pileups.push({
        coin: exposure.coin,
        direction: "long",
        bots: exposure.longBots,
      })
    }
    if (exposure.shortBots.length >= 2) {
      pileups.push({
        coin: exposure.coin,
        direction: "short",
        bots: exposure.shortBots,
      })
    }
  }

  return {
    mode,
    totalBots: bots.length,
    runningBots: bots.filter(
      (bot) => bot.status === "running" || bot.status === "starting"
    ).length,
    pausedBots: bots.filter((bot) => bot.status === "paused").length,
    pnlToday: bots.reduce((sum, bot) => sum + bot.daily_realized_pnl, 0),
    pnlTotal: bots.reduce((sum, bot) => sum + bot.realized_pnl, 0),
    openPositions,
    exposures,
    pileups,
  }
}
