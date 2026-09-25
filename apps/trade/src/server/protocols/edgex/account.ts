import { createHash } from "node:crypto"

import { z } from "zod"

import type {
  NetworkId,
  WalletAccountFigures,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/edgex/translate"
import type { EdgexPriority } from "@/server/protocols/edgex/budget"
import { edgexContract, edgexMarketIdOf } from "@/server/protocols/edgex/catalogue"
import {
  edgexPrivate,
  parseEdgexCredential,
  type EdgexCredential,
} from "@/server/protocols/edgex/client"
import { readEdgexLivePrices } from "@/server/protocols/edgex/live-prices"
import { edgexQuietSince } from "@/server/protocols/edgex/private-feed"

const numeric = z.union([z.string(), z.number()])

/**
 * `GET /api/v2/private/account/getAccountAsset`, the one read that answers
 * the account, its collateral, its positions and each position's figures.
 *
 * **Two spellings of the same figures.** edgeX's account page writes
 * `availableAmount`, `initialMarginRequirement`, `liquidatePrice` and
 * `unrealizePnl`; its Go SDK's types write `availableBalance`,
 * `initialMargin`, `liquidationPrice` and `unrealizedPnl`. No real answer has
 * been read yet (Tyler's key is owed), so both are read and the doc says to
 * cut the one a real answer does not carry.
 */
const tradeSettingSchema = z
  .object({ isSetMaxLeverage: z.boolean().optional(), maxLeverage: numeric.optional() })
  .passthrough()

const assetSchema = z.object({
  account: z
    .object({
      id: numeric,
      l2Key: z.string().optional(),
      status: z.string().optional(),
      isLiquidating: z.boolean().optional(),
      defaultTradeSetting: tradeSettingSchema.optional(),
      contractIdToTradeSetting: z.record(z.string(), tradeSettingSchema).optional(),
    })
    .passthrough(),
  positionList: z.array(z.unknown()).default([]),
  positionAssetList: z.array(z.unknown()).default([]),
  collateralAssetModelList: z.array(z.unknown()).default([]),
})

const positionSchema = z
  .object({ contractId: z.string(), openSize: numeric, openValue: numeric.optional() })
  .passthrough()

const positionAssetSchema = z.object({ contractId: z.string() }).passthrough()

const collateralSchema = z.object({ coinId: z.string().optional() }).passthrough()

/** One figure under either of its two spellings. */
function either(row: Record<string, unknown>, first: string, second: string): number | null {
  return num(row[first]) ?? num(row[second])
}

export type EdgexAccountRead = {
  accountId: string
  /** The key edgeX holds for the account's signatures, when it states one. */
  l2Key: string | null
  liquidating: boolean
  equity: number
  free: number
  inTrades: number | null
  /** Leverage the account set per contract number, when it set one. */
  leverageByContract: Map<string, number>
  defaultLeverage: number | null
  positions: Array<{
    contractId: string
    szi: number
    entryPx: number
    liquidationPx: number | null
    openProfit: number | null
    marginUsed: number | null
    leverage: number | null
    marginMode: "cross" | "isolated" | null
  }>
}

/** edgeX's word or number for a position's margin mode, when it gives one. */
function marginModeOf(value: unknown): "cross" | "isolated" | null {
  const text = String(value ?? "").toUpperCase()
  if (text === "CROSS" || text === "CROSS_MARGIN" || text === "0") return "cross"
  if (text === "ISOLATED" || text === "ISOLATED_MARGIN" || text === "1") return "isolated"
  return null
}

/** One `getAccountAsset` answer read into what the wallet card needs. */
export function toEdgexAccountRead(answer: unknown): EdgexAccountRead {
  const parsed = assetSchema.safeParse(answer)
  if (!parsed.success) throw new Error("LIVE_UNREADABLE")
  const data = parsed.data
  // The dollar coin is 1000; an account with one collateral row uses it.
  const collateralRows = data.collateralAssetModelList.flatMap((raw) => {
    const row = collateralSchema.safeParse(raw)
    return row.success ? [row.data as Record<string, unknown>] : []
  })
  const collateral =
    collateralRows.find((row) => row.coinId === "1000") ?? collateralRows[0] ?? null
  const equity = collateral ? num(collateral.totalEquity) : null
  const free = collateral ? either(collateral, "availableAmount", "availableBalance") : null
  // A brand-new account with nothing deposited has no collateral row yet.
  if (collateral && (equity === null || free === null)) throw new Error("LIVE_UNREADABLE")

  const leverageByContract = new Map<string, number>()
  for (const [contractId, setting] of Object.entries(data.account.contractIdToTradeSetting ?? {})) {
    const leverage = num(setting.maxLeverage)
    if (setting.isSetMaxLeverage && leverage !== null && leverage > 0) {
      leverageByContract.set(contractId, leverage)
    }
  }
  const defaultSetting = data.account.defaultTradeSetting
  const defaultLeverage =
    defaultSetting?.isSetMaxLeverage && (num(defaultSetting.maxLeverage) ?? 0) > 0
      ? num(defaultSetting.maxLeverage)
      : null

  const assets = new Map<string, Record<string, unknown>>()
  for (const raw of data.positionAssetList) {
    const row = positionAssetSchema.safeParse(raw)
    if (row.success) assets.set(row.data.contractId, row.data as Record<string, unknown>)
  }
  const positions: EdgexAccountRead["positions"] = []
  for (const raw of data.positionList) {
    const row = positionSchema.safeParse(raw)
    if (!row.success) continue
    const size = num(row.data.openSize)
    // edgeX keeps a row for a contract the account has closed out, at zero.
    if (size === null || size === 0) continue
    const asset = assets.get(row.data.contractId) ?? {}
    const openValue = num(row.data.openValue)
    const entryPx =
      num(asset.avgEntryPrice) ??
      (openValue !== null ? Math.abs(openValue / size) : null)
    if (entryPx === null || !(entryPx > 0)) continue
    const liquidationPx = either(asset, "liquidatePrice", "liquidationPrice")
    positions.push({
      contractId: row.data.contractId,
      // The side is the sign of `openSize`: negative is short.
      szi: size,
      entryPx,
      liquidationPx: liquidationPx !== null && liquidationPx > 0 ? liquidationPx : null,
      openProfit: either(asset, "unrealizePnl", "unrealizedPnl"),
      marginUsed: either(asset, "initialMarginRequirement", "initialMargin"),
      leverage: num(asset.maxLeverage) ?? leverageByContract.get(row.data.contractId) ?? null,
      marginMode: marginModeOf(asset.marginMode ?? row.data.marginMode),
    })
  }
  return {
    accountId: String(data.account.id),
    l2Key: data.account.l2Key?.trim() || null,
    liquidating: data.account.isLiquidating === true,
    equity: equity ?? 0,
    free: free ?? 0,
    inTrades: collateral ? either(collateral, "initialMarginRequirement", "initialMargin") : 0,
    leverageByContract,
    defaultLeverage,
    positions,
  }
}

/**
 * **One shared read every two seconds per account, longer while the private
 * socket vouches for it.** Every panel that asks inside two seconds gets the
 * same answer. After that, the answer still stands while edgeX's private
 * socket has been connected and silent since it was read, which is what
 * replaces the two-second poll; two minutes is the ceiling whatever the
 * socket says. Anything this app sends drops the held read at once.
 */
const HELD_MS = 2_000
const QUIET_CEILING_MS = 2 * 60_000

type Held = { at: number; load: Promise<EdgexAccountRead> }
const held = new Map<string, Held>()

/**
 * A key for one credential that never contains any part of it. All four
 * request values go into it: the sign-in check reads through the same held
 * answer, and a wrong passphrase typed straight after a right one must be
 * asked about, not handed the earlier success.
 */
export function edgexCredentialFingerprint(credential: EdgexCredential): string {
  return createHash("sha256")
    .update(
      `${credential.accountId}\n${credential.key}\n${credential.secret}\n${credential.passphrase}`
    )
    .digest("hex")
    .slice(0, 16)
}

export function edgexCredentialFrom(credential: () => string | null): EdgexCredential {
  return parseEdgexCredential(credential())
}

export async function readEdgexAccount(
  network: NetworkId,
  credential: EdgexCredential,
  priority: EdgexPriority = "background"
): Promise<EdgexAccountRead> {
  const key = `${network}:${edgexCredentialFingerprint(credential)}`
  const found = held.get(key)
  if (found) {
    const age = Date.now() - found.at
    if (age < HELD_MS) return found.load
    if (
      priority === "background" &&
      age < QUIET_CEILING_MS &&
      edgexQuietSince(network, credential.accountId, () => JSON.stringify(credential), found.at)
    ) {
      return found.load
    }
  }
  const load = edgexPrivate(
    network,
    credential,
    "GET",
    "/api/v2/private/account/getAccountAsset",
    {},
    { priority }
  ).then(toEdgexAccountRead)
  held.set(key, { at: Date.now(), load })
  load.catch(() => {
    if (held.get(key)?.load === load) held.delete(key)
  })
  return load
}

/** Drops the held read, after anything that changed the account. */
export function forgetEdgexAccountRead(network: NetworkId, credential: EdgexCredential): void {
  held.delete(`${network}:${edgexCredentialFingerprint(credential)}`)
}

/**
 * The positions as the app's rows.
 *
 * - **Leverage is read, never assumed**: the position's own figure, then the
 *   leverage the account set for that contract, then the account's default,
 *   then the contract's default from the market list, edgeX's own order of
 *   precedence ("contract-specific leverage overrides account default").
 * - **Margin mode is read.** edgeX's account page shows no margin mode on a
 *   position, so where the answer says nothing the row says nothing (null),
 *   rather than calling it cross.
 * - **Liquidation price is edgeX's own** `liquidatePrice`.
 */
export async function toEdgexWalletPositions(
  network: NetworkId,
  read: EdgexAccountRead
): Promise<WalletPosition[]> {
  const rows: WalletPosition[] = []
  for (const position of read.positions) {
    const marketId = await edgexMarketIdOf(network, position.contractId)
    if (marketId === null) continue
    const contract = await edgexContract(network, marketId)
    const leverage =
      position.leverage ??
      read.leverageByContract.get(position.contractId) ??
      read.defaultLeverage ??
      contract.defaultLeverage
    rows.push({
      marketId,
      szi: position.szi,
      entryPx: position.entryPx,
      leverage,
      marginUsed:
        position.marginUsed ?? (Math.abs(position.szi) * position.entryPx) / leverage,
      liquidationPx: position.liquidationPx,
      marginMode: position.marginMode,
      targets: [],
      tpPx: null,
      tpSz: null,
      slPx: null,
      tpOrderId: null,
      slOrderId: null,
      protectionOrderIds: [],
    })
  }
  return rows
}

/** What the wallet card shows: worth, free, in trades and open profit. */
export async function fetchEdgexAccount(
  network: NetworkId,
  _address: string,
  credential: () => string | null
): Promise<WalletAccountFigures> {
  const read = await readEdgexAccount(network, edgexCredentialFrom(credential))
  const positions = await toEdgexWalletPositions(network, read)
  // edgeX states each position's open profit. One it left out is priced at
  // the pushed mark, never counted as zero.
  const marks = readEdgexLivePrices(network).prices
  let openProfit = 0
  for (const position of read.positions) {
    if (position.openProfit !== null) {
      openProfit += position.openProfit
      continue
    }
    const marketId = await edgexMarketIdOf(network, position.contractId)
    const mark = marketId === null ? undefined : marks.get(marketId)
    if (mark !== undefined) openProfit += (mark - position.entryPx) * position.szi
  }
  return {
    equity: read.equity,
    free: read.free,
    inTrades:
      read.inTrades ?? positions.reduce((total, one) => total + one.marginUsed, 0),
    openProfit,
  }
}

/** Tests must not inherit a held read. */
export function clearEdgexAccountReads(): void {
  held.clear()
}
