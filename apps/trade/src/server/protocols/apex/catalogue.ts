import { z } from "zod"

import type { MarketCategory, NetworkId } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/apex/translate"
import { apexPublic } from "@/server/protocols/apex/client"
import type { ApexPriority } from "@/server/protocols/apex/budget"

/**
 * What ApeX Omni's `/symbols` answer says about one tradable market.
 *
 * **Two spellings, and the row carries both.** `crossSymbolName`
 * (`BTCUSDT`) is what every read and the socket use, so it is the market id
 * and the key (`apex:mainnet:BTCUSDT`). `symbol` (`BTC-USDT`) is what an
 * order and the funding history name. Nothing converts one into the other:
 * both come off this row.
 */
export type ApexContract = {
  marketId: string
  symbol: string
  /** What the screens print: ApeX's own base name, "BTC", "XAU". */
  base: string
  kind: "perpetual" | "stock"
  category: MarketCategory
  /** The id an order's zkLink signature names. */
  l2PairId: number
  tickSize: number
  stepSize: number
  minOrderSize: number
  maxOrderSize: number | null
  /** 0.01 is 100x: the most leverage the market allows. */
  initialMarginRate: number
  /**
   * The margin rate a position uses until the account sets its own for this
   * market: 0.05 is 20x. ApeX's connector reads the same field.
   */
  defaultInitialMarginRate: number
  /** False on a market ApeX lets positions close on but not open. */
  canOpen: boolean
  iconUrl: string | null
}

const numeric = z.union([z.string(), z.number()])

const contractSchema = z.object({
  symbol: z.string(),
  crossSymbolName: z.string(),
  enableTrade: z.boolean(),
  enableOpenPosition: z.boolean().optional(),
  isPrelaunch: z.boolean().optional(),
  tickSize: numeric,
  stepSize: numeric,
  minOrderSize: numeric,
  maxOrderSize: numeric.optional(),
  initialMarginRate: numeric,
  defaultInitialMarginRate: numeric.optional(),
  l2PairId: numeric,
  baseTokenId: z.string().optional(),
  category: z.string().optional(),
})

const symbolsSchema = z.object({
  contractConfig: z.object({
    perpetualContract: z.array(z.unknown()).default([]),
    stockContract: z.array(z.unknown()).default([]),
    tokens: z
      .array(z.object({ token: z.string(), iconUrl: z.string().optional() }).passthrough())
      .default([]),
  }),
})

/**
 * ApeX files its stock contracts under STOCK, INDEX and COMMODITY. The app
 * has a word for each, so gold and oil sit under Commodities and SPY under
 * Indices, all inside the TradFi tab.
 */
function stockCategory(category: string | undefined): MarketCategory {
  if (category === "INDEX") return "indices"
  if (category === "COMMODITY") return "commodities"
  return "stocks"
}

/**
 * The tradable perpetual and stock contracts from one `/symbols` answer.
 *
 * Measured 24 Sep 2026: 138 perpetual rows (88 with `enableTrade`), 47 stock
 * rows (39 enabled) and 184 prediction-market rows. Predictions are yes/no
 * bets and are never read here. A prelaunch contract is never traded here
 * either; ApeX listed none that day.
 */
export function toApexContracts(answer: unknown): ApexContract[] {
  const parsed = symbolsSchema.safeParse(answer)
  if (!parsed.success) throw new Error("APEX_SYMBOLS_UNREADABLE")
  const config = parsed.data.contractConfig
  const icons = new Map(
    config.tokens.map((token) => [token.token, token.iconUrl ?? null])
  )
  const contracts: ApexContract[] = []
  const read = (raw: unknown, kind: ApexContract["kind"]) => {
    const row = contractSchema.safeParse(raw)
    if (!row.success) return
    const one = row.data
    if (!one.enableTrade || one.isPrelaunch) return
    const tickSize = num(one.tickSize)
    const stepSize = num(one.stepSize)
    const minOrderSize = num(one.minOrderSize)
    const initialMarginRate = num(one.initialMarginRate)
    const l2PairId = num(one.l2PairId)
    if (
      tickSize === null ||
      !(tickSize > 0) ||
      stepSize === null ||
      !(stepSize > 0) ||
      minOrderSize === null ||
      initialMarginRate === null ||
      !(initialMarginRate > 0) ||
      l2PairId === null ||
      !Number.isInteger(l2PairId)
    ) {
      return
    }
    contracts.push({
      marketId: one.crossSymbolName,
      symbol: one.symbol,
      base: one.baseTokenId || one.crossSymbolName.replace(/USDT$/, ""),
      kind,
      category: kind === "stock" ? stockCategory(one.category) : "crypto",
      l2PairId,
      tickSize,
      stepSize,
      minOrderSize,
      maxOrderSize: num(one.maxOrderSize),
      initialMarginRate,
      defaultInitialMarginRate:
        num(one.defaultInitialMarginRate) ?? initialMarginRate,
      canOpen: one.enableOpenPosition !== false,
      iconUrl: one.baseTokenId ? (icons.get(one.baseTokenId) ?? null) : null,
    })
  }
  for (const raw of config.perpetualContract) read(raw, "perpetual")
  for (const raw of config.stockContract) read(raw, "stock")
  return contracts
}

/**
 * How long one `/symbols` read stands. A minute, the same as the shared
 * market list, so the catalogue costs one of ApeX's 600 requests a minute.
 */
const HELD_MS = 60_000

type Held = { at: number; load: Promise<ApexContract[]> }
const held = new Map<NetworkId, Held>()
const byId = new Map<NetworkId, Map<string, ApexContract>>()

export function loadApexContracts(
  network: NetworkId,
  priority: ApexPriority = "background"
): Promise<ApexContract[]> {
  const found = held.get(network)
  if (found && Date.now() - found.at < HELD_MS) return found.load
  const load = apexPublic(network, "/symbols", {}, priority).then((answer) => {
    const contracts = toApexContracts(answer)
    byId.set(network, new Map(contracts.map((one) => [one.marketId, one])))
    return contracts
  })
  held.set(network, { at: Date.now(), load })
  load.catch(() => {
    if (held.get(network)?.load === load) held.delete(network)
  })
  return load
}

/** One market's facts, read from the last catalogue or a fresh one. */
export async function apexContract(
  network: NetworkId,
  marketId: string,
  priority: ApexPriority = "background"
): Promise<ApexContract> {
  const known = byId.get(network)?.get(marketId)
  if (known) return known
  await loadApexContracts(network, priority)
  const found = byId.get(network)?.get(marketId)
  if (!found) throw new Error("APEX_MARKET_UNKNOWN")
  return found
}

/** The market id behind a dashed symbol, for answers that name only that. */
export async function apexMarketIdOf(
  network: NetworkId,
  symbol: string
): Promise<string | null> {
  const search = () => {
    for (const contract of byId.get(network)?.values() ?? []) {
      if (contract.symbol === symbol) return contract.marketId
    }
    return null
  }
  return search() ?? (await loadApexContracts(network), search())
}

/** Tests must not inherit a catalogue from an earlier case. */
export function clearApexCatalogue(): void {
  held.clear()
  byId.clear()
}
