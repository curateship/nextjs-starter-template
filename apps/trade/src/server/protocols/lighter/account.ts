import { z } from "zod"

import type {
  NetworkId,
  WalletAccountFigures,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/lighter/translate"
import { lighterPublic } from "@/server/protocols/lighter/client"
import { lighterAccountFacts } from "@/server/protocols/lighter/agent"

/**
 * What a Lighter account holds, in the app's own words.
 *
 * **Lighter answers this one publicly.** An account can be read by its index
 * without any signature, which is why the figures below cost no auth token.
 * The credential is still needed, because the index itself is found from the
 * wallet's address and its key — see `agent.ts`.
 */

const UNLISTED_WEIGHT = 300

const numeric = z.union([z.string(), z.number()])

const positionSchema = z.object({
  market_id: z.number(),
  symbol: z.string(),
  /** 1 long, -1 short. The `position` beside it is unsigned. */
  sign: z.number(),
  position: numeric,
  avg_entry_price: numeric,
  position_value: numeric,
  unrealized_pnl: numeric,
  liquidation_price: numeric.optional(),
  /** A percent here — "2.00" is 2%, which is 50x. */
  initial_margin_fraction: numeric.optional(),
  allocated_margin: numeric.optional(),
  margin_mode: z.number().optional(),
})

const accountSchema = z.object({
  account_index: z.number(),
  collateral: numeric.optional(),
  available_balance: numeric.optional(),
  total_asset_value: numeric.optional(),
  positions: z.array(z.unknown()).default([]),
})

const answerSchema = z.object({
  accounts: z.array(z.unknown()).default([]),
})

async function readAccount(
  network: NetworkId,
  accountIndex: number
): Promise<z.infer<typeof accountSchema>> {
  const answer = await lighterPublic(network, "/api/v1/account", UNLISTED_WEIGHT, {
    by: "index",
    value: accountIndex,
  })
  const parsed = answerSchema.safeParse(answer)
  const first = parsed.success ? parsed.data.accounts[0] : undefined
  const account = accountSchema.safeParse(first)
  if (!account.success) throw new Error("LIGHTER_ACCOUNT_UNREADABLE")
  return account.data
}

/**
 * Lighter states a position's margin requirement as a percent of its value,
 * and only fills in `allocated_margin` for an isolated one. A cross position
 * leaves that field at zero, so the requirement is worked out from the
 * percent Lighter itself states — which reproduced its own account-wide
 * figure to the cent when checked on 26 Aug 2026.
 */
function marginUsed(row: z.infer<typeof positionSchema>): number {
  const allocated = num(row.allocated_margin)
  if (allocated !== null && allocated > 0) return allocated
  const value = num(row.position_value)
  const fraction = num(row.initial_margin_fraction)
  if (value === null || fraction === null) return 0
  return (value * fraction) / 100
}

/** "2.00" percent of the position's value is 50x. */
function leverageOf(row: z.infer<typeof positionSchema>): number {
  const fraction = num(row.initial_margin_fraction)
  if (fraction === null || !(fraction > 0)) return 1
  return Math.round((100 / fraction) * 100) / 100
}

function toPosition(raw: unknown): WalletPosition | null {
  const parsed = positionSchema.safeParse(raw)
  if (!parsed.success) return null
  const row = parsed.data
  const size = num(row.position)
  const entry = num(row.avg_entry_price)
  if (size === null || entry === null || size === 0) return null
  const liquidation = num(row.liquidation_price)

  return {
    marketId: row.symbol,
    szi: row.sign < 0 ? -size : size,
    entryPx: entry,
    leverage: leverageOf(row),
    marginUsed: marginUsed(row),
    liquidationPx: liquidation !== null && liquidation > 0 ? liquidation : null,
    // Lighter's order path is not built yet, so Trade has placed no stop or
    // target here and claims none. Anything set on Lighter's own site is
    // real but not yet visible; the doc says so rather than the screen
    // implying a position is unprotected.
    targets: [],
    tpPx: null,
    tpSz: null,
    slPx: null,
    tpOrderId: null,
    slOrderId: null,
    protectionOrderIds: [],
  }
}

/** Saved Lighter answers translated without touching the network. */
export function toLighterAccountFigures(
  raw: unknown
): WalletAccountFigures | null {
  const parsed = accountSchema.safeParse(raw)
  if (!parsed.success) return null
  const account = parsed.data
  // What the account is worth already carries the open profit: Lighter's
  // total asset value is its collateral plus every position's unrealized
  // figure, which reproduced exactly when checked against a live account.
  const equity = num(account.total_asset_value) ?? 0
  const free = num(account.available_balance) ?? 0
  const openProfit = account.positions.reduce<number>((total, row) => {
    const position = positionSchema.safeParse(row)
    return position.success
      ? total + (num(position.data.unrealized_pnl) ?? 0)
      : total
  }, 0)
  return {
    equity,
    free,
    // What the open positions are holding. Lighter states this account-wide
    // as its cross initial margin requirement, and equity minus free came to
    // the same number to the cent.
    inTrades: Math.max(0, equity - free),
    openProfit,
  }
}

export function toLighterPortfolio(raw: unknown): WalletPortfolio {
  const parsed = accountSchema.safeParse(raw)
  const rows = parsed.success ? parsed.data.positions : []
  return {
    positions: rows
      .map(toPosition)
      .filter((one): one is WalletPosition => one !== null),
    // Nothing can be placed on Lighter from here yet, so no waiting order is
    // claimed. An empty list beats a made-up one.
    orders: [],
  }
}

export async function fetchLighterAccount(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<WalletAccountFigures> {
  const { accountIndex } = await lighterAccountFacts(network, address, credential)
  const figures = toLighterAccountFigures(await readAccount(network, accountIndex))
  if (!figures) throw new Error("LIGHTER_ACCOUNT_UNREADABLE")
  return figures
}

export async function fetchLighterPortfolio(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<WalletPortfolio> {
  const { accountIndex } = await lighterAccountFacts(network, address, credential)
  return toLighterPortfolio(await readAccount(network, accountIndex))
}
