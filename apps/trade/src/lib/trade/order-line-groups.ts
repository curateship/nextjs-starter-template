import type { TradeOrder } from "@/lib/trade/paper"

/**
 * One chart line for every waiting order that shares it.
 *
 * Two hand-placed orders on one coin drew two red lines a few pixels apart,
 * each with its own dollar figure, and on 11 Sep 2026 Tyler said they should
 * be one line with one number. So the orders are moved onto one stop price
 * rather than one line being drawn over two prices: a line at a price where
 * only half the money gets out says the wrong thing about where the loss
 * stops, and the half that got out earlier never had a line at all.
 *
 * **The tighter stop wins.** Of the prices already set, the one that loses
 * least is where they all end up — the higher price for a buy, the lower one
 * for a sell. Going the other way would widen a stop somebody set on purpose
 * and put more money at risk than they asked for, which is not a change a
 * chart is allowed to make by itself.
 *
 * **A stop never lands on the wrong side of an entry.** A buy at $2 and a buy
 * at $4 cannot share a stop at $3: for the cheaper order that is above the
 * price it buys at, so it is not a stop at all. An order the winning price
 * does not suit keeps its own line, and whatever is left groups among itself.
 *
 * **Only orders this app holds are merged.** An order already resting at the
 * exchange cannot be changed in place, so it keeps the single line it has
 * always had. An order still being sent draws no stop or exit line at all
 * until the answer lands.
 *
 * Exit lines follow the same shape but a gentler rule, in
 * `orderTargetGroups` at the bottom of this file.
 */
export type OrderLineGroup = {
  /**
   * The line's id, taken from the first order in the group. Stable while a
   * line is being dragged, which a price-based id would not be.
   */
  id: string
  walletId: string
  /** The one price every order in the group gets out at. */
  price: number
  orders: readonly TradeOrder[]
  /** Every order in it is ours, so one line can move them all. */
  movable: boolean
}

/** A stop below the price for a buy, above it for a sell. */
function suitsEntry(order: TradeOrder, price: number): boolean {
  return order.side === "buy" ? price < order.px : price > order.px
}

/** Of two stops on the same side, the one that loses less. */
function tighter(order: TradeOrder, than: TradeOrder): boolean {
  const stop = order.slPx ?? 0
  const other = than.slPx ?? 0
  return order.side === "buy" ? stop > other : stop < other
}

/**
 * The line's own id, and the reason it carries which kind of line it is: a
 * stop and an exit on the same order would otherwise share one id, and on 11
 * Sep 2026 that made dragging the exit drag the stop along with it and drew
 * the stop twice. React keys the lines on this.
 */
function lineId(kind: "sl" | "tp", order: TradeOrder): string {
  return `order-${kind}:${order.id}`
}

function loneGroup(
  order: TradeOrder,
  kind: "sl" | "tp",
  price: number,
  movable: boolean
): OrderLineGroup {
  return {
    id: lineId(kind, order),
    walletId: order.walletId,
    price,
    orders: [order],
    movable,
  }
}

/**
 * The stop lines to draw for one market's waiting orders, in the order the
 * orders arrived.
 */
export function orderStopGroups(
  orders: readonly TradeOrder[]
): OrderLineGroup[] {
  // **An order still being sent draws no stop at all.** Its stop cannot be
  // merged with anything, because there is nothing on the server to save yet,
  // so it appeared for a second as a second red line beside the one it was
  // about to join. Tyler saw that flicker on 11 Sep 2026 and said not to draw
  // it. The order's own bar already says "sending".
  const withStop = orders.filter((one) => one.slPx !== null && !one.placing)
  const groups: OrderLineGroup[] = []

  for (const order of withStop) {
    if (order.live) groups.push(loneGroup(order, "sl", order.slPx ?? 0, false))
  }

  // A buy and a sell on one coin are two different trades going opposite ways,
  // and a wallet is somebody else's money. Neither shares a stop.
  const lanes = new Map<string, TradeOrder[]>()
  for (const order of withStop) {
    if (order.live) continue
    const lane = `${order.walletId}:${order.side}`
    lanes.set(lane, [...(lanes.get(lane) ?? []), order])
  }

  for (const lane of lanes.values()) {
    let rest = lane
    while (rest.length > 0) {
      // Whoever set the winning price is always in the group it makes, even if
      // its own stop sits on the wrong side of its own entry — a row like that
      // is broken already, and dropping it would leave it with no line.
      const setter = rest.reduce((best, one) => (tighter(one, best) ? one : best))
      const price = setter.slPx ?? 0
      const takers = rest.filter(
        (one) => one === setter || suitsEntry(one, price)
      )
      groups.push({
        id: lineId("sl", takers[0]),
        walletId: takers[0].walletId,
        price,
        orders: takers,
        movable: takers.every((one) => !one.taking),
      })
      rest = rest.filter((one) => !takers.includes(one))
    }
  }

  const place = new Map(withStop.map((one, index) => [one.id, index]))
  return groups.sort(
    (a, b) => (place.get(a.orders[0].id) ?? 0) - (place.get(b.orders[0].id) ?? 0)
  )
}

/** One order's stop, moved to the price its group settled on. */
export type StopMerge = {
  walletId: string
  orderId: string
  price: number
}

/**
 * The saves that make the drawn lines true.
 *
 * The amount each order is for is left alone. Dragging a stop by hand resizes
 * an order sized by risk so it still risks the same money, but this move was
 * nobody's decision — it happens because two orders met on one chart — so the
 * only thing it may do is move the stop somewhere that loses less.
 */
export function stopMerges(groups: readonly OrderLineGroup[]): StopMerge[] {
  return groups.flatMap((group) =>
    group.movable && group.orders.length > 1
      ? group.orders
          .filter((one) => one.slPx !== group.price)
          .map((one) => ({
            walletId: one.walletId,
            orderId: one.id,
            price: group.price,
          }))
      : []
  )
}

/**
 * The exit lines to draw, one per price the waiting orders already share.
 *
 * **Nothing is moved to make these.** A stop is a limit on what a trade may
 * lose, so putting two of them on the tighter price only ever risks less; an
 * exit is where a trade takes its profit, and dragging one of those onto
 * another would quietly give profit away. Two exits at the same price are one
 * line because they are one price, and two at different prices stay two lines.
 *
 * The chart's own Exit row sets one price on every order at once, so the
 * ordinary way of getting here already produces one line.
 */
export function orderTargetGroups(
  orders: readonly TradeOrder[]
): OrderLineGroup[] {
  const withTarget = orders.filter((one) => one.tpPx !== null && !one.placing)
  const groups: OrderLineGroup[] = []
  const shared = new Map<string, TradeOrder[]>()

  for (const order of withTarget) {
    if (order.live) {
      groups.push(loneGroup(order, "tp", order.tpPx ?? 0, false))
      continue
    }
    const lane = `${order.walletId}:${order.side}:${order.tpPx}`
    shared.set(lane, [...(shared.get(lane) ?? []), order])
  }

  for (const members of shared.values()) {
    groups.push({
      id: lineId("tp", members[0]),
      walletId: members[0].walletId,
      price: members[0].tpPx ?? 0,
      orders: members,
      movable: members.every((one) => !one.taking),
    })
  }

  const place = new Map(withTarget.map((one, index) => [one.id, index]))
  return groups.sort(
    (a, b) => (place.get(a.orders[0].id) ?? 0) - (place.get(b.orders[0].id) ?? 0)
  )
}
