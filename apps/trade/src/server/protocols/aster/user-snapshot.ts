import { z } from "zod"

import type {
  NetworkId,
  WalletAccountFigures,
  WalletOpenOrder,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/aster/translate"

const accountEventSchema = z.object({
  e: z.literal("ACCOUNT_UPDATE"),
  E: z.union([z.string(), z.number()]),
  a: z.object({
    B: z
      .array(
        z.object({
          a: z.string(),
          wb: z.union([z.string(), z.number()]),
          bc: z.union([z.string(), z.number()]),
        })
      )
      .default([]),
    P: z
      .array(
        z.object({
          s: z.string(),
          pa: z.union([z.string(), z.number()]),
          ep: z.union([z.string(), z.number()]),
          up: z.union([z.string(), z.number()]),
          mt: z.string(),
          iw: z.union([z.string(), z.number()]),
          ps: z.string(),
        })
      )
      .default([]),
  }),
})

const orderEventSchema = z.object({
  e: z.literal("ORDER_TRADE_UPDATE"),
  E: z.union([z.string(), z.number()]),
  o: z.object({
    s: z.string(),
    S: z.enum(["BUY", "SELL"]),
    o: z.string().optional(),
    ot: z.string().optional(),
    q: z.union([z.string(), z.number()]).optional(),
    p: z.union([z.string(), z.number()]).optional(),
    sp: z.union([z.string(), z.number()]).optional(),
    x: z.string(),
    X: z.enum([
      "NEW",
      "PARTIALLY_FILLED",
      "FILLED",
      "CANCELED",
      "EXPIRED",
      "NEW_INSURANCE",
      "NEW_ADL",
    ]),
    i: z.union([z.string(), z.number()]),
    t: z.union([z.string(), z.number()]).optional(),
    rp: z.union([z.string(), z.number()]).optional(),
    n: z.union([z.string(), z.number()]).optional(),
    R: z.boolean().optional(),
    cp: z.boolean().optional(),
  }),
})

const configEventSchema = z.object({
  e: z.literal("ACCOUNT_CONFIG_UPDATE"),
  E: z.union([z.string(), z.number()]),
  ac: z
    .object({
      s: z.string(),
      l: z.union([z.string(), z.number()]),
    })
    .optional(),
})

type StreamEvent =
  | z.infer<typeof accountEventSchema>
  | z.infer<typeof orderEventSchema>
  | z.infer<typeof configEventSchema>

type QueuedEvent = {
  at: number
  sequence: number
  event: StreamEvent
}

type Snapshot = {
  healthy: boolean
  recoveryVersion: number
  accountNeedsRecovery: boolean
  portfolioNeedsRecovery: boolean
  figures: WalletAccountFigures | null
  portfolio: WalletPortfolio | null
  walletBalance: number | null
  balanceByAsset: Map<string, number>
  profitByMarket: Map<string, number>
  leverageByMarket: Map<string, number>
  orderMarginById: Map<string, number>
  unattributedMargin: number
  unattachedProtection: Map<string, PushedOrder>
  lastAccountByKey: Map<string, Pick<QueuedEvent, "at" | "sequence">>
  lastPortfolioByKey: Map<string, Pick<QueuedEvent, "at" | "sequence">>
  pendingAccount: QueuedEvent[]
  pendingPortfolio: QueuedEvent[]
  accountOverflow: boolean
  portfolioOverflow: boolean
  sequence: number
}

type PushedOrder = {
  orderId: string
  marketId: string
  side: "buy" | "sell"
  type: string
  px: number
  sz: number
  stopPx: number | null
  reduceOnly: boolean
  closePosition: boolean
}

const snapshots = new Map<string, Snapshot>()
const MAX_PENDING_EVENTS = 2_000

function keyFor(network: NetworkId, address: string): string {
  return `${network}:${address.toLowerCase()}`
}

function snapshotFor(network: NetworkId, address: string): Snapshot {
  const key = keyFor(network, address)
  let snapshot = snapshots.get(key)
  if (!snapshot) {
    snapshot = {
      healthy: false,
      recoveryVersion: 0,
      accountNeedsRecovery: true,
      portfolioNeedsRecovery: true,
      figures: null,
      portfolio: null,
      walletBalance: null,
      balanceByAsset: new Map(),
      profitByMarket: new Map(),
      leverageByMarket: new Map(),
      orderMarginById: new Map(),
      unattributedMargin: 0,
      unattachedProtection: new Map(),
      lastAccountByKey: new Map(),
      lastPortfolioByKey: new Map(),
      pendingAccount: [],
      pendingPortfolio: [],
      accountOverflow: false,
      portfolioOverflow: false,
      sequence: 0,
    }
    snapshots.set(key, snapshot)
  }
  return snapshot
}

function clonePosition(position: WalletPosition): WalletPosition {
  return {
    ...position,
    targets: position.targets.map((target) => ({ ...target })),
    protectionOrderIds: [...position.protectionOrderIds],
  }
}

function clonePortfolio(portfolio: WalletPortfolio): WalletPortfolio {
  return {
    positions: portfolio.positions.map(clonePosition),
    orders: portfolio.orders.map((order) => ({ ...order })),
  }
}

function parseEvent(message: unknown): Omit<QueuedEvent, "sequence"> | null {
  for (const schema of [
    accountEventSchema,
    orderEventSchema,
    configEventSchema,
  ] as const) {
    const parsed = schema.safeParse(message)
    if (!parsed.success) continue
    const at = num(parsed.data.E)
    if (at === null || at < 0) return null
    return { at, event: parsed.data as StreamEvent }
  }
  return null
}

function newerThan(
  queued: QueuedEvent,
  last: Pick<QueuedEvent, "at" | "sequence"> | null
): boolean {
  if (!last) return true
  return queued.at > last.at ||
    (queued.at === last.at && queued.sequence > last.sequence)
}

function claim(
  stamps: Map<string, Pick<QueuedEvent, "at" | "sequence">>,
  key: string,
  queued: QueuedEvent
): boolean {
  if (!newerThan(queued, stamps.get(key) ?? null)) return false
  stamps.set(key, queued)
  return true
}

function trimPending(events: QueuedEvent[]): boolean {
  if (events.length > MAX_PENDING_EVENTS) {
    events.splice(0, events.length - MAX_PENDING_EVENTS)
    return true
  }
  return false
}

function refreshFigures(snapshot: Snapshot): void {
  if (!snapshot.figures || snapshot.walletBalance === null) return
  const openProfit = [...snapshot.profitByMarket.values()].reduce(
    (total, value) => total + value,
    0
  )
  const positionMargin =
    snapshot.portfolio?.positions.reduce(
      (total, position) => total + Math.max(0, position.marginUsed),
      0
    ) ?? snapshot.figures.inTrades
  const orderMargin = [...snapshot.orderMarginById.values()].reduce(
    (total, value) => total + value,
    0
  )
  const inTrades = positionMargin + orderMargin + snapshot.unattributedMargin
  const equity = snapshot.walletBalance + openProfit
  snapshot.figures = {
    equity,
    openProfit,
    inTrades,
    free: Math.max(0, equity - inTrades),
  }
}

function emptyPosition(
  marketId: string,
  szi: number,
  entryPx: number,
  leverage: number,
  marginUsed: number
): WalletPosition {
  return {
    marketId,
    szi,
    entryPx,
    leverage,
    marginUsed,
    liquidationPx: null,
    targets: [],
    tpPx: null,
    tpSz: null,
    slPx: null,
    tpOrderId: null,
    slOrderId: null,
    protectionOrderIds: [],
  }
}

function syncFirstTarget(position: WalletPosition): void {
  position.targets.sort((left, right) => left.px - right.px)
  const first = position.targets[0] ?? null
  position.tpPx = first?.px ?? null
  position.tpSz = first?.sz ?? null
  position.tpOrderId = first?.orderId ?? null
}

function removeProtection(position: WalletPosition, orderId: string): void {
  position.protectionOrderIds = position.protectionOrderIds.filter(
    (id) => id !== orderId
  )
  position.targets = position.targets.filter(
    (target) => target.orderId !== orderId
  )
  if (position.slOrderId === orderId) {
    position.slOrderId = null
    position.slPx = null
  }
  syncFirstTarget(position)
}

function attachProtection(position: WalletPosition, order: PushedOrder): void {
  removeProtection(position, order.orderId)
  position.protectionOrderIds.push(order.orderId)
  if (order.type === "TAKE_PROFIT_MARKET" && order.stopPx !== null) {
    position.targets.push({
      px: order.stopPx,
      sz: order.closePosition ? null : order.sz,
      orderId: order.orderId,
    })
    syncFirstTarget(position)
  } else if (order.type === "STOP_MARKET" && order.stopPx !== null) {
    position.slPx = order.stopPx
    position.slOrderId = order.orderId
  }
}

function pushedOrderOf(event: z.infer<typeof orderEventSchema>): PushedOrder | null {
  const row = event.o
  const type = (row.ot ?? row.o ?? "").toUpperCase()
  const protection =
    type === "STOP_MARKET" || type === "TAKE_PROFIT_MARKET"
  const px = num(row.p)
  const sz = num(row.q)
  const stopPx = num(row.sp)
  if (
    sz === null ||
    sz < 0 ||
    (!protection && (!(sz > 0) || px === null || !(px > 0))) ||
    (protection && (stopPx === null || !(stopPx > 0)))
  ) {
    return null
  }
  return {
    orderId: String(row.i),
    marketId: row.s,
    side: row.S === "BUY" ? "buy" : "sell",
    type,
    px: px ?? 0,
    sz,
    stopPx,
    reduceOnly: row.R ?? false,
    closePosition: row.cp ?? false,
  }
}

function applyAccount(snapshot: Snapshot, queued: QueuedEvent): void {
  const event = queued.event
  if (event.e !== "ACCOUNT_UPDATE") return
  for (const balance of event.a.B) {
    const key = `balance:${balance.a}`
    if (!claim(snapshot.lastAccountByKey, key, queued)) continue
    const walletBalance = num(balance.wb)
    const previous = snapshot.balanceByAsset.get(balance.a)
    if (walletBalance === null || previous === undefined) {
      snapshot.accountNeedsRecovery = true
      continue
    }
    snapshot.balanceByAsset.set(balance.a, walletBalance)
    if (snapshot.walletBalance !== null) {
      snapshot.walletBalance += walletBalance - previous
    }
  }
  for (const row of event.a.P) {
    if (!claim(snapshot.lastAccountByKey, `profit:${row.s}`, queued)) continue
    const szi = num(row.pa)
    const profit = num(row.up)
    if (szi === null || profit === null) {
      snapshot.accountNeedsRecovery = true
      continue
    }
    if (szi === 0) snapshot.profitByMarket.delete(row.s)
    else snapshot.profitByMarket.set(row.s, profit)
  }
  refreshFigures(snapshot)
}

function applyAccountPositions(
  snapshot: Snapshot,
  event: z.infer<typeof accountEventSchema>,
  queued: QueuedEvent
): void {
  if (!snapshot.portfolio) return
  for (const row of event.a.P) {
    if (!claim(snapshot.lastPortfolioByKey, `position:${row.s}`, queued)) {
      continue
    }
    if (row.ps !== "BOTH") {
      snapshot.portfolioNeedsRecovery = true
      continue
    }
    const szi = num(row.pa)
    const entryPx = num(row.ep)
    const isolatedMargin = num(row.iw)
    if (szi === null || entryPx === null || isolatedMargin === null) {
      snapshot.portfolioNeedsRecovery = true
      continue
    }
    const index = snapshot.portfolio.positions.findIndex(
      (position) => position.marketId === row.s
    )
    if (szi === 0) {
      if (index >= 0) snapshot.portfolio.positions.splice(index, 1)
      continue
    }
    const current = index >= 0 ? snapshot.portfolio.positions[index] : null
    const leverage = snapshot.leverageByMarket.get(row.s) ?? current?.leverage
    if (!leverage || leverage <= 0) {
      snapshot.portfolioNeedsRecovery = true
      continue
    }
    const marginUsed =
      row.mt.toLowerCase() === "isolated"
        ? isolatedMargin
        : Math.abs((szi * entryPx) / leverage)
    const next = current
      ? {
          ...clonePosition(current),
          szi,
          entryPx,
          leverage,
          marginUsed,
          liquidationPx:
            current.szi === szi && current.entryPx === entryPx
              ? current.liquidationPx
              : null,
        }
      : emptyPosition(row.s, szi, entryPx, leverage, marginUsed)
    if (index >= 0) snapshot.portfolio.positions[index] = next
    else snapshot.portfolio.positions.push(next)

    for (const order of snapshot.unattachedProtection.values()) {
      if (order.marketId !== row.s) continue
      attachProtection(next, order)
      snapshot.unattachedProtection.delete(order.orderId)
    }
  }
}

function applyOrder(snapshot: Snapshot, event: z.infer<typeof orderEventSchema>): void {
  if (!snapshot.portfolio) return
  const open = event.o.X === "NEW" || event.o.X === "PARTIALLY_FILLED"
  const orderId = String(event.o.i)

  snapshot.portfolio = {
    ...snapshot.portfolio,
    orders: snapshot.portfolio.orders.filter(
      (current) => current.orderId !== orderId
    ),
  }
  for (const position of snapshot.portfolio.positions) {
    removeProtection(position, orderId)
  }
  snapshot.unattachedProtection.delete(orderId)
  snapshot.orderMarginById.delete(orderId)
  if (!open) return

  const order = pushedOrderOf(event)
  if (!order) {
    snapshot.portfolioNeedsRecovery = true
    return
  }
  const protection =
    order.type === "STOP_MARKET" || order.type === "TAKE_PROFIT_MARKET"
  if (protection) {
    const position = snapshot.portfolio.positions.find(
      (current) => current.marketId === order.marketId
    )
    if (position) attachProtection(position, order)
    else snapshot.unattachedProtection.set(order.orderId, order)
    return
  }

  const pushed: WalletOpenOrder = {
    orderId: order.orderId,
    marketId: order.marketId,
    side: order.side,
    px: order.px,
    sz: order.sz,
    reduceOnly: order.reduceOnly,
    trigger: false,
  }
  snapshot.portfolio = {
    ...snapshot.portfolio,
    orders: [...snapshot.portfolio.orders, pushed],
  }
  const leverage = snapshot.leverageByMarket.get(order.marketId)
  if (leverage && leverage > 0) {
    snapshot.orderMarginById.set(
      order.orderId,
      Math.abs((order.px * order.sz) / leverage)
    )
  }
}

function applyPortfolio(snapshot: Snapshot, queued: QueuedEvent): void {
  const event = queued.event
  if (event.e === "ACCOUNT_UPDATE") {
    applyAccountPositions(snapshot, event, queued)
  }
  if (
    event.e === "ORDER_TRADE_UPDATE" &&
    claim(snapshot.lastPortfolioByKey, `order:${event.o.i}`, queued)
  ) {
    applyOrder(snapshot, event)
  }
  if (event.e === "ACCOUNT_CONFIG_UPDATE" && event.ac) {
    if (!claim(snapshot.lastPortfolioByKey, `config:${event.ac.s}`, queued)) {
      return
    }
    const leverage = num(event.ac.l)
    if (leverage === null || leverage <= 0) {
      snapshot.accountNeedsRecovery = true
      snapshot.portfolioNeedsRecovery = true
      return
    }
    snapshot.leverageByMarket.set(event.ac.s, leverage)
    snapshot.accountNeedsRecovery = true
    snapshot.portfolioNeedsRecovery = true
  }
  refreshFigures(snapshot)
}

function replay(
  pending: QueuedEvent[],
  apply: (queued: QueuedEvent) => void
): void {
  pending
    .sort((left, right) => left.at - right.at || left.sequence - right.sequence)
    .forEach(apply)
  pending.length = 0
}

export function markAsterSnapshotConnected(
  network: NetworkId,
  address: string
): void {
  const snapshot = snapshotFor(network, address)
  snapshot.healthy = true
  snapshot.recoveryVersion += 1
  snapshot.accountNeedsRecovery = true
  snapshot.portfolioNeedsRecovery = true
}

export function markAsterSnapshotDisconnected(
  network: NetworkId,
  address: string
): void {
  const snapshot = snapshotFor(network, address)
  snapshot.healthy = false
  snapshot.recoveryVersion += 1
  snapshot.accountNeedsRecovery = true
  snapshot.portfolioNeedsRecovery = true
}

export function markAsterSnapshotNeedsRecovery(
  network: NetworkId,
  address: string
): void {
  const snapshot = snapshotFor(network, address)
  snapshot.recoveryVersion += 1
  snapshot.accountNeedsRecovery = true
  snapshot.portfolioNeedsRecovery = true
}

export function asterAccountNeedsRecovery(
  network: NetworkId,
  address: string
): boolean {
  const snapshot = snapshots.get(keyFor(network, address))
  return Boolean(snapshot?.healthy && snapshot.accountNeedsRecovery)
}

export function asterPortfolioNeedsRecovery(
  network: NetworkId,
  address: string
): boolean {
  const snapshot = snapshots.get(keyFor(network, address))
  return Boolean(snapshot?.healthy && snapshot.portfolioNeedsRecovery)
}

export function asterSnapshotRecoveryVersion(
  network: NetworkId,
  address: string
): number {
  return snapshotFor(network, address).recoveryVersion
}

export function readAsterPushedAccount(
  network: NetworkId,
  address: string
): WalletAccountFigures | null {
  const snapshot = snapshots.get(keyFor(network, address))
  if (!snapshot?.healthy || snapshot.accountNeedsRecovery || !snapshot.figures) {
    return null
  }
  return { ...snapshot.figures }
}

export function readAsterPushedPortfolio(
  network: NetworkId,
  address: string
): WalletPortfolio | null {
  const snapshot = snapshots.get(keyFor(network, address))
  if (
    !snapshot?.healthy ||
    snapshot.portfolioNeedsRecovery ||
    !snapshot.portfolio
  ) {
    return null
  }
  return clonePortfolio(snapshot.portfolio)
}

export function primeAsterAccountSnapshot(
  network: NetworkId,
  address: string,
  input: {
    figures: WalletAccountFigures
    balanceByAsset: ReadonlyMap<string, number>
    profitByMarket: ReadonlyMap<string, number>
  },
  recoveryVersion = asterSnapshotRecoveryVersion(network, address)
): void {
  const snapshot = snapshotFor(network, address)
  if (recoveryVersion !== snapshot.recoveryVersion) return
  snapshot.figures = { ...input.figures }
  snapshot.walletBalance = input.figures.equity - input.figures.openProfit
  snapshot.balanceByAsset = new Map(input.balanceByAsset)
  snapshot.profitByMarket = new Map(input.profitByMarket)
  snapshot.accountNeedsRecovery = false
  snapshot.lastAccountByKey.clear()
  replay(snapshot.pendingAccount, (queued) => applyAccount(snapshot, queued))
  snapshot.accountNeedsRecovery ||= snapshot.accountOverflow
  snapshot.accountOverflow = false
}

export function primeAsterPortfolioSnapshot(
  network: NetworkId,
  address: string,
  portfolio: WalletPortfolio,
  recoveryVersion = asterSnapshotRecoveryVersion(network, address)
): void {
  const snapshot = snapshotFor(network, address)
  if (recoveryVersion !== snapshot.recoveryVersion) return
  snapshot.portfolio = clonePortfolio(portfolio)
  snapshot.unattachedProtection.clear()
  for (const position of portfolio.positions) {
    snapshot.leverageByMarket.set(position.marketId, position.leverage)
  }
  const positionMargin = portfolio.positions.reduce(
    (total, position) => total + Math.max(0, position.marginUsed),
    0
  )
  snapshot.orderMarginById.clear()
  for (const order of portfolio.orders) {
    const leverage = snapshot.leverageByMarket.get(order.marketId)
    if (!leverage || leverage <= 0) continue
    snapshot.orderMarginById.set(
      order.orderId,
      Math.abs((order.px * order.sz) / leverage)
    )
  }
  const knownOrderMargin = [...snapshot.orderMarginById.values()].reduce(
    (total, value) => total + value,
    0
  )
  snapshot.unattributedMargin = Math.max(
    0,
    (snapshot.figures?.inTrades ?? 0) - positionMargin - knownOrderMargin
  )
  snapshot.portfolioNeedsRecovery = false
  snapshot.lastPortfolioByKey.clear()
  replay(snapshot.pendingPortfolio, (queued) =>
    applyPortfolio(snapshot, queued)
  )
  snapshot.portfolioNeedsRecovery ||= snapshot.portfolioOverflow
  snapshot.portfolioOverflow = false
}

export function rememberAsterLeverage(
  network: NetworkId,
  address: string,
  marketId: string,
  leverage: number
): void {
  const snapshot = snapshotFor(network, address)
  snapshot.leverageByMarket.set(marketId, leverage)
  for (const order of snapshot.portfolio?.orders ?? []) {
    if (order.marketId !== marketId) continue
    snapshot.orderMarginById.set(
      order.orderId,
      Math.abs((order.px * order.sz) / leverage)
    )
  }
}

export function applyAsterUserEvent(
  network: NetworkId,
  address: string,
  message: unknown
): boolean {
  const parsed = parseEvent(message)
  if (!parsed) return false
  const snapshot = snapshotFor(network, address)
  const queued: QueuedEvent = {
    ...parsed,
    sequence: (snapshot.sequence += 1),
  }

  if (snapshot.accountNeedsRecovery || !snapshot.figures) {
    snapshot.pendingAccount.push(queued)
    if (trimPending(snapshot.pendingAccount)) snapshot.accountOverflow = true
  } else {
    applyAccount(snapshot, queued)
  }

  if (snapshot.portfolioNeedsRecovery || !snapshot.portfolio) {
    snapshot.pendingPortfolio.push(queued)
    if (trimPending(snapshot.pendingPortfolio)) {
      snapshot.portfolioOverflow = true
    }
  } else {
    applyPortfolio(snapshot, queued)
  }
  return true
}

export function clearAsterUserSnapshots(): void {
  snapshots.clear()
}
