import { randomBytes } from "node:crypto"

import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid"
import { z } from "zod"

import type {
  NetworkId,
  OrderAuth,
  PlaceOrderOutcome,
  PlaceOrderParams,
  WalletOpenOrder,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { num, roundOrderPx } from "@/lib/protocols/hyperliquid/translate"
import { infoClient } from "@/server/protocols/hyperliquid/client"
import {
  agentSigner,
  assertRealOrdersAllowed,
  scrubbedMessage,
} from "@/server/protocols/hyperliquid/signing"
import { fetchHyperliquidPrices } from "@/server/protocols/hyperliquid/prices"

/**
 * Real orders against Hyperliquid — the one file that signs.
 *
 * Reached only through the protocol registry, like every adapter here. The
 * security rules it carries (the rest live in `signing.ts`):
 *
 * - **Every path through this file starts at the mainnet gate.** Testnet
 *   signs freely; real money throws until the server switch is deliberately
 *   set.
 * - **Market orders are never naked.** They go out as immediate-or-cancel
 *   limits a few percent through the price, so a thin book cannot fill one
 *   far from what was on screen.
 * - **Partial outcomes are reported, not folded.** An entry that stood while
 *   a protection leg was refused comes back saying exactly that.
 * - **Errors are scrubbed** before they travel — no exchange message can
 *   carry a key back out of this folder.
 * - **Main venue only, for now.** Positions on Hyperliquid's sub-exchanges
 *   would not show in the portfolio read, so placing there is refused rather
 *   than half-supported. The store refuses namespaced ids before calling in.
 */

/** How far through the price a "market" order may fill — 3%, the old app's cap. */
const MARKET_SLIPPAGE = 0.03

/**
 * Tags every order this app places, so its orders can be told apart from ones
 * placed on the exchange's own site or by anything else sharing the account.
 * 8 hex characters of prefix + 24 random = the 16-byte id Hyperliquid takes.
 */
const CLOID_PREFIX = "ade00001"

function newCloid(): `0x${string}` {
  return `0x${CLOID_PREFIX}${randomBytes(12).toString("hex")}` as `0x${string}`
}

// ----- Asset ids ----------------------------------------------------------

/**
 * Orders name assets by index, not by name — the index into the main venue's
 * own list. Cached briefly per network; the list gains coins rarely and an
 * order should not pay a meta round-trip every time.
 */
const assetCache = new Map<
  NetworkId,
  { at: number; byId: Map<string, { assetId: number; szDecimals: number }> }
>()

const ASSET_CACHE_MS = 10 * 60_000

const metaSchema = z.object({
  universe: z.array(
    z.object({
      name: z.string(),
      szDecimals: z.number().int().min(0).max(12).optional(),
      isDelisted: z.boolean().optional(),
    })
  ),
})

async function mainVenueAssets(network: NetworkId) {
  const cached = assetCache.get(network)
  if (cached && Date.now() - cached.at < ASSET_CACHE_MS) return cached.byId

  const meta = metaSchema.parse(await infoClient(network).meta({ dex: "" }))
  const byId = new Map<string, { assetId: number; szDecimals: number }>()
  meta.universe.forEach((asset, index) => {
    // Delisted markets keep their slot — the INDEX is the id, so skipping
    // them here would not renumber anything, only hide them.
    byId.set(asset.name, { assetId: index, szDecimals: asset.szDecimals ?? 0 })
  })
  assetCache.set(network, { at: Date.now(), byId })
  return byId
}

async function resolveAsset(network: NetworkId, marketId: string) {
  const assets = await mainVenueAssets(network)
  const found = assets.get(marketId)
  // Not "LIVE_MARKET_…": the sentence lookup matches by substring, and a code
  // that contains another code would put the wrong sentence on the toast.
  if (!found) throw new Error("LIVE_UNLISTED")
  return found
}

// ----- Numbers as the wire wants them -------------------------------------

/**
 * A number as a plain decimal string. `String(1e-7)` prints an exponent the
 * exchange rejects; this never does.
 */
export function decimalString(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new Error("LIVE_PRICE")
  if (Number.isInteger(value)) return String(value)
  return value
    .toFixed(12)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
}

/**
 * A size the exchange will accept: floored to the market's size step — an
 * order is never quietly rounded UP to more than was asked — and printed
 * plainly. Zero after flooring is refused; it would be an order for nothing.
 */
export function formatSize(sz: number, szDecimals: number): string {
  const factor = 10 ** szDecimals
  // The epsilon absorbs float dust (0.29 * 100 is 28.999…97) without ever
  // absorbing a real step.
  const floored = Math.floor(sz * factor + 1e-9) / factor
  if (!(floored > 0)) throw new Error("LIVE_SIZE")
  return decimalString(floored)
}

/** A price the exchange will accept, printed plainly. */
export function formatPx(px: number, szDecimals: number): string {
  const rounded = roundOrderPx(px, szDecimals)
  if (!(rounded > 0)) throw new Error("LIVE_PRICE")
  return decimalString(rounded)
}

/**
 * Where a "market" order is actually priced: through the book by the slippage
 * cap, so it fills now against anything reasonable and is cancelled — not
 * filled — against anything wild.
 */
export function cappedMarketPx(
  mark: number,
  side: "buy" | "sell",
  szDecimals: number
): number {
  const capped = side === "buy" ? mark * (1 + MARKET_SLIPPAGE) : mark * (1 - MARKET_SLIPPAGE)
  return roundOrderPx(capped, szDecimals)
}

// ----- The signing client -------------------------------------------------

/**
 * Built per call and released with it — never cached, so the decrypted key's
 * life is the length of one request. See `signing.ts` for why.
 */
function exchangeClient(network: NetworkId, auth: OrderAuth) {
  assertRealOrdersAllowed(network)
  const signer = agentSigner(auth.agentKey)
  return new ExchangeClient({
    transport: new HttpTransport({ isTestnet: network === "testnet" }),
    wallet: signer,
    nonceManager: () => auth.allocateNonce(signer.address.toLowerCase()),
  })
}

/** An exchange refusal as a thrown, scrubbed, code-prefixed error. */
function exchangeError(error: unknown): Error {
  return new Error(`LIVE_EXCHANGE:${scrubbedMessage(error)}`)
}

// ----- Reading what the exchange says back --------------------------------

type OrderStatus =
  | { resting: { oid: number } }
  | { filled: { oid: number; totalSz: string; avgPx: string } }
  | { error: string }
  | string

function statusError(status: OrderStatus | undefined): string | null {
  if (status === undefined) return "The exchange did not answer for this order."
  if (typeof status === "object" && "error" in status) return status.error
  return null
}

// ----- Placing ------------------------------------------------------------

export async function placeHyperliquidOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: PlaceOrderParams
): Promise<PlaceOrderOutcome> {
  const client = exchangeClient(network, auth)
  const asset = await resolveAsset(network, params.marketId)
  const isBuy = params.side === "buy"

  // The account's leverage for this market, set only when the store says the
  // position is being opened fresh — adding to one inherits what it has, the
  // same rule the practice engine follows.
  if (params.leverage !== null) {
    try {
      await client.updateLeverage({
        asset: asset.assetId,
        isCross: false,
        leverage: Math.max(1, Math.round(params.leverage)),
      })
    } catch (error) {
      throw exchangeError(error)
    }
  }

  // A "market" order's px arrives as the live mark and leaves as the capped
  // IOC limit; a "limit" order's px is the level that was asked for.
  const px = formatPx(
    params.kind === "market"
      ? cappedMarketPx(params.px, params.side, asset.szDecimals)
      : params.px,
    asset.szDecimals
  )
  const sz = formatSize(params.sz, asset.szDecimals)

  const protectionLegs: Array<{ tpsl: "tp" | "sl"; triggerPx: number }> = [
    ...(params.tpPx !== null ? [{ tpsl: "tp" as const, triggerPx: params.tpPx }] : []),
    ...(params.slPx !== null ? [{ tpsl: "sl" as const, triggerPx: params.slPx }] : []),
  ]

  const orders = [
    {
      a: asset.assetId,
      b: isBuy,
      p: px,
      s: sz,
      r: params.reduceOnly,
      t: { limit: { tif: params.kind === "market" ? ("Ioc" as const) : ("Gtc" as const) } },
      c: newCloid(),
    },
    // The protection legs ride in the same request (`normalTpsl`), each a
    // reduce-only trigger on the CLOSING side, so the entry and its guard
    // rails arrive as one thing.
    ...protectionLegs.map((leg) => ({
      a: asset.assetId,
      b: !isBuy,
      p: formatPx(leg.triggerPx, asset.szDecimals),
      s: sz,
      r: true,
      t: {
        trigger: {
          isMarket: true,
          triggerPx: formatPx(leg.triggerPx, asset.szDecimals),
          tpsl: leg.tpsl,
        },
      },
      c: newCloid(),
    })),
  ]

  let statuses: OrderStatus[]
  try {
    const response = await client.order({
      orders,
      grouping: protectionLegs.length > 0 ? "normalTpsl" : "na",
    })
    statuses = response.response.data.statuses as OrderStatus[]
  } catch (error) {
    throw exchangeError(error)
  }

  const entry = statuses[0]
  const entryError = statusError(entry)
  // The whole group is refused together when the entry is — nothing stood.
  if (entryError !== null) throw new Error(`LIVE_EXCHANGE:${entryError}`)

  // The entry stood. From here every outcome is reported, never thrown —
  // throwing would read as "nothing happened" over an order that exists.
  let protection: PlaceOrderOutcome["protection"] = null
  let protectionNote: string | null = null
  if (protectionLegs.length > 0) {
    const failed = protectionLegs
      .map((leg, index) => ({ leg, error: statusError(statuses[index + 1]) }))
      .filter((one) => one.error !== null)
    if (failed.length === 0) {
      protection = "ok"
    } else {
      protection = "partial"
      const names = failed
        .map((one) => (one.leg.tpsl === "tp" ? "take profit" : "stop loss"))
        .join(" and ")
      protectionNote =
        `The order went through but its ${names} was refused ` +
        `(${scrubbedMessage(failed[0].error)}). The position is not protected — ` +
        `set its stop and target from the chart or the positions table.`
    }
  }

  if (typeof entry === "object" && "filled" in entry) {
    return {
      status: "filled",
      orderId: String(entry.filled.oid),
      avgPx: num(entry.filled.avgPx),
      filledSz: num(entry.filled.totalSz),
      protection,
      protectionNote,
    }
  }
  const oid =
    typeof entry === "object" && "resting" in entry ? String(entry.resting.oid) : null
  return {
    status: "resting",
    orderId: oid,
    avgPx: null,
    filledSz: null,
    protection,
    protectionNote,
  }
}

// ----- Cancelling ---------------------------------------------------------

export async function cancelHyperliquidOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; orderId: string }
): Promise<void> {
  const client = exchangeClient(network, auth)
  const asset = await resolveAsset(network, params.marketId)
  const oid = Number(params.orderId)
  if (!Number.isSafeInteger(oid) || oid <= 0) throw new Error("LIVE_ORDER_ID")

  let statuses: OrderStatus[]
  try {
    const response = await client.cancel({
      cancels: [{ a: asset.assetId, o: oid }],
    })
    statuses = response.response.data.statuses as OrderStatus[]
  } catch (error) {
    throw exchangeError(error)
  }
  const failed = statusError(statuses[0])
  if (failed !== null) throw new Error(`LIVE_EXCHANGE:${failed}`)
}

// ----- Closing ------------------------------------------------------------

export async function closeHyperliquidPosition(
  network: NetworkId,
  auth: OrderAuth,
  params: { marketId: string; szi: number }
): Promise<{ avgPx: number | null; filledSz: number | null }> {
  if (params.szi === 0) throw new Error("LIVE_POSITION_GONE")
  // Priced off the live mark, capped like every market order.
  const prices = await fetchHyperliquidPrices(network, [params.marketId])
  const mark = prices.get(params.marketId)
  if (mark === undefined) throw new Error("LIVE_NO_PRICE")

  const side: "buy" | "sell" = params.szi > 0 ? "sell" : "buy"
  const outcome = await placeHyperliquidOrder(network, auth, {
    marketId: params.marketId,
    side,
    kind: "market",
    px: mark,
    sz: Math.abs(params.szi),
    reduceOnly: true,
    leverage: null,
    tpPx: null,
    slPx: null,
  })
  return { avgPx: outcome.avgPx, filledSz: outcome.filledSz }
}

// ----- The protection on an existing position -----------------------------

/**
 * Replaces a position's stop and target: the old legs are cancelled, the new
 * ones placed as `positionTpsl` triggers the exchange scales with the
 * position. Cancel-first on purpose — the moment between is a moment without
 * protection, and if placing then fails that gap is REPORTED (the thrown
 * message says the old protection is gone), never discovered later.
 */
export async function setHyperliquidBrackets(
  network: NetworkId,
  auth: OrderAuth,
  params: {
    marketId: string
    position: Pick<WalletPosition, "szi" | "tpOrderId" | "slOrderId">
    tpPx: number | null
    slPx: number | null
  }
): Promise<void> {
  const client = exchangeClient(network, auth)
  const asset = await resolveAsset(network, params.marketId)

  const oldLegs = [params.position.tpOrderId, params.position.slOrderId]
    .filter((id): id is string => id !== null)
    .map(Number)
    .filter((oid) => Number.isSafeInteger(oid) && oid > 0)

  if (oldLegs.length > 0) {
    try {
      const response = await client.cancel({
        cancels: oldLegs.map((oid) => ({ a: asset.assetId, o: oid })),
      })
      const statuses = response.response.data.statuses as OrderStatus[]
      const failed = statuses.map(statusError).find((error) => error !== null)
      // A leg that is already gone (filled or cancelled elsewhere) is fine —
      // the aim is "no old legs", and it already isn't there.
      if (failed && !/never placed|already|filled|canceled|cancelled/i.test(failed)) {
        throw new Error(`LIVE_EXCHANGE:${failed}`)
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("LIVE_EXCHANGE:")) throw error
      throw exchangeError(error)
    }
  }

  const isBuy = params.position.szi > 0
  const legs: Array<{ tpsl: "tp" | "sl"; triggerPx: number }> = [
    ...(params.tpPx !== null ? [{ tpsl: "tp" as const, triggerPx: params.tpPx }] : []),
    ...(params.slPx !== null ? [{ tpsl: "sl" as const, triggerPx: params.slPx }] : []),
  ]
  if (legs.length === 0) return

  const sz = formatSize(Math.abs(params.position.szi), asset.szDecimals)
  let statuses: OrderStatus[]
  try {
    const response = await client.order({
      orders: legs.map((leg) => ({
        a: asset.assetId,
        b: !isBuy,
        p: formatPx(leg.triggerPx, asset.szDecimals),
        s: sz,
        r: true,
        t: {
          trigger: {
            isMarket: true,
            triggerPx: formatPx(leg.triggerPx, asset.szDecimals),
            tpsl: leg.tpsl,
          },
        },
        c: newCloid(),
      })),
      grouping: "positionTpsl",
    })
    statuses = response.response.data.statuses as OrderStatus[]
  } catch (error) {
    throw new Error(`LIVE_BRACKETS_GONE:${scrubbedMessage(error)}`)
  }

  // Every leg must stand — a short or failed list here means the position is
  // sitting with less protection than was just asked for.
  const failed = legs
    .map((_, index) => statusError(statuses[index]))
    .find((error) => error !== null)
  if (failed) throw new Error(`LIVE_BRACKETS_GONE:${failed}`)
}

// ----- Reading the portfolio ----------------------------------------------

const clearinghouseSchema = z.object({
  assetPositions: z.array(
    z.object({
      position: z.object({
        coin: z.string(),
        szi: z.string(),
        entryPx: z.string().nullable().optional(),
        leverage: z.object({ value: z.number() }),
        liquidationPx: z.string().nullable().optional(),
        marginUsed: z.string(),
      }),
    })
  ),
})

const openOrdersSchema = z.array(
  z.object({
    coin: z.string(),
    side: z.enum(["B", "A"]),
    limitPx: z.string(),
    sz: z.string(),
    oid: z.number(),
    isTrigger: z.boolean(),
    triggerPx: z.string(),
    isPositionTpsl: z.boolean(),
    reduceOnly: z.boolean(),
    orderType: z.string(),
  })
)

/**
 * Everything one live wallet holds and has waiting, from the exchange's own
 * mouth. Position-protection trigger orders are folded INTO their position
 * as its stop and target rather than listed as orders — that is what they
 * are on screen.
 */
export async function fetchHyperliquidPortfolio(
  network: NetworkId,
  address: string
): Promise<WalletPortfolio> {
  const client = infoClient(network)
  const user = address as `0x${string}`
  const [clearinghouseRaw, ordersRaw] = await Promise.all([
    client.clearinghouseState({ user }),
    client.frontendOpenOrders({ user }),
  ])
  const clearinghouse = clearinghouseSchema.parse(clearinghouseRaw)
  const open = openOrdersSchema.parse(ordersRaw)

  const positions = new Map<string, WalletPosition>()
  for (const { position } of clearinghouse.assetPositions) {
    const szi = num(position.szi)
    if (szi === null || szi === 0) continue
    const entryPx = num(position.entryPx ?? "")
    const marginUsed = num(position.marginUsed)
    if (entryPx === null || marginUsed === null) {
      // A row that cannot be read fails the read — a wallet shown without one
      // of its positions would be a wrong answer dressed as a clean one.
      throw new Error("LIVE_UNREADABLE")
    }
    positions.set(position.coin, {
      marketId: position.coin,
      szi,
      entryPx,
      leverage: position.leverage.value,
      marginUsed,
      liquidationPx: position.liquidationPx ? num(position.liquidationPx) : null,
      tpPx: null,
      slPx: null,
      tpOrderId: null,
      slOrderId: null,
    })
  }

  const orders: WalletOpenOrder[] = []
  for (const order of open) {
    const position = positions.get(order.coin)
    if (order.isPositionTpsl && position) {
      const triggerPx = num(order.triggerPx)
      if (triggerPx === null) continue
      if (/take profit/i.test(order.orderType)) {
        position.tpPx = triggerPx
        position.tpOrderId = String(order.oid)
      } else {
        position.slPx = triggerPx
        position.slOrderId = String(order.oid)
      }
      continue
    }
    const px = order.isTrigger ? num(order.triggerPx) : num(order.limitPx)
    const sz = num(order.sz)
    if (px === null || sz === null) throw new Error("LIVE_UNREADABLE")
    orders.push({
      orderId: String(order.oid),
      marketId: order.coin,
      side: order.side === "B" ? "buy" : "sell",
      px,
      sz,
      reduceOnly: order.reduceOnly,
      trigger: order.isTrigger,
    })
  }

  return { positions: [...positions.values()], orders }
}
