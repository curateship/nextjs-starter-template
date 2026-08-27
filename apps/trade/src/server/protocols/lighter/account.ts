import { z } from "zod"

import type {
  NetworkId,
  WalletAccountFigures,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/lighter/translate"
import { lighterPublic } from "@/server/protocols/lighter/client"
import { lighterAccountIndex } from "@/server/protocols/lighter/agent"

/**
 * What a Lighter account holds, in the app's own words.
 *
 * **Lighter answers this one publicly**, by account number and with no
 * signature at all, and the number behind an address is a public lookup too.
 * So nothing here reads the wallet's key. That is what lets a server with no
 * signing files still show what a wallet holds — when this did depend on the
 * signer, a real position sat on the exchange with an empty screen in front
 * of it.
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
    /**
     * Empty here on purpose, and filled in by the caller that also reads the
     * resting orders. Lighter keeps every stop and target as its own ordinary
     * order, so the account read alone cannot know about them — see
     * `fetchLighterOrderPortfolio`, which pins them to their position.
     */
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
    // The account read says nothing about resting orders; they need the
    // account's own signature and come from `fetchLighterOrderPortfolio`.
    orders: [],
  }
}

export async function fetchLighterAccount(
  network: NetworkId,
  address: string,
  _credential: () => string | null
): Promise<WalletAccountFigures> {
  // No credential is read: Lighter answers an account publicly by its number,
  // and the number comes from the address. Keeping the signer out of a read
  // is what lets a server without the signing files still show a position.
  const accountIndex = await lighterAccountIndex(network, address)
  const figures = toLighterAccountFigures(await readAccount(network, accountIndex))
  if (!figures) throw new Error("LIGHTER_ACCOUNT_UNREADABLE")
  return figures
}

export async function fetchLighterPortfolio(
  network: NetworkId,
  address: string,
  _credential: () => string | null
): Promise<WalletPortfolio> {
  const accountIndex = await lighterAccountIndex(network, address)
  return toLighterPortfolio(await readAccount(network, accountIndex))
}
