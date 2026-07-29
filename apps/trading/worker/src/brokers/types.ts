import type { DesiredOrder, StrategyOrderStatus } from "../strategies/contract"
import type { PaperSnapshot } from "./paper"

export type Placement =
  | { kind: "resting"; oid: number | null; remainingSz: string }
  | { kind: "filled"; oid: number | null; remainingSz: string }
  | { kind: "rejected"; reason: string }

export type BrokerOrderUpdate = {
  cloid: string
  oid: number | null
  remainingSz: string
  status: StrategyOrderStatus
}

/**
 * What a BotRunner needs from an execution venue. PaperBroker simulates it
 * from market data; LiveBroker signs real Hyperliquid actions.
 */
export interface BotBroker {
  start(): void | Promise<void>
  stop(): void
  place(cloid: string, order: DesiredOrder): Placement | Promise<Placement>
  cancel(cloid: string): boolean | Promise<boolean>
  /** Close the whole position at market (reduce-only). */
  flatten(purpose?: string): unknown | Promise<unknown>
  positionState(): { szi: string; entryPx: string } | null
  equity(mid: number): number
  openOrderCount(): number
  /**
   * Paper only: durable account snapshot persisted to bot_state. Live
   * brokers have none — their position persists via positionState()
   * through livePositionSnapshot().
   */
  snapshot?(): PaperSnapshot
  /** Live only: converge local order/fill state with the exchange. */
  reconcile?(): Promise<void>
  /** Live restart safety: cancel this bot's stale orders on its market. */
  cancelOwnedOrders?(): Promise<void>
}

/**
 * Normalizes positionState() into the durable shape bot_state stores (the
 * same shape PaperSnapshot.position uses), so live bots persist what they
 * hold. Flat or unreadable positions store null — never a stale holding.
 */
export function livePositionSnapshot(
  state: { szi: string; entryPx: string } | null
): { szi: number; entryPx: number } | null {
  if (!state) return null
  const szi = Number(state.szi)
  if (!Number.isFinite(szi) || szi === 0) return null
  const entryPx = Number(state.entryPx)
  return { szi, entryPx: Number.isFinite(entryPx) ? entryPx : 0 }
}
