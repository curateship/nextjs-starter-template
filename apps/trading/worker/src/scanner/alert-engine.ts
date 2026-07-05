// Pure alert rules over the rolling trade window. No I/O — the collector
// feeds it trades and persists the drafts it returns.

import { formatUsd } from "./format"

export type ScannerTradeEvent = {
  tid: number
  /** Trade timestamp in ms. */
  ts: number
  coin: string
  /** Taker side: "buy" means the aggressor bought. */
  side: "buy" | "sell"
  px: number
  sz: number
  notional: number
  buyer: string
  seller: string
}

export type AlertDraft = {
  type: string
  coin?: string
  address?: string
  title: string
  body?: string
  data?: unknown
  dedupeKey: string
}

export type TradeAlertOptions = {
  /** Single-trade alert threshold, default $250k. */
  bigTradeNotional: number
  /** Same wallet, same coin+side trades to trigger, default 3. */
  repeatCount: number
  repeatWindowMs: number
  /** Distinct wallets trading same coin+side to trigger, default 3. */
  coordinatedWallets: number
  coordinatedMinNotional: number
  coordinatedWindowMs: number
  /** Addresses (lowercase) excluded from alerts, e.g. market makers. */
  ignoredAddresses: Set<string>
}

export const DEFAULT_TRADE_ALERT_OPTIONS: Omit<
  TradeAlertOptions,
  "ignoredAddresses"
> = {
  bigTradeNotional: 250_000,
  repeatCount: 3,
  repeatWindowMs: 10 * 60_000,
  coordinatedWallets: 3,
  coordinatedMinNotional: 100_000,
  coordinatedWindowMs: 15 * 60_000,
}

/** The wallet expressing intent on a trade: the aggressor. */
export function takerOf(trade: ScannerTradeEvent): string {
  return trade.side === "buy" ? trade.buyer : trade.seller
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/**
 * Evaluates trade alert rules for a batch of new trades against the rolling
 * window (which already contains the new trades, sorted by ts ascending).
 * Dedupe keys make re-evaluation safe: the DB unique index drops repeats.
 */
export function evaluateTradeAlerts(
  windowTrades: ScannerTradeEvent[],
  newTrades: ScannerTradeEvent[],
  opts: TradeAlertOptions
): AlertDraft[] {
  const drafts = new Map<string, AlertDraft>()

  for (const trade of newTrades) {
    const taker = takerOf(trade).toLowerCase()
    if (opts.ignoredAddresses.has(taker)) continue
    const verb = trade.side === "buy" ? "bought" : "sold"

    if (trade.notional >= opts.bigTradeNotional) {
      const key = `whale_trade:${trade.tid}`
      drafts.set(key, {
        type: "whale_trade",
        coin: trade.coin,
        address: taker,
        title: `Whale ${verb} ${formatUsd(trade.notional)} of ${trade.coin}`,
        body: `${shortAddress(taker)} ${verb} ${trade.sz} ${trade.coin} at ${trade.px}`,
        data: { tid: trade.tid, notional: trade.notional, px: trade.px },
        dedupeKey: key,
      })
    }

    const repeats = windowTrades.filter(
      (candidate) =>
        candidate.coin === trade.coin &&
        candidate.side === trade.side &&
        takerOf(candidate).toLowerCase() === taker &&
        candidate.ts > trade.ts - opts.repeatWindowMs &&
        candidate.ts <= trade.ts
    )
    if (repeats.length >= opts.repeatCount) {
      const bucket = Math.floor(trade.ts / opts.repeatWindowMs)
      const key = `repeat:${taker}:${trade.coin}:${trade.side}:${bucket}`
      const total = repeats.reduce((sum, r) => sum + r.notional, 0)
      drafts.set(key, {
        type: "repeat_trades",
        coin: trade.coin,
        address: taker,
        title: `${shortAddress(taker)} ${verb} ${trade.coin} ${repeats.length}x in 10 min (${formatUsd(total)})`,
        data: { count: repeats.length, totalNotional: total },
        dedupeKey: key,
      })
    }

    const coordinated = new Map<string, number>()
    for (const candidate of windowTrades) {
      if (
        candidate.coin !== trade.coin ||
        candidate.side !== trade.side ||
        candidate.notional < opts.coordinatedMinNotional ||
        candidate.ts <= trade.ts - opts.coordinatedWindowMs ||
        candidate.ts > trade.ts
      ) {
        continue
      }
      const candidateTaker = takerOf(candidate).toLowerCase()
      if (opts.ignoredAddresses.has(candidateTaker)) continue
      coordinated.set(
        candidateTaker,
        (coordinated.get(candidateTaker) ?? 0) + candidate.notional
      )
    }
    if (coordinated.size >= opts.coordinatedWallets) {
      const bucket = Math.floor(trade.ts / opts.coordinatedWindowMs)
      const key = `coordinated:${trade.coin}:${trade.side}:${bucket}`
      const total = [...coordinated.values()].reduce((sum, n) => sum + n, 0)
      drafts.set(key, {
        type: "coordinated_trades",
        coin: trade.coin,
        title: `${coordinated.size} whales ${verb} ${trade.coin} in 15 min (${formatUsd(total)})`,
        data: {
          wallets: [...coordinated.keys()],
          totalNotional: total,
        },
        dedupeKey: key,
      })
    }
  }

  return [...drafts.values()]
}
