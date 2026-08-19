import { randomBytes } from "node:crypto"

import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid"
import { z } from "zod"

import type {
  NetworkId,
  OrderAuth,
  PlaceOrderOutcome,
  PlaceOrderParams,
  WalletOpenOrder,
  WalletOrderFill,
  WalletOrderInfo,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import {
  namespaceMarketId,
  num,
  roundOrderPx,
} from "@/lib/protocols/hyperliquid/translate"
import { infoClient } from "@/server/protocols/hyperliquid/client"
import {
  dropIdleWalletFeeds,
  marketsWalletHasMoneyOn,
  marketsWalletUses,
  walletFeedWarmingUp,
} from "@/server/protocols/hyperliquid/user-markets"
import {
  agentSigner,
  assertRealOrdersAllowed,
  scrubbedMessage,
} from "@/server/protocols/hyperliquid/signing"
import { fetchHyperliquidPrices } from "@/server/protocols/hyperliquid/prices"
import { assertRealMoneySwitchOn } from "@/server/trade/workers"

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
 * - **Sub-exchanges are first-class.** Orders place on them, and the
 *   portfolio read covers every market the wallet holds positions or money
 *   on — a resting order's margin counts as money, so an order is always
 *   readable on the market it was placed on.
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
 * Orders name assets by index, not by name — and the numbering covers every
 * venue: an asset on the main exchange is its position in the main list,
 * while one on a hosted venue is `100000 + venue's slot × 10000 + position`
 * (the exchange's own rule, mirrored by its SDK). Cached briefly per network;
 * the lists gain coins rarely and an order should not pay the round-trips
 * every time.
 */
const assetCache = new Map<
  NetworkId,
  {
    at: number
    /** How long this answer may serve — see `exchangeAssets`. */
    ttl: number
    byId: Map<string, { assetId: number; szDecimals: number }>
    /** Every venue's name, the main one first as "". */
    venues: string[]
  }
>()

const ASSET_CACHE_MS = 10 * 60_000
/**
 * A venue list with a hole in it must not stand for long: the portfolio
 * sweep walks these names, so a venue whose one meta call was dropped would
 * otherwise have its positions invisible for ten minutes.
 */
const PARTIAL_ASSET_CACHE_MS = 45_000

const metaSchema = z.object({
  universe: z.array(
    z.object({
      name: z.string(),
      szDecimals: z.number().int().min(0).max(12).optional(),
      isDelisted: z.boolean().optional(),
    })
  ),
})

const perpDexsSchema = z.array(
  z.union([z.null(), z.object({ name: z.string().min(1) })])
)

/** The exchange's asset-id rule, pure so the test can pin it down. */
export function venueAssetId(venueIndex: number, assetIndex: number): number {
  return venueIndex === 0 ? assetIndex : 100_000 + venueIndex * 10_000 + assetIndex
}

async function exchangeAssets(network: NetworkId) {
  const cached = assetCache.get(network)
  if (cached && Date.now() - cached.at < cached.ttl) return cached

  const client = infoClient(network)
  // Every market's asset list in ONE call, not one call per market.
  //
  // **This asked each of them in turn and it was ruinous.** Hyperliquid hosts
  // ten markets on the real network and two hundred and forty-nine on the
  // practice one, and asking each costs the same as twenty ordinary requests —
  // so one refresh of this cache spent about 5,000 of the 1,200 requests a
  // minute the exchange allows, in a single burst. Everything else the app
  // asked for in that minute came back refused, which read on screen as "the
  // exchange would not give a price for this coin". `allPerpMetas` returns the
  // same thing for every market at once and the market list already used it;
  // this is the same fix in the second place it was needed.
  const [rawDexs, rawMetas] = await Promise.all([
    client.perpDexs(),
    client.allPerpMetas(),
  ])
  const dexs = perpDexsSchema.parse(rawDexs)
  const allMetas = z.array(metaSchema).parse(rawMetas)
  if (allMetas.length !== dexs.length) {
    throw new Error("Hyperliquid metadata did not match its markets.")
  }
  const metas = dexs.map((dex, index) => ({
    index,
    name: dex?.name ?? "",
    meta: allMetas[index],
  }))

  const byId = new Map<string, { assetId: number; szDecimals: number }>()
  const venues: string[] = []
  for (const venue of metas) {
    if (!venue) continue
    venues.push(venue.name)
    venue.meta.universe.forEach((asset, index) => {
      // Delisted markets keep their slot — the INDEX is the id, so skipping
      // them here would not renumber anything, only hide them.
      byId.set(namespaceMarketId(venue.name, asset.name), {
        assetId: venueAssetId(venue.index, index),
        szDecimals: asset.szDecimals ?? 0,
      })
    })
  }
  const entry = {
    at: Date.now(),
    ttl: metas.some((venue) => venue === null)
      ? PARTIAL_ASSET_CACHE_MS
      : ASSET_CACHE_MS,
    byId,
    venues,
  }
  assetCache.set(network, entry)
  return entry
}

async function resolveAsset(network: NetworkId, marketId: string) {
  const { byId } = await exchangeAssets(network)
  const found = byId.get(marketId)
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

export function orderTimeInForce(
  kind: PlaceOrderParams["kind"]
): "Ioc" | "Gtc" | "Alo" {
  if (kind === "market") return "Ioc"
  if (kind === "postOnly") return "Alo"
  return "Gtc"
}

// ----- The signing client -------------------------------------------------

/**
 * Built per call and released with it — never cached, so the decrypted key's
 * life is the length of one request. See `signing.ts` for why.
 */
async function exchangeClient(network: NetworkId, auth: OrderAuth) {
  assertRealOrdersAllowed(network)
  // The Settings toggle sits behind that master lock: real money also has to
  // be switched on in the app itself. Checked here on the one path that
  // signs, so no screen and no future endpoint can route around it. Testnet
  // skips both layers, exactly as before.
  if (network !== "testnet") await assertRealMoneySwitchOn()
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
  // Whatever is cached is about to stop being true. The whole map rather than
  // one wallet, because an order call carries a signing key and not the
  // account address — and a cache of two entries is not worth being clever
  // about when the alternative is showing somebody a stale position.
  forgetHyperliquidPortfolios()
  const client = await exchangeClient(network, auth)
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
      t: {
        limit: {
          tif: orderTimeInForce(params.kind),
        },
      },
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
  //
  // Its own code, distinct from `LIVE_EXCHANGE`, because it carries a promise
  // the other cannot: the exchange processed our order and its own status for
  // it was a refusal, so NOTHING was placed or filled. `LIVE_EXCHANGE` also
  // wraps transport and parse failures, where an order may well have gone
  // through — acting on those as "nothing happened" is how money gets spent
  // twice. Only this code may ever be used to undo engine state.
  if (entryError !== null) throw new Error(`LIVE_ORDER_REFUSED:${entryError}`)

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
  // Whatever is cached is about to stop being true. The whole map rather than
  // one wallet, because an order call carries a signing key and not the
  // account address — and a cache of two entries is not worth being clever
  // about when the alternative is showing somebody a stale position.
  forgetHyperliquidPortfolios()
  const client = await exchangeClient(network, auth)
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

/**
 * Moves one resting real order to a new price, in place.
 *
 * The exchange's own modify action, not a cancel-and-place: the order keeps
 * its queue identity and there is no moment where the level is unprotected
 * because the old order died before the new one arrived. Size, side and
 * reduce-only are re-sent exactly as they are — the drag on the chart only
 * ever changes the price.
 */
export async function modifyHyperliquidOrder(
  network: NetworkId,
  auth: OrderAuth,
  params: {
    marketId: string
    orderId: string
    side: "buy" | "sell"
    px: number
    sz: number
    reduceOnly: boolean
  }
): Promise<void> {
  // Whatever is cached is about to stop being true — same rule as placing.
  forgetHyperliquidPortfolios()
  const client = await exchangeClient(network, auth)
  const asset = await resolveAsset(network, params.marketId)
  const oid = Number(params.orderId)
  if (!Number.isSafeInteger(oid) || oid <= 0) throw new Error("LIVE_ORDER_ID")

  try {
    await client.modify({
      oid,
      order: {
        a: asset.assetId,
        b: params.side === "buy",
        p: formatPx(params.px, asset.szDecimals),
        s: formatSize(params.sz, asset.szDecimals),
        r: params.reduceOnly,
        t: { limit: { tif: "Gtc" } },
        c: newCloid(),
      },
    })
  } catch (error) {
    throw exchangeError(error)
  }
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
    /** Coins the target sells; null sells the whole position. */
    tpSz: number | null
    slPx: number | null
  }
): Promise<void> {
  const client = await exchangeClient(network, auth)
  const asset = await resolveAsset(network, params.marketId)

  const isBuy = params.position.szi > 0
  const fullSz = formatSize(Math.abs(params.position.szi), asset.szDecimals)
  // A whole-position leg goes in as `positionTpsl`, which the exchange scales
  // with the position. A sized target must NOT — the exchange would grow it
  // back to the whole position — so it goes in as a plain reduce-only trigger
  // with its own fixed size, which the portfolio read already recognises as
  // the position's protection.
  const partialTp =
    params.tpSz !== null &&
    params.tpSz < Math.abs(params.position.szi) * (1 - 1e-6)
  // Every leg is made ready — size and price both — BEFORE the old legs are
  // cancelled below. `formatSize` and `formatPx` refuse a size or price this
  // market cannot take, and a refusal after the cancel would leave a real
  // position standing with no stop at all.
  const legs: Array<{
    tpsl: "tp" | "sl"
    px: string
    sz: string
    grouping: "positionTpsl" | "na"
  }> = [
    ...(params.tpPx !== null
      ? [
          {
            tpsl: "tp" as const,
            px: formatPx(params.tpPx, asset.szDecimals),
            sz: partialTp
              ? formatSize(params.tpSz ?? 0, asset.szDecimals)
              : fullSz,
            grouping: partialTp ? ("na" as const) : ("positionTpsl" as const),
          },
        ]
      : []),
    ...(params.slPx !== null
      ? [
          {
            tpsl: "sl" as const,
            px: formatPx(params.slPx, asset.szDecimals),
            sz: fullSz,
            grouping: "positionTpsl" as const,
          },
        ]
      : []),
  ]

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

  // Nothing wanted: the old legs are gone and that is the whole job.
  if (legs.length === 0) return

  // One call per grouping — the exchange takes one grouping per batch. The
  // stop's grouping goes first on purpose: it is the leg that matters if the
  // second call never lands.
  //
  // What has already landed is remembered so a refusal can say what is still
  // standing. "The position is UNPROTECTED" is the right thing to shout when
  // nothing went on, and the wrong thing when the stop is sitting there.
  const landed = new Set<"tp" | "sl">()
  for (const grouping of ["positionTpsl", "na"] as const) {
    const batch = legs.filter((leg) => leg.grouping === grouping)
    if (batch.length === 0) continue
    const stillOn = landed.has("sl") ? "LIVE_TARGET_GONE" : "LIVE_BRACKETS_GONE"
    let statuses: OrderStatus[]
    try {
      const response = await client.order({
        orders: batch.map((leg) => ({
          a: asset.assetId,
          b: !isBuy,
          p: leg.px,
          s: leg.sz,
          r: true,
          t: {
            trigger: {
              isMarket: true,
              triggerPx: leg.px,
              tpsl: leg.tpsl,
            },
          },
          c: newCloid(),
        })),
        grouping,
      })
      statuses = response.response.data.statuses as OrderStatus[]
    } catch (error) {
      throw new Error(`${stillOn}:${scrubbedMessage(error)}`)
    }

    // Every leg must stand — a short or failed list here means the position is
    // sitting with less protection than was just asked for.
    const failed = batch
      .map((_, index) => statusError(statuses[index]))
      .find((error) => error !== null)
    if (failed) throw new Error(`${stillOn}:${failed}`)
    for (const leg of batch) landed.add(leg.tpsl)
  }
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
 * A fill as the exchange reports it.
 *
 * `closedPnl`, `fee` and `dir` are the exchange's own accounting and are read
 * rather than worked out: the Journal's money column has to agree with the
 * account, and a subtraction of our own would not. They are optional here
 * because the testnet has been known to leave one out, and a missing figure
 * must not throw away the fill it belongs to — `num` turning it into null is
 * what the zeroes below are for.
 */
const fillSchema = z.object({
  coin: z.string(),
  px: z.string(),
  sz: z.string(),
  side: z.enum(["B", "A"]),
  time: z.number(),
  oid: z.number(),
  tid: z.union([z.number(), z.string()]),
  closedPnl: z.string().optional(),
  fee: z.string().optional(),
  dir: z.string().optional(),
  liquidation: z.unknown().optional(),
})

export async function fetchHyperliquidOrderFills(
  network: NetworkId,
  address: string,
  since: number
): Promise<WalletOrderFill[]> {
  const rows = await infoClient(network).userFillsByTime({
    user: address.toLowerCase() as `0x${string}`,
    startTime: Math.max(0, since),
  })
  return z.array(fillSchema).parse(rows).map((row) => {
    const px = num(row.px)
    const sz = num(row.sz)
    if (px === null || sz === null) throw new Error("LIVE_UNREADABLE")
    return {
      fillId: String(row.tid),
      orderId: String(row.oid),
      marketId: row.coin,
      side: row.side === "B" ? ("buy" as const) : ("sell" as const),
      px,
      sz,
      at: row.time,
      closedPnl: num(row.closedPnl ?? "0") ?? 0,
      fee: num(row.fee ?? "0") ?? 0,
      dir: row.dir ?? "",
      // The exchange sends an object here when it closed the position itself
      // and nothing at all when it did not, so its presence is the answer.
      liquidation: row.liquidation !== undefined && row.liquidation !== null,
    }
  })
}

/**
 * One order as the exchange still remembers it, long after it filled.
 *
 * `orderStatus` is the whole reason the Journal can say "stopped out" about a
 * trade from months ago. A stop firing arrives in the fill feed as a plain
 * sell; what makes it a stop is `orderType`, and this is the only place that
 * survives the order being gone.
 *
 * An order the exchange cannot find, or an answer it will not give, is "none"
 * rather than an error — the caller is filling in a history column, and a
 * blank there is a far smaller thing than a read that fails.
 */
const orderStatusSchema = z.object({
  status: z.string(),
  order: z
    .object({
      order: z.object({
        orderType: z.string(),
        triggerPx: z.string().optional(),
        isTrigger: z.boolean().optional(),
      }),
    })
    .optional(),
})

export async function fetchHyperliquidOrderInfo(
  network: NetworkId,
  address: string,
  orderId: string
): Promise<WalletOrderInfo> {
  const unknown: WalletOrderInfo = { kind: "none", triggerPx: null }
  const oid = Number(orderId)
  if (!Number.isSafeInteger(oid) || oid <= 0) return unknown

  let raw: unknown
  try {
    raw = await infoClient(network).orderStatus({
      user: address.toLowerCase() as `0x${string}`,
      oid,
    })
  } catch {
    return unknown
  }

  const parsed = orderStatusSchema.safeParse(raw)
  if (!parsed.success || parsed.data.status !== "order" || !parsed.data.order) {
    return unknown
  }

  const order = parsed.data.order.order
  const kind = /take profit/i.test(order.orderType)
    ? ("target" as const)
    : /stop/i.test(order.orderType)
      ? ("stop" as const)
      : ("none" as const)

  // Zeroed once an order has triggered, which is exactly when this is asked.
  // Null then, rather than a price of nothing drawn across the chart.
  const triggerPx = num(order.triggerPx ?? "")
  return { kind, triggerPx: triggerPx && triggerPx > 0 ? triggerPx : null }
}

/**
 * Which venues each wallet actually uses, so the four-second poll does not
 * ask ten venues about an account that lives on two. A full sweep of every
 * venue runs once a minute (and on the first look); the polls between read
 * the main venue plus the remembered ones. The exchange rations requests,
 * and this is what keeps a poll inside the ration. A position opened on a
 * NEW venue from outside this app shows up within the minute.
 */
const ACTIVE_VENUES_MS = 60_000
const activeVenues = new Map<string, { at: number; names: string[] }>()

/**
 * Everything one live wallet holds and has waiting — on every venue the
 * exchange hosts, from the exchange's own mouth. Market ids come back
 * namespaced ("xyz:IBM") exactly as the market list names them, so a row's
 * click lands on its own chart. Position-protection trigger orders are
 * folded INTO their position as its stop and target rather than listed as
 * orders — that is what they are on screen.
 */
/**
 * How long one portfolio read stands in for the next, in ms.
 *
 * **Because several things ask the same question at once.** The browser polls
 * every four seconds, the ladder worker looks every second, and the smart-order
 * reconciler asks again on top — each making its own pair of calls for the same
 * wallet. Measured at fifty-one `frontendOpenOrders` in thirty seconds, which
 * is 1,020 of the 1,200 request-weight a minute the exchange allows, before the
 * chart had asked for a single candle.
 *
 * **Four seconds, matching the screen's own poll.** Nothing here needs to be
 * fresher than that: the browser already draws positions and orders on a
 * four-second beat, so this makes no figure staler than it has always been. It
 * is deliberately not longer — the engine decides real things from these
 * numbers, and a position closed on the exchange should not stay on screen, or
 * in the engine's head, for longer than somebody would already expect.
 *
 * An order placed or cancelled throws the whole cache away, so the one moment
 * it certainly matters is never served from memory.
 */
const PORTFOLIO_CACHE_MS = 4_000

const portfolioCache = new Map<
  string,
  { at: number; answer: Promise<WalletPortfolio> }
>()

export async function fetchHyperliquidPortfolio(
  network: NetworkId,
  address: string
): Promise<WalletPortfolio> {
  const cacheKey = `${network}:${address.toLowerCase()}`
  const cached = portfolioCache.get(cacheKey)
  if (cached && Date.now() - cached.at < PORTFOLIO_CACHE_MS) {
    return cached.answer
  }
  const at = Date.now()
  const answer = readHyperliquidPortfolio(network, address)
  // A failed read is never remembered as an answer — one refusal would
  // otherwise be repeated to every caller for the next two seconds.
  answer.catch(() => {
    if (portfolioCache.get(cacheKey)?.at === at) portfolioCache.delete(cacheKey)
  })
  portfolioCache.set(cacheKey, { at, answer })
  return answer
}

/** Forget every wallet's figures, because something just changed them. */
export function forgetHyperliquidPortfolios(): void {
  portfolioCache.clear()
}

async function readHyperliquidPortfolio(
  network: NetworkId,
  address: string
): Promise<WalletPortfolio> {
  const client = infoClient(network)
  const user = address.toLowerCase() as `0x${string}`

  const { venues } = await exchangeAssets(network)
  const rememberKey = `${network}:${user}`
  const remembered = activeVenues.get(rememberKey)

  // What the exchange itself says this wallet is using, pushed over a socket.
  //
  // **This is what stops the sweep below being ruinous.** Hyperliquid hosts one
  // market for coins plus however many others people have opened — ten on the
  // real network and two hundred and forty-nine on the practice one — and there
  // is no way to ask all of them at once. Asking each in turn cost about 5,500
  // of the 1,200 requests a minute the exchange allows, so the app spent its
  // entire allowance discovering markets this wallet has never touched and had
  // nothing left to ask a price with. The socket answers the same question for
  // free, and sooner.
  const held = marketsWalletUses(network, user)
  // Money counts as using a market, not only positions. A resting order is
  // not a position, but its margin is money sitting on that market — and a
  // wallet whose only xyz activity was five resting buys read as "not using
  // xyz", so the read below skipped xyz and the orders never showed anywhere
  // in the app. Placing looked broken; the placing was fine, the reading was
  // blind.
  const moneyOn = marketsWalletHasMoneyOn(network, user)
  const told =
    held === null && moneyOn === null
      ? null
      : [...new Set([...(held ?? []), ...(moneyOn ?? [])])]

  // Never sweep while the feed is warming up. A fresh server always starts
  // cold, and sweeping every market the exchange hosts on boot was five
  // hundred calls in the first half minute — the app rate-limited itself on
  // every restart. The feed's first push lands within seconds; until it does,
  // the main market plus whatever was remembered is the honest read.
  const sweeping =
    told === null &&
    !walletFeedWarmingUp(network, user) &&
    (!remembered || Date.now() - remembered.at >= ACTIVE_VENUES_MS)

  // Told, remembered, or — only when neither can say — every market there is.
  const names = told
    ? [...new Set(["", ...told, ...(remembered?.names ?? [])])]
    : sweeping
      ? venues
      : ["", ...(remembered?.names ?? []).filter((name) => name !== "")]

  const reads = await Promise.all(
    names.map(async (dex) => {
      const [clearinghouseRaw, ordersRaw] = await Promise.all([
        client.clearinghouseState({ user, dex }),
        client.frontendOpenOrders({ user, dex }),
      ])
      return {
        dex,
        clearinghouse: clearinghouseSchema.parse(clearinghouseRaw),
        open: openOrdersSchema.parse(ordersRaw),
      }
    })
  )

  const positions = new Map<string, WalletPosition>()
  const openAcrossVenues: Array<{ dex: string; order: z.infer<typeof openOrdersSchema>[number] }> = []
  const used = new Set<string>()
  for (const read of reads) {
    if (read.clearinghouse.assetPositions.length > 0 || read.open.length > 0) {
      used.add(read.dex)
    }
    for (const { position } of read.clearinghouse.assetPositions) {
      const szi = num(position.szi)
      if (szi === null || szi === 0) continue
      const entryPx = num(position.entryPx ?? "")
      const marginUsed = num(position.marginUsed)
      if (entryPx === null || marginUsed === null) {
        // A row that cannot be read fails the read — a wallet shown without
        // one of its positions would be a wrong answer dressed as a clean one.
        throw new Error("LIVE_UNREADABLE")
      }
      const marketId = namespaceMarketId(read.dex, position.coin)
      positions.set(marketId, {
        marketId,
        szi,
        entryPx,
        leverage: position.leverage.value,
        marginUsed,
        liquidationPx: position.liquidationPx ? num(position.liquidationPx) : null,
        tpPx: null,
        tpSz: null,
        slPx: null,
        tpOrderId: null,
        slOrderId: null,
      })
    }
    for (const order of read.open) {
      openAcrossVenues.push({ dex: read.dex, order })
    }
  }
  if (sweeping || told) {
    activeVenues.set(rememberKey, { at: Date.now(), names: [...used] })
  }
  // Feeds for wallets nothing is looking at any more are let go here rather
  // than on a timer of their own, which would keep this module alive in a
  // process that has finished with it.
  dropIdleWalletFeeds()

  const orders: WalletOpenOrder[] = []
  for (const { dex, order: rawOrder } of openAcrossVenues) {
    const order = { ...rawOrder, coin: namespaceMarketId(dex, rawOrder.coin) }
    const position = positions.get(order.coin)
    // A reduce-only trigger on a held market IS its protection, whichever
    // flavour the exchange filed it under: `positionTpsl` legs scale with the
    // position, while brackets placed WITH an entry come back as fixed-size
    // triggers with that flag off. Both are the stop/target the screens draw
    // and the drag replaces. First one per slot; an extra stays an order row
    // rather than being hidden.
    if (position && order.isTrigger && order.reduceOnly) {
      const triggerPx = num(order.triggerPx)
      if (triggerPx === null) continue
      const isTakeProfit = /take profit/i.test(order.orderType)
      if (isTakeProfit && position.tpPx === null) {
        position.tpPx = triggerPx
        position.tpOrderId = String(order.oid)
        // A leg smaller than the position is a partial target and its size
        // matters; one that matches (or a position-scaled leg reported as 0)
        // sells everything, which null already says.
        const legSz = num(order.sz)
        position.tpSz =
          legSz !== null && legSz > 0 && legSz < Math.abs(position.szi) * (1 - 1e-6)
            ? legSz
            : null
        continue
      }
      if (!isTakeProfit && position.slPx === null) {
        position.slPx = triggerPx
        position.slOrderId = String(order.oid)
        continue
      }
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
