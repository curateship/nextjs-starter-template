import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import { getProtocol } from "@/server/protocols/registry"

/**
 * A market's ground rules — how fine its sizes go, and the most leverage it
 * allows — for the practice engine, which needs both before it can accept an
 * order.
 *
 * These come from the whole market catalogue, which is several calls to the
 * exchange. Placing an order must not pay that price, and the rules barely
 * change from hour to hour, so one catalogue per protocol and network is kept
 * for a few minutes and shared by everything that asks.
 *
 * The rules are read here rather than taken from the browser on purpose: the
 * leverage limit is what the liquidation price is built from, so a request
 * claiming its own limit could claim a position was safer than it is.
 */

const CACHE_MS = 5 * 60_000

export type MarketRules = {
  sizeDecimals: number | null
  minOrderSize?: number | null
  /** The market's smallest price step, or null where the exchange states none. */
  priceTick: number | null
  priceMultiplierUp?: number | null
  priceMultiplierDown?: number | null
  minOrderValueUsd?: number | null
  maxLeverage: number | null
  /** Dollars traded in the last day — what the DCA liquidity guard caps by. */
  volume24hUsd: number | null
}

type Entry = { at: number; rules: Map<string, MarketRules> }

const cache = new Map<string, Entry>()

/** Tests drive time themselves; a cache across them would leak between cases. */
export function clearMarketRulesCache(): void {
  cache.clear()
}

async function rulesFor(
  protocol: ProtocolId,
  network: NetworkId
): Promise<Map<string, MarketRules>> {
  const key = `${protocol}:${network}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rules

  const catalog = await getProtocol(protocol).markets.fetch(network)
  const rules = new Map<string, MarketRules>(
    catalog.rows.map((row) => [
      row.marketId,
      {
        sizeDecimals: row.sizeDecimals,
        minOrderSize: row.minOrderSize,
        priceTick: row.priceTick,
        priceMultiplierUp: row.priceMultiplierUp,
        priceMultiplierDown: row.priceMultiplierDown,
        minOrderValueUsd: row.minOrderValueUsd,
        maxLeverage: row.maxLeverage,
        volume24hUsd: row.volume24hUsd,
      },
    ])
  )
  cache.set(key, { at: Date.now(), rules })
  return rules
}

/**
 * The rules for one market, or null when the exchange does not list it — a
 * market that cannot be found is refused, never guessed at.
 */
export async function marketRules(
  protocol: ProtocolId,
  network: NetworkId,
  marketId: string
): Promise<MarketRules | null> {
  const rules = await rulesFor(protocol, network)
  return rules.get(marketId) ?? null
}

/**
 * What a replayed coin nobody lists is assumed to allow.
 *
 * **Most of a replay needs this.** A run over Binance history covers every coin
 * Binance has ever listed, and only a minority of them exist on Hyperliquid —
 * on a recent 473-coin run it was 178. Leaving the other 295 with no limit
 * leaves them with no liquidation price either, so a borrowed run reports the
 * upside of borrowing on every coin and the downside on barely a third. That is
 * worse than an assumption: it is an assumption of infinity, made silently.
 *
 * Three because it is both the commonest ceiling on Hyperliquid — 128 of its
 * 232 coins — and the harshest, since the maintenance margin is half the
 * initial margin at the ceiling. A 2x ladder is closed a third below its
 * average buy here, where a coin allowing 10x would give it 45%. The
 * pessimistic end of the real range is the right place to stand when the answer
 * is being used to decide whether to risk money.
 *
 * It only ever reaches a replay. A live wallet trades Hyperliquid, which always
 * states a real ceiling, so nothing that touches money is ever sized or closed
 * out against a guess.
 */
export const ASSUMED_REPLAY_MAX_LEVERAGE = 3

/**
 * The same rules, but with a leverage limit a replay can actually be closed
 * out by.
 *
 * **Why this exists.** A backtest replays Binance history, and Binance
 * deliberately reports no leverage limit — it is a per-account setting there
 * and asking needs a signed request, so `binance/markets.ts` returns null
 * rather than guessing. The engine reads that null as `1`, and `liquidationPx`
 * gives up on a limit of 1. The result is a replay in which **nothing can ever
 * be liquidated**: run a ladder at 2x and it reports every winner doubled and
 * not one of the positions the exchange would have taken away. That is not a
 * harsh result or a lenient one, it is a fictional one.
 *
 * The honest limit is the one that will actually apply, and the money is going
 * to Hyperliquid — so the coin's limit there is what a replay is closed out by,
 * even though the prices came from somewhere else. Most of its coins cap at 3x,
 * which is the difference between a 2x ladder being closed a third below its
 * average buy and never being closed at all.
 *
 * Left alone when the venue already answered: a Hyperliquid replay is already
 * running on its own numbers. A coin neither venue lists falls back to
 * `ASSUMED_REPLAY_MAX_LEVERAGE`, for the reason written there — most of a
 * Binance replay is those coins, and leaving them without a limit is not
 * caution, it is assuming they can never be closed out at all.
 */
export async function replayMarketRules(
  protocol: ProtocolId,
  network: NetworkId,
  marketId: string
): Promise<MarketRules | null> {
  const rules = await marketRules(protocol, network, marketId)
  if (!rules || rules.maxLeverage !== null) return rules
  const traded = await marketRules("hyperliquid", "mainnet", marketId)
  return {
    ...rules,
    maxLeverage: traded?.maxLeverage ?? ASSUMED_REPLAY_MAX_LEVERAGE,
  }
}
