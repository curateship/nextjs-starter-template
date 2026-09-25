import { z } from "zod"

import type {
  NetworkId,
  WalletAccountFigures,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { coinNameFor } from "@/lib/protocols/binance/translate"
import { num } from "@/lib/protocols/number"
import { rememberPromise } from "@/lib/protocols/promise-cache"
import {
  binanceSigned,
  parseBinanceCredential,
  type BinancePriority,
} from "@/server/protocols/binance/client"

const decimal = z.union([z.string(), z.number()])

const accountSchema = z.object({
  totalMarginBalance: decimal,
  totalUnrealizedProfit: decimal,
  availableBalance: decimal,
  positions: z
    .array(
      z.object({
        symbol: z.string(),
        positionSide: z.string(),
        initialMargin: decimal,
      })
    )
    .default([]),
})

const positionSchema = z.object({
  symbol: z.string(),
  positionAmt: decimal,
  entryPrice: decimal,
  leverage: decimal,
  marginType: z.string(),
  positionSide: z.string(),
  isolatedMargin: decimal,
  liquidationPrice: decimal.optional(),
  unRealizedProfit: decimal,
})

type Snapshot = { figures: WalletAccountFigures; portfolio: WalletPortfolio }

/**
 * The account is held this long. The engine and the wallet card poll every
 * few seconds, and the pair of reads costs 10 request units, so four reads a
 * minute keep it current without spending the allowance. Every order clears
 * it (`clearBinanceAccountReads`), so a change shows on the next read.
 */
const ACCOUNT_GOOD_FOR_MS = 15_000
const cache = new Map<
  string,
  { at: number; answer: Promise<Snapshot> }
>()

export const BINANCE_ONE_WAY_REQUIRED =
  "This Binance account holds longs and shorts in the same coin separately (Hedge Mode). Trade works with one direction at a time. Change Position Mode to One-way Mode in Binance's futures preferences, then try again."

function required(value: unknown): number {
  const parsed = num(value)
  if (parsed === null) throw new Error("BINANCE_ACCOUNT_UNREADABLE")
  return parsed
}

function assertOneWay(side: string): void {
  if (side === "BOTH") return
  if (side === "LONG" || side === "SHORT") {
    throw new Error(`WALLET_POSITION_MODE:${BINANCE_ONE_WAY_REQUIRED}`)
  }
  throw new Error("BINANCE_ACCOUNT_UNREADABLE")
}

/** The stored credential, opened for one call. */
export function binanceCredentialOf(credential: () => string | null) {
  return parseBinanceCredential(credential())
}

/**
 * Whether the account is in One-way or Hedge Mode. Read, never assumed, and
 * saved on the wallet when it is added so the account card can show it.
 */
export async function fetchBinancePositionMode(
  network: NetworkId,
  credential: () => string | null
): Promise<"one-way" | "two-sided"> {
  const answer = await binanceSigned(
    network,
    binanceCredentialOf(credential),
    "GET",
    "/fapi/v1/positionSide/dual"
  )
  const mode = z.object({ dualSidePosition: z.boolean() }).safeParse(answer)
  if (!mode.success) throw new Error("BINANCE_ACCOUNT_UNREADABLE")
  return mode.data.dualSidePosition ? "two-sided" : "one-way"
}

/** Binance's two account answers, in the app's shapes. Exported for tests. */
export function toBinanceAccountSnapshot(input: {
  account: unknown
  positions: unknown
}): Snapshot {
  const account = accountSchema.safeParse(input.account)
  const rows = z.array(z.unknown()).safeParse(input.positions)
  if (!account.success || !rows.success) {
    throw new Error("BINANCE_ACCOUNT_UNREADABLE")
  }
  const crossMargins = new Map(
    account.data.positions.map((row) => [row.symbol, row.initialMargin])
  )
  const positions: WalletPosition[] = []
  for (const raw of rows.data) {
    const parsed = positionSchema.safeParse(raw)
    if (!parsed.success) throw new Error("BINANCE_ACCOUNT_UNREADABLE")
    const row = parsed.data
    assertOneWay(row.positionSide)
    const szi = required(row.positionAmt)
    if (szi === 0) continue
    const marketId = coinNameFor(row.symbol)
    if (marketId === null) throw new Error("BINANCE_ACCOUNT_UNREADABLE")
    const isolated = row.marginType.toLowerCase() === "isolated"
    const margin = isolated ? row.isolatedMargin : crossMargins.get(row.symbol)
    if (margin === undefined) throw new Error("BINANCE_ACCOUNT_UNREADABLE")
    const liquidation = num(row.liquidationPrice)
    positions.push({
      marketId,
      szi,
      entryPx: required(row.entryPrice),
      leverage: required(row.leverage),
      marginUsed: required(margin),
      marginMode: isolated ? "isolated" : "cross",
      liquidationPx:
        liquidation !== null && liquidation > 0 ? liquidation : null,
      targets: [],
      tpPx: null,
      tpSz: null,
      slPx: null,
      tpOrderId: null,
      slOrderId: null,
      protectionOrderIds: [],
    })
  }
  const equity = required(account.data.totalMarginBalance)
  const free = required(account.data.availableBalance)
  return {
    figures: {
      equity,
      free,
      inTrades: Math.max(0, equity - free),
      openProfit: required(account.data.totalUnrealizedProfit),
    },
    portfolio: { positions, orders: [] },
  }
}

function read(
  network: NetworkId,
  credential: () => string | null,
  priority: BinancePriority
): Promise<Snapshot> {
  const parsed = binanceCredentialOf(credential)
  const key = `${network}:${parsed.key}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < ACCOUNT_GOOD_FOR_MS) {
    return cached.answer
  }
  const answer = Promise.all([
    binanceSigned(network, parsed, "GET", "/fapi/v3/account", {}, { priority }),
    binanceSigned(network, parsed, "GET", "/fapi/v2/positionRisk", {}, { priority }),
  ]).then(([account, positions]) =>
    toBinanceAccountSnapshot({ account, positions })
  )
  return rememberPromise(cache, key, { at: Date.now(), answer })
}

export async function fetchBinanceAccount(
  network: NetworkId,
  _address: string,
  credential: () => string | null
): Promise<WalletAccountFigures> {
  return (await read(network, credential, "background")).figures
}

/** Positions without their resting orders. `orders.ts` adds those. */
export async function fetchBinancePositions(
  network: NetworkId,
  credential: () => string | null,
  priority: BinancePriority = "background"
): Promise<WalletPortfolio> {
  return (await read(network, credential, priority)).portfolio
}

/** Forgets every held account read, so the next one asks Binance. */
export function clearBinanceAccountReads(): void {
  cache.clear()
}

const bracketsSchema = z.array(
  z.object({
    symbol: z.string(),
    brackets: z
      .array(z.object({ initialLeverage: decimal }).passthrough())
      .default([]),
  })
)

/**
 * Each market's highest leverage for this account, keyed by coin name.
 *
 * Binance's first bracket holds the smallest positions and the highest
 * number, but the highest of all brackets is taken rather than trusting the
 * order. One signed read covers every market.
 */
export function toBinanceLeverageCeilings(answer: unknown): Map<string, number> {
  const ceilings = new Map<string, number>()
  const parsed = bracketsSchema.safeParse(answer)
  if (!parsed.success) return ceilings
  for (const market of parsed.data) {
    const coin = coinNameFor(market.symbol)
    if (coin === null) continue
    let highest = 0
    for (const bracket of market.brackets) {
      const leverage = num(bracket.initialLeverage)
      if (leverage !== null && leverage > highest) highest = leverage
    }
    const whole = Math.floor(highest)
    if (whole >= 1) ceilings.set(coin, whole)
  }
  return ceilings
}

export async function fetchBinanceLeverageCeilings(
  network: NetworkId,
  _address: string,
  credential: () => string | null
): Promise<Map<string, number>> {
  const answer = await binanceSigned(
    network,
    binanceCredentialOf(credential),
    "GET",
    "/fapi/v1/leverageBracket"
  )
  return toBinanceLeverageCeilings(answer)
}
