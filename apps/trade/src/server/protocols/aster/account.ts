import { z } from "zod"

import type {
  NetworkId,
  WalletAccountFigures,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/aster/translate"
import {
  asterSigned,
  parseAsterCredential,
} from "@/server/protocols/aster/client"

const accountPositionSchema = z.object({
  symbol: z.string(),
  positionSide: z.string(),
  positionInitialMargin: z.union([z.string(), z.number()]),
})

const accountSchema = z.object({
  totalMarginBalance: z.union([z.string(), z.number()]),
  totalUnrealizedProfit: z.union([z.string(), z.number()]),
  availableBalance: z.union([z.string(), z.number()]),
  positions: z.array(accountPositionSchema),
})

const positionSchema = z.object({
  symbol: z.string(),
  positionAmt: z.union([z.string(), z.number()]),
  entryPrice: z.union([z.string(), z.number()]),
  leverage: z.union([z.string(), z.number()]),
  marginType: z.string(),
  positionSide: z.string(),
  isolatedMargin: z.union([z.string(), z.number()]),
  liquidationPrice: z.union([z.string(), z.number()]).optional(),
})

type Snapshot = {
  figures: WalletAccountFigures
  portfolio: WalletPortfolio
}

// Watched prices still move every second on the open stream. Aster charges ten
// request units for this account pair, so four refreshes a minute are enough.
// Every successful order clears the cache before the next engine pass.
const ACCOUNT_GOOD_FOR_MS = 15_000
const cache = new Map<string, { at: number; answer: Promise<Snapshot> }>()

export const ASTER_ONE_WAY_REQUIRED =
  "This Aster account can hold a long and a short in the same coin. Trade works with one direction at a time. Change Position Mode to One-way Mode on Aster, then refresh."

function required(value: unknown): number {
  const parsed = num(value)
  if (parsed === null) throw new Error("ASTER_ACCOUNT_UNREADABLE")
  return parsed
}

function assertOneWay(sides: readonly string[]): void {
  for (const side of sides) {
    if (side === "BOTH") continue
    if (side === "LONG" || side === "SHORT") {
      throw new Error(`WALLET_POSITION_MODE:${ASTER_ONE_WAY_REQUIRED}`)
    }
    throw new Error("ASTER_ACCOUNT_UNREADABLE")
  }
}

/** Aster's account-wide position mode, read while a credential is verified. */
export async function fetchAsterPositionMode(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<"one-way" | "two-sided"> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parseAsterCredential(blob)
  const answer = await asterSigned(
    network,
    address,
    parsed,
    "GET",
    "/fapi/v3/positionSide/dual",
    30
  )
  const mode = z.object({ dualSidePosition: z.boolean() }).safeParse(answer)
  if (!mode.success) throw new Error("ASTER_ACCOUNT_UNREADABLE")
  return mode.data.dualSidePosition ? "two-sided" : "one-way"
}

export function toAsterAccountSnapshot(input: {
  account: unknown
  positions: unknown
}): Snapshot {
  const parsedAccount = accountSchema.safeParse(input.account)
  const parsedPositions = z.array(z.unknown()).safeParse(input.positions)
  if (!parsedAccount.success || !parsedPositions.success) {
    throw new Error("ASTER_ACCOUNT_UNREADABLE")
  }
  const account = parsedAccount.data
  assertOneWay(account.positions.map((row) => row.positionSide))
  const equity = required(account.totalMarginBalance)
  const free = required(account.availableBalance)
  const openProfit = required(account.totalUnrealizedProfit)
  const positions: WalletPosition[] = []
  const crossMargins = new Map(
    account.positions.map((row) => [
      `${row.symbol}:${row.positionSide}`,
      row.positionInitialMargin,
    ])
  )

  for (const raw of parsedPositions.data) {
    const parsed = positionSchema.safeParse(raw)
    if (!parsed.success) throw new Error("ASTER_ACCOUNT_UNREADABLE")
    const row = parsed.data
    assertOneWay([row.positionSide])
    const szi = required(row.positionAmt)
    if (szi === 0) continue
    const liquidation = num(row.liquidationPrice)
    const margin =
      row.marginType.toLowerCase() === "isolated"
        ? row.isolatedMargin
        : crossMargins.get(`${row.symbol}:${row.positionSide}`)
    if (margin === undefined) throw new Error("ASTER_ACCOUNT_UNREADABLE")
    positions.push({
      marketId: row.symbol,
      szi,
      entryPx: required(row.entryPrice),
      leverage: required(row.leverage),
      marginUsed: required(margin),
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

  return {
    figures: {
      equity,
      free,
      inTrades: Math.max(0, equity - free),
      openProfit,
    },
    portfolio: { positions, orders: [] },
  }
}

async function read(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<Snapshot> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parseAsterCredential(blob)
  const key = `${network}:${address.toLowerCase()}:${parsed.signer}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < ACCOUNT_GOOD_FOR_MS)
    return cached.answer

  const at = Date.now()
  const answer = Promise.all([
    asterSigned(
      network,
      address,
      parsed,
      "GET",
      "/fapi/v3/accountWithJoinMargin",
      5
    ),
    asterSigned(network, address, parsed, "GET", "/fapi/v3/positionRisk", 5),
  ]).then(([account, positions]) =>
    toAsterAccountSnapshot({ account, positions })
  )
  answer.catch(() => {
    if (cache.get(key)?.at === at) cache.delete(key)
  })
  cache.set(key, { at, answer })
  return answer
}

export async function fetchAsterAccount(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<WalletAccountFigures> {
  return (await read(network, address, credential)).figures
}

export async function fetchAsterPortfolio(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<WalletPortfolio> {
  return (await read(network, address, credential)).portfolio
}

export function clearAsterAccountCache(): void {
  cache.clear()
}
