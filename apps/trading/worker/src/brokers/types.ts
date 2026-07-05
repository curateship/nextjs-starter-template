import type { DesiredOrder } from "../strategies/contract"
import type { PaperSnapshot } from "./paper"

export type Placement =
  | { kind: "resting" }
  | { kind: "filled" }
  | { kind: "rejected"; reason: string }

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
  /** Paper only: durable snapshot persisted to bot_state. */
  snapshot?(): PaperSnapshot
  /** Live only: converge local order/fill state with the exchange. */
  reconcile?(): Promise<void>
}
