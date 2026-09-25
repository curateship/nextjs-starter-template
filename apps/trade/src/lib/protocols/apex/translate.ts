import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
  NetworkId,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/number"

export { num } from "@/lib/protocols/number"

/**
 * ApeX Omni's candle interval names. All six app timeframes exist; ApeX also
 * serves 30, 120, 360 and 720 minutes and weeks, which the app does not ask
 * for. Measured 24 Sep 2026: every name below answered BTCUSDT bars.
 */
export const APEX_INTERVALS: Record<CandleInterval, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "4h": "240",
  "1d": "D",
}

/**
 * The public quote socket the browser opens. Mainnet only, like the REST
 * side: ApeX's testnet is not carried (Tyler, 5 Sep 2026).
 *
 * The server reads its own copy from `TRADE_APEX_WS`, in `apex/client.ts`.
 * The browser cannot read a server setting, so it always uses ApeX's
 * published host.
 */
export function apexPublicWsUrl(network: NetworkId): string {
  if (network !== "mainnet") throw new Error("APEX_NETWORK_UNSUPPORTED")
  return "wss://quote.omni.apex.exchange/realtime_public?v=2"
}

/**
 * ApeX pings every open socket, and the connector answers each with a pong.
 * Its docs ask for a client ping every 15 seconds as well, which is what the
 * app sends. Measured 24 Sep 2026: ApeX's own ping arrived 7 seconds after
 * connecting, and a client ping was answered with `ret_msg: "pong"`.
 */
export const APEX_PING_EVERY_MS = 15_000

/** The topic that carries every market's figures in one push. */
export const APEX_ALL_MARKETS_TOPIC = "instrumentInfo.all"

/**
 * Whether a pushed market id has the shape of a perpetual or stock contract.
 *
 * The all-markets topic also carries ApeX's yes/no prediction markets. The
 * server drops them by keeping only what the catalogue lists. The browser
 * has no catalogue in hand, so it drops them by shape: all 184 prediction
 * ids on 24 Sep 2026 were written like `Heat_Win_Against_Celtics_Dec19USDT`,
 * and not one matched the capitals-and-digits shape every contract has.
 */
export function looksLikeApexContract(marketId: string): boolean {
  return /^[A-Z0-9]+USDT$/.test(marketId)
}

export function apexCandleTopic(
  interval: CandleInterval,
  marketId: string
): string {
  return `candle.${APEX_INTERVALS[interval]}.${marketId}`
}

/**
 * One candle row as the chart's shape.
 *
 * REST answers `{s, i, t, o, h, l, c, v, tr}` with `t` in epoch
 * milliseconds; the socket answers `{start, open, high, low, close, volume}`.
 * `v` and `volume` are the coin volume, which is what every other venue here
 * keeps.
 */
export function toApexBar(row: unknown): CandleBar | null {
  if (row === null || typeof row !== "object") return null
  const bar = row as Record<string, unknown>
  const openTime = num(bar.t ?? bar.start)
  const open = num(bar.o ?? bar.open)
  const high = num(bar.h ?? bar.high)
  const low = num(bar.l ?? bar.low)
  const close = num(bar.c ?? bar.close)
  if (
    openTime === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null
  ) {
    return null
  }
  return {
    openTime,
    open,
    high,
    low,
    close,
    volume: num(bar.v ?? bar.volume) ?? 0,
  }
}

/**
 * One market's row from `instrumentInfo.all`, translated.
 *
 * Keys, read off live frames on 24 Sep 2026: `s` the market, `mp` the mark,
 * `p` the last trade, `xp` the index, `pr` the day's move as a fraction
 * (ONDO's 0.237 matched its low of $0.4043 and last of $0.5103), `to` the
 * day's dollar turnover, `v` its coin volume, `fr` the funding rate and `o`
 * the open interest in coins. `ss` is a status flag ApeX does not document;
 * it is not a prediction-market marker (the KORU perpetual carried "1" and
 * 29 prediction markets carried "0"), so nothing here reads it.
 *
 * `fr` is already the hourly figure: ApeX settles funding every hour, per
 * its docs, and its funding history rows sat exactly an hour apart.
 */
export function toApexFigures(row: unknown): {
  marketId: string
  figures: LiveFigures
} | null {
  if (row === null || typeof row !== "object") return null
  const one = row as Record<string, unknown>
  if (typeof one.s !== "string" || one.s === "") return null
  const price = num(one.mp) ?? num(one.p)
  if (price === null || !(price > 0)) return null
  const openInterestCoins = num(one.o)
  return {
    marketId: one.s,
    figures: {
      price,
      change24h: num(one.pr),
      volume24hUsd: num(one.to) ?? 0,
      fundingHourly: num(one.fr),
      openInterestUsd:
        openInterestCoins === null ? null : openInterestCoins * price,
    },
  }
}
