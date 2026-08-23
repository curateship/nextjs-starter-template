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
import { num } from "@/lib/protocols/aster/translate"
import { fetchAsterPortfolio } from "@/server/protocols/aster/account"
import {
  asterPublic,
  asterSigned,
  parseAsterCredential,
  type AsterCredential,
} from "@/server/protocols/aster/client"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"

const orderSchema = z.object({
  orderId: z.union([z.string(), z.number()]),
  symbol: z.string(),
  side: z.string(),
  type: z.string(),
  status: z.string().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  avgPrice: z.union([z.string(), z.number()]).optional(),
  stopPrice: z.union([z.string(), z.number()]).optional(),
  origQty: z.union([z.string(), z.number()]).optional(),
  executedQty: z.union([z.string(), z.number()]).optional(),
  reduceOnly: z.boolean().optional(),
  closePosition: z.boolean().optional(),
})

const fillSchema = z.object({
  id: z.union([z.string(), z.number()]),
  orderId: z.union([z.string(), z.number()]),
  symbol: z.string(),
  side: z.string(),
  price: z.union([z.string(), z.number()]),
  qty: z.union([z.string(), z.number()]),
  realizedPnl: z.union([z.string(), z.number()]).optional(),
  commission: z.union([z.string(), z.number()]).optional(),
  time: z.union([z.string(), z.number()]),
})

const leverageCache = new Map<string, number>()
const marginModeCache = new Map<string, "cross" | "isolated">()
const knownSymbols = new Map<string, Set<string>>()
const MARKET_CAP = 0.03

function decimal(value: number): string {
  return value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 12,
  })
}

function credential(orderAuth: OrderAuth): AsterCredential {
  return parseAsterCredential(orderAuth.agentKey)
}

function account(orderAuth: OrderAuth): string {
  if (!orderAuth.accountAddress) throw new Error("LIVE_WALLET_KEY")
  return orderAuth.accountAddress
}

function remember(network: NetworkId, account: string, symbol: string): void {
  const key = `${network}:${account.toLowerCase()}`
  const held = knownSymbols.get(key) ?? new Set<string>()
  held.add(symbol)
  knownSymbols.set(key, held)
}

async function signed(
  network: NetworkId,
  orderAuth: OrderAuth,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  weight: number,
  params: Record<string, string | number>
): Promise<unknown> {
  return asterSigned(
    network,
    account(orderAuth),
    credential(orderAuth),
    method,
    path,
    weight,
    params
  )
}

async function setLeverage(
  network: NetworkId,
  orderAuth: OrderAuth,
  symbol: string,
  leverage: number
): Promise<void> {
  const asked = Math.max(1, Math.round(leverage))
  const key = `${network}:${account(orderAuth).toLowerCase()}:${symbol}`
  if (leverageCache.get(key) === asked) return
  try {
    await signed(network, orderAuth, "POST", "/fapi/v3/leverage", 1, {
      symbol,
      leverage: asked,
    })
    leverageCache.set(key, asked)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `LIVE_LEVERAGE:Aster could not set ${symbol} to ${asked}x, so nothing was ordered. (${reason})`
    )
  }
}

async function setMarginMode(
  network: NetworkId,
  orderAuth: OrderAuth,
  symbol: string,
  mode: "cross" | "isolated"
): Promise<void> {
  const key = `${network}:${account(orderAuth).toLowerCase()}:${symbol}`
  if (marginModeCache.get(key) === mode) return
  try {
    await signed(network, orderAuth, "POST", "/fapi/v3/marginType", 1, {
      symbol,
      marginType: mode === "cross" ? "CROSSED" : "ISOLATED",
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (!reason.startsWith("ASTER_MARGIN_UNCHANGED:")) {
      throw new Error(
        `LIVE_MARGIN_MODE:Aster could not switch ${symbol} to ${mode} margin, so nothing was ordered. (${reason})`
      )
    }
  }
  marginModeCache.set(key, mode)
}

async function orderById(
  network: NetworkId,
  orderAuth: OrderAuth,
  symbol: string,
  orderId: string
) {
  const answer = await signed(network, orderAuth, "GET", "/fapi/v3/order", 1, {
    symbol,
    orderId,
  })
  const parsed = orderSchema.safeParse(answer)
  return parsed.success ? parsed.data : null
}

async function placeRaw(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: Record<string, string | number>
) {
  const answer = await signed(
    network,
    orderAuth,
    "POST",
    "/fapi/v3/order",
    1,
    params
  )
  const parsed = orderSchema.safeParse(answer)
  if (!parsed.success) throw new Error("LIVE_UNREADABLE")
  return parsed.data
}

function protectionParams(input: {
  marketId: string
  long: boolean
  kind: "stop" | "target"
  triggerPx: number
  size: number | null
}): Record<string, string | number> {
  return {
    symbol: input.marketId,
    side: input.long ? "SELL" : "BUY",
    type: input.kind === "stop" ? "STOP_MARKET" : "TAKE_PROFIT_MARKET",
    stopPrice: decimal(input.triggerPx),
    workingType: "MARK_PRICE",
    ...(input.size === null
      ? { closePosition: "true" }
      : { quantity: decimal(input.size), reduceOnly: "true" }),
  }
}

export async function placeAsterOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: PlaceOrderParams
): Promise<PlaceOrderOutcome> {
  await assertRealMoneyAllowed(network)
  if (
    params.marginMode !== null &&
    params.marginMode !== undefined &&
    !params.reduceOnly
  ) {
    await setMarginMode(network, orderAuth, params.marketId, params.marginMode)
  }
  if (params.leverage !== null && !params.reduceOnly) {
    await setLeverage(network, orderAuth, params.marketId, params.leverage)
  }
  remember(network, account(orderAuth), params.marketId)

  const market = params.kind === "market"
  const orderPx = market
    ? params.px * (params.side === "buy" ? 1 + MARKET_CAP : 1 - MARKET_CAP)
    : params.px
  const placed = await placeRaw(network, orderAuth, {
    symbol: params.marketId,
    side: params.side.toUpperCase(),
    type: "LIMIT",
    quantity: decimal(params.sz),
    reduceOnly: String(params.reduceOnly),
    price: decimal(orderPx),
    timeInForce: params.kind === "postOnly" ? "GTX" : market ? "IOC" : "GTC",
  })

  const orderId = String(placed.orderId)
  let protection: PlaceOrderOutcome["protection"] = null
  let protectionNote: string | null = null
  if (params.tpPx !== null || params.slPx !== null) {
    const failures: string[] = []
    for (const kind of ["stop", "target"] as const) {
      const triggerPx = kind === "stop" ? params.slPx : params.tpPx
      if (triggerPx === null) continue
      try {
        await placeRaw(
          network,
          orderAuth,
          protectionParams({
            marketId: params.marketId,
            long: params.side === "buy",
            kind,
            triggerPx,
            size: null,
          })
        )
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
    protection = failures.length === 0 ? "ok" : "partial"
    protectionNote =
      failures.length === 0
        ? null
        : `The entry was placed, but Aster refused part of its protection (${failures.join("; ")}). Check the position now.`
  }

  const final =
    market || placed.status === "FILLED"
      ? await orderById(network, orderAuth, params.marketId, orderId).catch(
          () => placed
        )
      : placed
  const filledSz = num(final?.executedQty) ?? 0
  const avgPx = num(final?.avgPrice)
  const filled = final?.status === "FILLED" || (market && filledSz > 0)
  return {
    status: filled ? "filled" : "resting",
    orderId,
    avgPx: filled ? avgPx : null,
    filledSz: filled ? filledSz : null,
    protection,
    protectionNote,
  }
}

export async function cancelAsterOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; orderId: string }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  await signed(network, orderAuth, "DELETE", "/fapi/v3/order", 1, {
    symbol: params.marketId,
    orderId: params.orderId,
  })
}

export async function modifyAsterOrder(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: {
    marketId: string
    orderId: string
    side: "buy" | "sell"
    px: number
    sz: number
    reduceOnly: boolean
  }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  try {
    await signed(network, orderAuth, "PUT", "/fapi/v3/order", 1, {
      symbol: params.marketId,
      orderId: params.orderId,
      quantity: decimal(params.sz),
      price: decimal(params.px),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith("ASTER_ORDER_GONE:")) {
      throw new Error(
        "LIVE_ORDER_GONE:That order filled or was cancelled while it was being moved."
      )
    }
    throw error
  }
}

async function openOrders(
  network: NetworkId,
  account: string,
  credentialValue: AsterCredential,
  symbol?: string
) {
  const answer = await asterSigned(
    network,
    account,
    credentialValue,
    "GET",
    "/fapi/v3/openOrders",
    symbol ? 1 : 40,
    symbol ? { symbol } : {}
  )
  const rows = z.array(z.unknown()).safeParse(answer)
  if (!rows.success) throw new Error("LIVE_UNREADABLE")
  return rows.data.flatMap((raw) => {
    const parsed = orderSchema.safeParse(raw)
    return parsed.success ? [parsed.data] : []
  })
}

function attachOrders(
  base: WalletPortfolio,
  rows: Awaited<ReturnType<typeof openOrders>>
): WalletPortfolio {
  const positions = base.positions.map((position) => ({ ...position }))
  const orders: WalletOpenOrder[] = []
  for (const row of rows) {
    const type = row.type.toUpperCase()
    const target = type === "TAKE_PROFIT_MARKET"
    const stop = type === "STOP_MARKET"
    if (target || stop) {
      const position = positions.find((one) => one.marketId === row.symbol)
      if (!position) continue
      const triggerPx = num(row.stopPrice)
      if (triggerPx === null) continue
      if (target) {
        position.tpPx = triggerPx
        position.tpSz = row.closePosition ? null : num(row.origQty)
        position.tpOrderId = String(row.orderId)
      } else {
        position.slPx = triggerPx
        position.slOrderId = String(row.orderId)
      }
      continue
    }
    const px = num(row.price)
    const sz = num(row.origQty)
    if (px === null || sz === null) continue
    orders.push({
      orderId: String(row.orderId),
      marketId: row.symbol,
      side: row.side === "BUY" ? "buy" : "sell",
      px,
      sz,
      reduceOnly: row.reduceOnly ?? false,
      trigger: false,
    })
  }
  return { positions, orders }
}

export async function fetchAsterOrderPortfolio(
  network: NetworkId,
  address: string,
  credentialFn: () => string | null
): Promise<WalletPortfolio> {
  const blob = credentialFn()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parseAsterCredential(blob)
  const [base, rows] = await Promise.all([
    fetchAsterPortfolio(network, address, () => blob),
    openOrders(network, address, parsed),
  ])
  for (const row of rows) remember(network, address, row.symbol)
  for (const row of base.positions) remember(network, address, row.marketId)
  return attachOrders(base, rows)
}

export async function closeAsterPosition(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: { marketId: string; szi: number }
): Promise<{ avgPx: number | null; filledSz: number | null }> {
  await assertRealMoneyAllowed(network)
  const markAnswer = (await asterPublic(network, "/fapi/v3/premiumIndex", 1, {
    symbol: params.marketId,
  })) as { markPrice?: unknown }
  const mark = num(markAnswer.markPrice)
  if (mark === null || !(mark > 0)) throw new Error("LIVE_NO_PRICE")
  const placed = await placeRaw(network, orderAuth, {
    symbol: params.marketId,
    side: params.szi > 0 ? "SELL" : "BUY",
    type: "LIMIT",
    quantity: decimal(Math.abs(params.szi)),
    reduceOnly: "true",
    price: decimal(mark * (params.szi > 0 ? 1 - MARKET_CAP : 1 + MARKET_CAP)),
    timeInForce: "IOC",
  })
  const orderId = String(placed.orderId)
  const final = await orderById(
    network,
    orderAuth,
    params.marketId,
    orderId
  ).catch(() => placed)
  const filledSz = num(final?.executedQty)
  const fullyClosed =
    filledSz !== null &&
    filledSz + 1e-9 >= Math.abs(params.szi)
  if (fullyClosed) {
    const rows = await openOrders(
      network,
      account(orderAuth),
      credential(orderAuth),
      params.marketId
    )
    for (const row of rows) {
      if (!["STOP_MARKET", "TAKE_PROFIT_MARKET"].includes(row.type)) continue
      await cancelAsterOrder(network, orderAuth, {
        marketId: params.marketId,
        orderId: String(row.orderId),
      })
    }
  }
  return {
    avgPx: num(final?.avgPrice),
    filledSz,
  }
}

export async function setAsterBrackets(
  network: NetworkId,
  orderAuth: OrderAuth,
  params: {
    marketId: string
    position: Pick<WalletPosition, "szi" | "tpOrderId" | "slOrderId">
    tpPx: number | null
    tpSz: number | null
    slPx: number | null
  }
): Promise<void> {
  await assertRealMoneyAllowed(network)
  for (const orderId of [
    params.position.tpOrderId,
    params.position.slOrderId,
  ]) {
    if (!orderId) continue
    try {
      await cancelAsterOrder(network, orderAuth, {
        marketId: params.marketId,
        orderId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.startsWith("ASTER_ORDER_GONE:")) throw error
    }
  }
  const oldIds = [params.position.tpOrderId, params.position.slOrderId].filter(
    (id): id is string => id !== null
  )
  if (oldIds.length > 0) {
    const stillOpen = await openOrders(
      network,
      account(orderAuth),
      credential(orderAuth),
      params.marketId
    )
    if (stillOpen.some((row) => oldIds.includes(String(row.orderId)))) {
      throw new Error(
        "LIVE_EXCHANGE:Aster left the old stop or target open, so no replacement was sent."
      )
    }
  }
  const long = params.position.szi > 0
  let stopPlaced = false
  if (params.slPx !== null) {
    await placeRaw(
      network,
      orderAuth,
      protectionParams({
        marketId: params.marketId,
        long,
        kind: "stop",
        triggerPx: params.slPx,
        size: null,
      })
    )
    stopPlaced = true
  }
  if (params.tpPx !== null) {
    const whole =
      params.tpSz === null ||
      params.tpSz >= Math.abs(params.position.szi) * (1 - 1e-6)
    try {
      await placeRaw(
        network,
        orderAuth,
        protectionParams({
          marketId: params.marketId,
          long,
          kind: "target",
          triggerPx: params.tpPx,
          size: whole ? null : params.tpSz,
        })
      )
    } catch (error) {
      if (!stopPlaced) throw error
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`LIVE_TARGET_GONE:${reason}`)
    }
  }
}

export async function fetchAsterOrderFills(
  network: NetworkId,
  address: string,
  since: number,
  credentialFn: () => string | null
): Promise<WalletOrderFill[]> {
  const blob = credentialFn()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const parsed = parseAsterCredential(blob)
  const symbols = knownSymbols.get(`${network}:${address.toLowerCase()}`)
  if (!symbols || symbols.size === 0) return []
  const answers = await Promise.all(
    [...symbols].map((symbol) =>
      asterSigned(network, address, parsed, "GET", "/fapi/v3/userTrades", 5, {
        symbol,
        ...(since > 0 ? { startTime: since } : {}),
      })
    )
  )
  const fills: WalletOrderFill[] = []
  for (const answer of answers) {
    const rows = z.array(z.unknown()).safeParse(answer)
    if (!rows.success) continue
    for (const raw of rows.data) {
      const parsedFill = fillSchema.safeParse(raw)
      if (!parsedFill.success) continue
      const row = parsedFill.data
      const px = num(row.price)
      const sz = num(row.qty)
      const at = num(row.time)
      if (px === null || sz === null || at === null) continue
      const pnl = num(row.realizedPnl) ?? 0
      fills.push({
        fillId: String(row.id),
        orderId: String(row.orderId),
        marketId: row.symbol,
        side: row.side === "BUY" ? "buy" : "sell",
        px,
        sz,
        at,
        closedPnl: pnl,
        fee: num(row.commission) ?? 0,
        dir:
          pnl === 0
            ? row.side === "BUY"
              ? "Open long"
              : "Open short"
            : row.side === "BUY"
              ? "Close short"
              : "Close long",
        liquidation: false,
      })
    }
  }
  return fills.sort((a, b) => a.at - b.at)
}

export async function fetchAsterOrderInfo(
  network: NetworkId,
  address: string,
  orderId: string,
  marketId: string,
  credentialFn: () => string | null
): Promise<WalletOrderInfo> {
  const blob = credentialFn()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const answer = await asterSigned(
    network,
    address,
    parseAsterCredential(blob),
    "GET",
    "/fapi/v3/order",
    1,
    { symbol: marketId, orderId }
  )
  const parsed = orderSchema.safeParse(answer)
  if (!parsed.success) return { kind: "none", triggerPx: null }
  const type = parsed.data.type
  return {
    kind:
      type === "STOP_MARKET"
        ? "stop"
        : type === "TAKE_PROFIT_MARKET"
          ? "target"
          : "none",
    triggerPx: num(parsed.data.stopPrice),
  }
}

export function clearAsterOrderState(): void {
  leverageCache.clear()
  marginModeCache.clear()
  knownSymbols.clear()
}
