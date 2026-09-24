import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
  NetworkId,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/number"

export { num } from "@/lib/protocols/number"

/**
 * edgeX's candle names for the app's six timeframes. edgeX also serves 30
 * minutes, 2, 6, 8 and 12 hours, weeks and months, which the app does not
 * ask for. Measured 24 Sep 2026: every name below answered BTCUSDC bars.
 */
export const EDGEX_INTERVALS: Record<CandleInterval, string> = {
  "1m": "MINUTE_1",
  "5m": "MINUTE_5",
  "15m": "MINUTE_15",
  "1h": "HOUR_1",
  "4h": "HOUR_4",
  "1d": "DAY_1",
}

/**
 * The public quote socket the browser opens. Mainnet only: edgeX's practice
 * network redirects to a staff-only login (Tyler, 5 Sep 2026).
 *
 * The server reads its own copy from `TRADE_EDGEX_WS`, in `edgex/client.ts`.
 * The browser cannot read a server setting, so it always uses edgeX's
 * published host. The path says v1 on edgeX's v2 host; that is edgeX's own
 * address, and it answered every channel below on 24 Sep 2026.
 */
export function edgexPublicWsUrl(network: NetworkId): string {
  if (network !== "mainnet") throw new Error("EDGEX_NETWORK_UNSUPPORTED")
  return "wss://edgex-quote-prod-v2.edgex.exchange/api/v1/public/ws"
}

/**
 * The channel that carries every contract's figures, once a second.
 * Measured 24 Sep 2026: the first frame came 1.1 seconds after connecting,
 * held all 180 contracts, and one followed every second.
 */
export const EDGEX_ALL_TICKERS = "ticker.all.1s"

/** One open chart's working candle, priced on trades like the REST bars. */
export function edgexCandleChannel(
  interval: CandleInterval,
  contractId: string
): string {
  return `kline.LAST_PRICE.${contractId}.${EDGEX_INTERVALS[interval]}`
}

/**
 * **edgeX pings, the client pongs**, the opposite way round from Bybit and
 * OKX. The server sends `{"type":"ping","time":"…"}` and wants the same time
 * back in `{"type":"pong"}`. The first ping came 8.9 seconds after
 * connecting on 24 Sep 2026. A pong for anything else is null.
 */
export function edgexPong(frame: Record<string, unknown>): object | null {
  if (frame.type !== "ping") return null
  return { type: "pong", time: typeof frame.time === "string" ? frame.time : String(frame.time ?? Date.now()) }
}

/**
 * A market id is edgeX's contract name, `BTCUSDC`. What the screens print
 * is the name without the dollar coin, `BTC`, which is also the name the
 * borrowed history is looked up by.
 */
export function edgexBaseName(marketId: string): string {
  return marketId.replace(/USDC$/, "")
}

/**
 * One candle row as the chart's shape. REST and the socket send the same
 * record: `klineTime` in epoch milliseconds, prices and the coin volume
 * `size` as text.
 */
export function toEdgexBar(row: unknown): CandleBar | null {
  if (row === null || typeof row !== "object") return null
  const bar = row as Record<string, unknown>
  const openTime = num(bar.klineTime)
  const open = num(bar.open)
  const high = num(bar.high)
  const low = num(bar.low)
  const close = num(bar.close)
  if (
    openTime === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null
  ) {
    return null
  }
  return { openTime, open, high, low, close, volume: num(bar.size) ?? 0 }
}

/**
 * The hours between funding settlements, for turning edgeX's rate into the
 * hourly one the app shows. Every contract said 240 minutes on 24 Sep 2026.
 */
const DEFAULT_FUNDING_HOURS = 4

/**
 * One ticker row, from REST or `ticker.all.1s`, as the list's figures.
 *
 * Read off live frames on 24 Sep 2026:
 * - `markPrice` is the price (it equalled `oraclePrice` on every row);
 *   `lastPrice` stands in only when a row has no mark.
 * - `priceChangePercent` is a fraction: BTC's 0.001466 was $84,272.3 to
 *   $84,395.9, a 0.15% day.
 * - `value` is the day's dollars traded; `size` is coins.
 * - `openInterest` is in coins, so it is multiplied by the mark.
 * - `fundingRate` is per settlement, every four hours, so it is divided by
 *   the settlement's hours.
 * - `contractName` is the market id.
 */
export function toEdgexFigures(
  row: unknown,
  fundingHours = DEFAULT_FUNDING_HOURS
): { marketId: string; contractId: string; marketOpen: boolean; figures: LiveFigures } | null {
  if (row === null || typeof row !== "object") return null
  const one = row as Record<string, unknown>
  if (typeof one.contractName !== "string" || one.contractName === "") return null
  const price = num(one.markPrice) ?? num(one.lastPrice)
  if (price === null || !(price > 0)) return null
  const openInterestCoins = num(one.openInterest)
  const funding = num(one.fundingRate)
  return {
    marketId: one.contractName,
    contractId: typeof one.contractId === "string" ? one.contractId : String(one.contractId ?? ""),
    // Stock contracts carry `marketOpen: false` while their exchange is
    // shut. A row without the field is open.
    marketOpen: one.marketOpen !== false,
    figures: {
      price,
      change24h: num(one.priceChangePercent),
      volume24hUsd: num(one.value) ?? 0,
      fundingHourly: funding === null ? null : funding / fundingHours,
      openInterestUsd:
        openInterestCoins === null ? null : openInterestCoins * price,
    },
  }
}
