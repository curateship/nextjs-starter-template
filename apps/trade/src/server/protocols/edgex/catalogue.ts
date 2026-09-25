import { z } from "zod"

import type { MarketCategory, NetworkId } from "@/lib/protocols/contracts"
import { edgexBaseName, num } from "@/lib/protocols/edgex/translate"
import type { EdgexPriority } from "@/server/protocols/edgex/budget"
import { edgexPublic } from "@/server/protocols/edgex/client"

/**
 * What edgeX's `getMetaData` answer says about one contract.
 *
 * **Two ids, and the row carries both.** `contractName` (`BTCUSDC`) is the
 * market id and the key (`edgex:mainnet:BTCUSDC`); `contractId`
 * (`30000001`) is what every edgeX request and socket channel names. The
 * task notes asked for the number as the market id "as Lighter does", but
 * Lighter's ids are names too, and a number cannot be printed in the Journal
 * or matched to a borrowed history. Nothing converts one into the other:
 * both come off this row.
 */
export type EdgexContract = {
  marketId: string
  contractId: string
  /** What the screens print: "BTC", "SPY", "1000PEPE". */
  base: string
  category: MarketCategory
  tickSize: number
  stepSize: number
  minOrderSize: number
  maxOrderSize: number | null
  /** The most leverage the first risk tier allows. */
  maxLeverage: number
  /** The leverage a position uses until the account sets its own. */
  defaultLeverage: number
  takerFeeRate: string
  makerFeeRate: string
  /** Hours between funding settlements; 4 on every contract, 24 Sep 2026. */
  fundingHours: number
  /** False on a contract edgeX lets positions close on but not open. */
  canOpen: boolean
  /** False on the three contracts edgeX hides from its own market list. */
  listed: boolean
  /** Size times this is the whole number an order's signature carries. */
  resolution: bigint
  iconUrl: string | null
}

/** The facts every order signature needs from the metadata's `global`. */
export type EdgexSigningFacts = {
  chainId: number
  verifyingContract: `0x${string}`
  /** The dollar coin's id (1000) and its resolution (0xf4240, a million). */
  collateralCoinId: string
  collateralResolution: bigint
}

export type EdgexCatalogue = {
  contracts: EdgexContract[]
  signing: EdgexSigningFacts | null
}

const numeric = z.union([z.string(), z.number()])

const contractSchema = z.object({
  contractId: z.string(),
  contractName: z.string(),
  baseCoinId: z.string(),
  quoteCoinId: z.string(),
  tickSize: numeric,
  stepSize: numeric,
  minOrderSize: numeric,
  maxOrderSize: numeric.optional(),
  riskTierList: z.array(z.object({ maxLeverage: numeric }).passthrough()).default([]),
  defaultLeverage: numeric.optional(),
  defaultTakerFeeRate: z.string().optional(),
  defaultMakerFeeRate: z.string().optional(),
  fundingRateIntervalMin: numeric.optional(),
  enableTrade: z.boolean(),
  enableDisplay: z.boolean().optional(),
  enableOpenPosition: z.boolean().optional(),
  isStock: z.boolean().optional(),
  isFx: z.boolean().optional(),
  resolution: z.string(),
})

const coinSchema = z.object({
  coinId: z.string(),
  coinName: z.string(),
  iconUrl: z.string().optional(),
  resolution: z.string().nullable().optional(),
})

const metaSchema = z.object({
  global: z
    .object({
      nativeChainId: z.string().optional(),
      chainId: z.string().optional(),
      contractAddress: z.string().optional(),
      collateralCoinId: z.string().optional(),
    })
    .passthrough(),
  coinList: z.array(z.unknown()).default([]),
  contractList: z.array(z.unknown()).default([]),
})

/**
 * Metals and oil, which edgeX flags neither as stocks nor as currencies. The
 * task notes filed everything unflagged under Crypto; gold is not a coin, so
 * these eight sit under Commodities. Read off the 24 Sep 2026 list.
 */
const COMMODITIES = new Set(["XAU", "XAG", "XPD", "XPT", "COPPER", "CL", "BZ", "NATGAS"])

function categoryOf(contract: { isStock?: boolean; isFx?: boolean }, base: string): MarketCategory {
  if (contract.isStock) return "stocks"
  if (contract.isFx) return "forex"
  if (COMMODITIES.has(base)) return "commodities"
  return "crypto"
}

/** A resolution as edgeX writes it, "1000000000" or "0xf4240". */
export function parseEdgexResolution(text: string | null | undefined): bigint | null {
  const value = text?.trim() ?? ""
  if (!/^(0x[0-9a-fA-F]+|\d+)$/.test(value)) return null
  const parsed = BigInt(value)
  return parsed > 0n ? parsed : null
}

function signingFacts(
  global: z.infer<typeof metaSchema>["global"],
  coins: ReadonlyMap<string, z.infer<typeof coinSchema>>
): EdgexSigningFacts | null {
  // Read from edgeX's metadata every time, never written into the code, so
  // a new chain or contract on edgeX's side is followed rather than signed
  // against a stale one.
  const chainText = (global.nativeChainId || global.chainId || "").trim()
  const chainId = /^0x/i.test(chainText) ? Number.parseInt(chainText, 16) : Number(chainText)
  const verifyingContract = global.contractAddress?.trim() ?? ""
  const collateralCoinId = global.collateralCoinId?.trim() ?? ""
  const collateralResolution = parseEdgexResolution(coins.get(collateralCoinId)?.resolution)
  if (
    !Number.isSafeInteger(chainId) ||
    chainId <= 0 ||
    !/^0x[0-9a-fA-F]{40}$/.test(verifyingContract) ||
    !collateralCoinId ||
    collateralResolution === null
  ) {
    return null
  }
  return {
    chainId,
    verifyingContract: verifyingContract as `0x${string}`,
    collateralCoinId,
    collateralResolution,
  }
}

/**
 * Every tradable contract from one `getMetaData` answer.
 *
 * Measured 24 Sep 2026: 180 contracts, every one tradable and quoted in
 * USDC; 98 flagged `isStock`, 3 `isFx`, 8 metals and oil, 71 coins. Three
 * (JPY, EUR and ZRO) are hidden from edgeX's own list and kept here so a
 * position on one can still be read and closed, but the market list leaves
 * them out.
 */
export function toEdgexCatalogue(answer: unknown): EdgexCatalogue {
  const parsed = metaSchema.safeParse(answer)
  if (!parsed.success) throw new Error("EDGEX_METADATA_UNREADABLE")
  const coins = new Map<string, z.infer<typeof coinSchema>>()
  for (const raw of parsed.data.coinList) {
    const coin = coinSchema.safeParse(raw)
    if (coin.success) coins.set(coin.data.coinId, coin.data)
  }
  const signing = signingFacts(parsed.data.global, coins)
  const contracts: EdgexContract[] = []
  for (const raw of parsed.data.contractList) {
    const row = contractSchema.safeParse(raw)
    if (!row.success) continue
    const one = row.data
    if (!one.enableTrade) continue
    // Every contract on 24 Sep 2026 settled in the collateral coin. One that
    // does not would sign against the wrong coin, so it is left out.
    if (signing && one.quoteCoinId !== signing.collateralCoinId) continue
    const tickSize = num(one.tickSize)
    const stepSize = num(one.stepSize)
    const minOrderSize = num(one.minOrderSize)
    const maxLeverage = num(one.riskTierList[0]?.maxLeverage)
    // Every contract stated its default on 24 Sep 2026. One that does not is
    // unreadable, like a missing tick: a guessed leverage would be shown on a
    // position and used to size an order.
    const defaultLeverage = num(one.defaultLeverage)
    const resolution = parseEdgexResolution(one.resolution)
    if (
      tickSize === null ||
      !(tickSize > 0) ||
      stepSize === null ||
      !(stepSize > 0) ||
      minOrderSize === null ||
      maxLeverage === null ||
      !(maxLeverage > 0) ||
      defaultLeverage === null ||
      !(defaultLeverage > 0) ||
      resolution === null
    ) {
      continue
    }
    const base = coins.get(one.baseCoinId)?.coinName || edgexBaseName(one.contractName)
    const fundingMinutes = num(one.fundingRateIntervalMin)
    contracts.push({
      marketId: one.contractName,
      contractId: one.contractId,
      base,
      category: categoryOf(one, base),
      tickSize,
      stepSize,
      minOrderSize,
      maxOrderSize: num(one.maxOrderSize),
      maxLeverage,
      defaultLeverage,
      takerFeeRate: one.defaultTakerFeeRate?.trim() || "",
      makerFeeRate: one.defaultMakerFeeRate?.trim() || "",
      fundingHours: fundingMinutes !== null && fundingMinutes > 0 ? fundingMinutes / 60 : 4,
      canOpen: one.enableOpenPosition !== false,
      listed: one.enableDisplay !== false,
      resolution,
      iconUrl: coins.get(one.baseCoinId)?.iconUrl ?? null,
    })
  }
  return { contracts, signing }
}

/**
 * How long one metadata read stands. A minute, the same as the shared market
 * list, so the catalogue costs one of edgeX's requests a minute.
 */
const HELD_MS = 60_000

type Held = { at: number; load: Promise<EdgexCatalogue> }
const held = new Map<NetworkId, Held>()
const byId = new Map<NetworkId, Map<string, EdgexContract>>()
const byNumber = new Map<NetworkId, Map<string, EdgexContract>>()

export function loadEdgexCatalogue(
  network: NetworkId,
  priority: EdgexPriority = "background"
): Promise<EdgexCatalogue> {
  const found = held.get(network)
  if (found && Date.now() - found.at < HELD_MS) return found.load
  const load = edgexPublic(network, "/api/v2/public/meta/getMetaData", {}, priority).then(
    (answer) => {
      const catalogue = toEdgexCatalogue(answer)
      byId.set(network, new Map(catalogue.contracts.map((one) => [one.marketId, one])))
      byNumber.set(network, new Map(catalogue.contracts.map((one) => [one.contractId, one])))
      return catalogue
    }
  )
  held.set(network, { at: Date.now(), load })
  load.catch(() => {
    if (held.get(network)?.load === load) held.delete(network)
  })
  return load
}

/** One market's facts, read from the last catalogue or a fresh one. */
export async function edgexContract(
  network: NetworkId,
  marketId: string,
  priority: EdgexPriority = "background"
): Promise<EdgexContract> {
  const known = byId.get(network)?.get(marketId)
  if (known) return known
  await loadEdgexCatalogue(network, priority)
  const found = byId.get(network)?.get(marketId)
  if (!found) throw new Error("EDGEX_MARKET_UNKNOWN")
  return found
}

/** The market id behind a contract number, for answers that name only that. */
export async function edgexMarketIdOf(
  network: NetworkId,
  contractId: string
): Promise<string | null> {
  const known = byNumber.get(network)?.get(contractId)
  if (known) return known.marketId
  await loadEdgexCatalogue(network)
  return byNumber.get(network)?.get(contractId)?.marketId ?? null
}

/** The signing facts from the last catalogue or a fresh one. */
export async function edgexSigningFacts(network: NetworkId): Promise<EdgexSigningFacts> {
  const { signing } = await loadEdgexCatalogue(network, "order")
  if (!signing) {
    throw new Error(
      "LIVE_EXCHANGE:edgeX's market list did not state the chain and contract every order is signed for, so nothing was sent."
    )
  }
  return signing
}

/** Tests must not inherit a catalogue from an earlier case. */
export function clearEdgexCatalogue(): void {
  held.clear()
  byId.clear()
  byNumber.clear()
}
