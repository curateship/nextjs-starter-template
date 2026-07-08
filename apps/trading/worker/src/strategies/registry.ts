import type { Strategy } from "./contract"
import { copyStrategy } from "./copy"
import { dcaStrategy } from "./dca"
import { gridStrategy } from "./grid"
import { momentumStrategy } from "./momentum"
import { qqeStrategy } from "./qqe"
import { vwapStrategy } from "./vwap"

/**
 * Strategy registry keyed by strategyType. Shared by the live bot runner and
 * the backtest engine so both dispatch to the exact same strategy logic.
 */
export const strategies: Partial<Record<string, Strategy<never, unknown>>> = {
  grid: gridStrategy as unknown as Strategy<never, unknown>,
  dca: dcaStrategy as unknown as Strategy<never, unknown>,
  momentum: momentumStrategy as unknown as Strategy<never, unknown>,
  qqe: qqeStrategy as unknown as Strategy<never, unknown>,
  vwap: vwapStrategy as unknown as Strategy<never, unknown>,
  copy: copyStrategy as unknown as Strategy<never, unknown>,
}
