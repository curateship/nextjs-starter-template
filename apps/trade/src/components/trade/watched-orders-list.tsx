import * as React from "react"

import { MarketIcon } from "@/components/trade/market-icon"
import { PnlAmount } from "@/components/trade/pnl-amount"
import { TradeBadge } from "@/components/trade/trade-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { stickyPanelTableHeaderClassName } from "@/lib/layout/panel-section-bar"
import { orderDistance, orderDistanceLabel } from "@/lib/trade/order-distance"

import { InfoIcon, TriangleAlertIcon } from "lucide-react"

import { LoadingRow } from "@/components/ui/loading-row"
import { ErrorRow } from "@/components/ui/error-row"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { marketSymbol, type MarketRow } from "@/lib/protocols/contracts"
import {
  formatPrice,
  formatSignedUsd,
  formatWholeUsd,
} from "@/lib/trade/format"
import { refusalForWatchedOrder, type LiveRefusal } from "@/lib/trade/live"
import { useLiveMarks } from "@/lib/trade/live-market"
import { moneyTone } from "@/lib/trade/money-tone"
import {
  positionProfit,
  positionValue,
  type TradeOrder,
  type TradePosition,
} from "@/lib/trade/paper"
import { smartOrdersYouPlaced, type SmartOrder } from "@/lib/trade/smart-plan"
import {
  readWatchedCache,
  toWatchedLevel,
  writeWatchedCache,
  type WatchedLevel,
} from "@/lib/trade/watched-cache"
import { cn } from "@/lib/utils"

/**
 * Every hand-placed price you are waiting on, shown in Manual orders.
 *
 * A plain order does not rest on the exchange any more — the app holds the
 * level and only sends anything once the market comes to it, which is what
 * `watched-orders.md` calls a watch. Those levels are drawn on the chart of
 * the coin they belong to and listed in Open orders mixed in with everything
 * else, so the one question they never answered was "what am I waiting on
 * across all my coins". This tab is that answer, and pressing a row charts
 * the coin.
 *
 * Only prices placed by hand reach here. A flow never creates one: a watch is
 * what a hand-placed order becomes, and a flow's orders belong to its own run.
 *
 * **It opens on the levels this browser saw last time.** The trading read
 * takes about three and a half seconds, so waiting for it meant a spinner on
 * the first thing anybody looked at, every visit. `watched-cache.ts` explains
 * what is kept and why it is never trusted. The rows arrive silently and the
 * first real read replaces them a moment later, whether it agrees or not.
 * Nothing marks them while that is happening: Tyler asked for the wait to go
 * away, and a line saying "checking" is the wait wearing a different hat. A
 * read that REFUSES is the one case that still speaks up, because then
 * nothing is coming to correct them.
 */
/** The four columns, the same set the Smart orders panel sorts by. */
type ManualOrderColumn = "ticker" | "type" | "held" | "pnl"

/** Money columns start biggest-first; words start A to Z. */
function defaultManualOrderDirection(column: ManualOrderColumn) {
  return column === "pnl" || column === "held"
    ? ("desc" as const)
    : ("asc" as const)
}

export function WatchedOrdersList({
  orders,
  positions,
  smartOrders,
  markets,
  cacheScope,
  refusals,
  walletName,
  settled,
  failed,
  onRetry,
  onSelectMarket,
  selectedKey,
}: {
  /** Watched prices wearing an order's clothes, from the trading hook. */
  orders: readonly TradeOrder[]
  /** Everything held right now, practice and real together. */
  positions: readonly TradePosition[]
  /**
   * Every ladder, grid, signal and watch that is working. The coins the first
   * three run are somebody else's rows — see `positionsYouOpenedByHand`.
   */
  smartOrders: readonly SmartOrder[]
  /** The catalogue, for a price on an exchange whose feed does not tick. */
  markets: readonly MarketRow[]
  /** Which account and exchange these belong to; see `watched-cache.ts`. */
  cacheScope: string
  /**
   * The last refusal on each wallet and market. A level whose order the
   * exchange keeps refusing looks exactly like one quietly waiting, and that
   * is the whole reason this list could not answer "why has nothing happened".
   */
  refusals: ReadonlyMap<string, LiveRefusal>
  walletName: (walletId: string) => string
  /**
   * Both halves of the read have landed. See `settled` on `Trading`.
   *
   * Not `loading`, which turns false the moment EITHER half lands. This list
   * spans practice wallets and real ones together, so half an answer is not
   * an answer: with every waiting level on a real wallet, the practice half
   * landing on its own says "none" and means "not yet".
   */
  settled: boolean
  /** The first read failed and there is nothing to fall back on. */
  failed: boolean
  onRetry: () => void
  onSelectMarket: (marketKey: string) => void
  /** The market on the chart, so its rows read as the one already open. */
  selectedKey: string | null
}) {
  // Read a beat after the first render, never during it: this page renders on
  // the server too, and the server has no localStorage. Reading it up front
  // would make the two renders disagree.
  const [cached, setCached] = React.useState<readonly WatchedLevel[] | null>(
    null
  )
  useEffectBeforePaint(() => {
    setCached(readWatchedCache(cacheScope)?.rows ?? null)
  }, [cacheScope])

  // Handed over on every read that lands. Writing the same thing twice is
  // `writeWatchedCache`'s problem, not this component's — it compares before
  // it writes, so a poll that changed nothing costs one string comparison.
  React.useEffect(() => {
    if (!settled || failed) return
    writeWatchedCache(cacheScope, orders)
  }, [orders, settled, failed, cacheScope])

  // Newest first, and it stays that way while prices move. Sorting by how
  // close each level is would reshuffle the list under the pointer every
  // second, and the row you came here to press would not be where you left it.
  const fresh = React.useMemo(
    () =>
      [...orders]
        .sort((left, right) => right.createdAt - left.createdAt)
        .map(toWatchedLevel),
    [orders]
  )

  // **The cache stands in until this session has a WHOLE answer of its own,
  // and never again after that.** A read that refuses halfway through the
  // afternoon must not quietly put this morning's levels back over the ones
  // on screen, and a read that came back with nothing must not have old rows
  // resurrected over it. Tracked here rather than off `settled`, which turns
  // true on a failure as well as on an answer.
  //
  // Adjusted during render, the way `MarketIcon` does it: React re-runs the
  // render immediately without painting in between, so the swap from the
  // cached rows to the real ones happens in one frame.
  const [answered, setAnswered] = React.useState(false)
  if (!answered && settled && !failed) setAnswered(true)
  //
  // **A cache that says "you had none waiting" stands in too.** It is the same
  // answer at the same age as a cache of three levels, and leaving it out was
  // why an exchange with nothing waiting still sat on the spinner for four
  // seconds — the whole complaint, on the empty case. `null` is the only
  // thing that means no cache: an empty list is a picture, not a blank.
  const standingIn = !answered && cached !== null
  const rows = standingIn ? cached : fresh

  // The coins you got into by hand, above the prices still waiting. A grid or
  // a ladder's coin belongs to the Smart orders panel over this one, where the
  // strategy running it is named beside its money.
  const held = React.useMemo(
    () => positionsYouOpenedByHand(positions, smartOrders),
    [positions, smartOrders]
  )

  const live = useLiveMarks([
    ...held.map((position) => position.marketKey),
    ...rows.map((row) => row.marketKey),
  ])
  // **A price from the catalogue when the feed has none.** KuCoin has no
  // all-markets socket topic, so its levels never got a live mark and sat
  // without a distance at all; Phemex's feed takes a moment to speak. The
  // catalogue's last mark is the same price the positions table falls back
  // on, and it is redrawn whenever the page refetches the markets.
  const marks = React.useMemo(() => {
    const out = new Map<string, number>()
    for (const market of markets) out.set(market.key, market.price)
    for (const [key, price] of live) out.set(key, price)
    return out
  }, [markets, live])

  // The coin art each row draws beside its ticker, the same as the Smart
  // orders panel above it. The catalogue is the only place it lives.
  const iconUrls = React.useMemo(
    () => new Map(markets.map((market) => [market.key, market.iconUrl])),
    [markets]
  )

  // One market gets one row. Several watched prices can belong to the same
  // market, but the list is for choosing a chart rather than managing orders.
  // The row therefore shows whichever waiting price is closest to today's
  // mark. The market's place in the list still comes from its newest order, so
  // a moving price can change the row's details without moving the row itself.
  const shownRows = React.useMemo(
    () => nearestWatchedLevels(rows, marks),
    [marks, rows]
  )

  // The wallet is named on a row only when the list spans more than one.
  // The panel is a couple of hundred pixels wide, and with every level in the
  // same wallet its name is the same word on every row — it pushes the level
  // and the distance into an ellipsis to say nothing.
  const { sort, direction, toggleSort } = useTableSort<ManualOrderColumn>(
    "pnl",
    "desc",
    defaultManualOrderDirection
  )

  const severalWallets =
    new Set([
      ...held.map((position) => position.walletId),
      ...shownRows.map((row) => row.walletId),
    ]).size > 1

  /**
   * One row per thing, holdings and waiting levels in the same list.
   *
   * **The two used to be two lists under two headings**, which meant a column
   * could not be sorted across both — and the question the panel is for,
   * "where is my money and what is it doing", spans both (Tyler, 14 Sep 2026).
   * Type is what tells them apart now: a holding reads Long or Short, a
   * waiting level reads Buy or Sell and carries the distance pill under its
   * ticker.
   *
   * Held is the money in the market for a holding and the money the order
   * will spend for a waiting level. PnL belongs to holdings alone: a level
   * nothing has filled has made and lost nothing, so it sorts last rather
   * than sitting at zero among trades that really are flat.
   */
  const tableRows = React.useMemo(() => {
    const heldRows = held.map((position) => {
      const mark = marks.get(position.marketKey) ?? null
      return {
        id: position.id,
        marketKey: position.marketKey,
        symbol: marketSymbol(position.marketKey),
        iconUrl: iconUrls.get(position.marketKey) ?? null,
        waiting: false as const,
        type: position.szi > 0 ? "Long" : "Short",
        winningSide: position.szi > 0,
        money: mark === null ? null : positionValue(position, mark),
        profit: openProfit(position, mark),
        distance: null,
        refusal: null,
        title: `${marketSymbol(position.marketKey)} · ${position.szi > 0 ? "Long" : "Short"} ${Math.abs(position.szi)} from ${formatPrice(position.entryPx)}${severalWallets ? ` · ${walletName(position.walletId)}` : ""}`,
      }
    })
    const waitingRows = shownRows.map((level) => {
      const mark = marks.get(level.marketKey) ?? null
      return {
        id: level.id,
        marketKey: level.marketKey,
        symbol: marketSymbol(level.marketKey),
        iconUrl: iconUrls.get(level.marketKey) ?? null,
        waiting: true as const,
        type: level.side === "buy" ? "Buy" : "Sell",
        winningSide: level.side === "buy",
        money: level.px * level.sz,
        profit: null,
        // **No "reached".** A level the price has come to is a level about to
        // become a position, and the word sat where a figure belongs (Tyler,
        // 14 Sep 2026). Nothing is drawn until there is a distance to draw.
        distance: orderDistance({ ...level, watched: true }, mark) || null,
        refusal: refusalForWatchedOrder(refusals, level),
        title: `${marketSymbol(level.marketKey)} · ${level.side === "buy" ? "Buy" : "Sell"} at ${formatPrice(level.px)}${severalWallets ? ` · ${walletName(level.walletId)}` : ""}`,
      }
    })
    const all = [...heldRows, ...waitingRows]
    const value = (row: (typeof all)[number]) =>
      sort === "held" ? row.money : row.profit
    return all.sort((left, right) => {
      // **Waiting levels are always under the holdings, in every sort**
      // (Tyler, 14 Sep 2026). Coins you are already in are the ones with money
      // moving on them, and a column that shuffled a level up between two
      // holdings made the panel a list of two unlike things. Sorting then
      // happens inside each half.
      if (left.waiting !== right.waiting) return left.waiting ? 1 : -1
      if (sort === "held" || sort === "pnl") {
        const leftValue = value(left)
        const rightValue = value(right)
        // A row with no figure sits at the bottom of its own half whichever
        // way the column points, so flipping the sort never buries the rows
        // that have one.
        if (leftValue === null) return rightValue === null ? 0 : 1
        if (rightValue === null) return -1
        const result = leftValue - rightValue
        if (result !== 0) return direction === "asc" ? result : -result
        return left.symbol.localeCompare(right.symbol)
      }
      const result =
        sort === "type"
          ? left.type.localeCompare(right.type)
          : left.symbol.localeCompare(right.symbol)
      if (result !== 0) return direction === "asc" ? result : -result
      return left.symbol.localeCompare(right.symbol)
    })
  }, [
    direction,
    held,
    iconUrls,
    marks,
    refusals,
    severalWallets,
    shownRows,
    sort,
    walletName,
  ])

  const heading = (column: ManualOrderColumn, label: string) => (
    <TableSortButton
      active={sort === column}
      direction={direction}
      onClick={() => toggleSort(column)}
      className="gap-0.5 whitespace-nowrap sm:text-xs"
    >
      {label}
    </TableSortButton>
  )

  return (
    // ManualOrdersPanel owns the scrollbar so the header stays fixed.
    <div>
      {failed && !standingIn ? (
        // "Nothing is waiting" and "I could not find out" are different
        // answers, and only one of them is safe to act on.
        <ErrorRow
          message="The watched prices could not be read, so it is not known what is waiting."
          onRetry={onRetry}
          className="py-8 text-xs"
        />
      ) : !answered && !standingIn && tableRows.length === 0 ? (
        // Only when there is genuinely nothing to draw. A half-landed read
        // that DID bring levels draws them at once — the spinner is what
        // stands between somebody and their own levels, and this tab was
        // built to get rid of it.
        <LoadingRow
          label="Reading your watched prices"
          className="py-8 text-xs"
        />
      ) : (
        <div className="flex flex-col">
          {/* Above whatever follows, rows or the empty wording alike: a read
              that refused must never let "nothing is waiting" pass as this
              session's own answer. */}
          {standingIn && failed ? (
            <StaleAfterFailureNote onRetry={onRetry} />
          ) : null}
          {tableRows.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              Nothing is waiting at a price. Right-click the chart where you
              want to buy or sell. The order waits here until the market reaches
              it.
            </p>
          ) : (
            <Table
              className="table-fixed [&_tbody_tr:first-child_td]:pt-2 [&_tbody_tr:last-child_td]:pb-2 [&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3"
              containerClassName={cn(
                "overflow-visible [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10",
                stickyPanelTableHeaderClassName
              )}
            >
              <TableHeader>
                <TableRow>
                  {/* The same four widths the Smart orders panel above uses,
                      so the two panels line up when they sit one over the
                      other. */}
                  <TableHead className="w-[34%] px-1">
                    {heading("ticker", "Ticker")}
                  </TableHead>
                  <TableHead className="w-[22%] px-1">
                    {heading("type", "Type")}
                  </TableHead>
                  <TableHead className="w-[20%] px-1">
                    {heading("held", "Value")}
                  </TableHead>
                  <TableHead className="w-[24%] px-1">
                    {heading("pnl", "PnL")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.map((row) => (
                  <TableRow
                    key={row.id}
                    title={row.title}
                    rowAction={() => onSelectMarket(row.marketKey)}
                    data-state={
                      row.marketKey === selectedKey ? "selected" : undefined
                    }
                  >
                    {/* Cell for cell, the Smart orders row above: coin art
                        then ticker, the side as a toned badge, Held quiet in
                        mono, PnL in the money colours (Tyler, 14 Sep 2026). */}
                    <TableCell className="py-2 pr-2 pl-1">
                      <div className="grid min-w-0 gap-1">
                        <div className="flex min-w-0 items-center gap-1">
                          <MarketIcon
                            symbol={row.symbol}
                            iconUrl={row.iconUrl}
                          />
                          <span
                            className="min-w-0 flex-1 truncate text-xs font-semibold sm:text-sm"
                            title={row.symbol}
                          >
                            {row.symbol}
                          </span>
                        </div>
                        {row.refusal ? (
                          <RefusalNote refusal={row.refusal} />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-1 py-2">
                      <TradeBadge tone={row.winningSide ? "made" : "lost"}>
                        {row.type}
                      </TradeBadge>
                    </TableCell>
                    <TableCell className="px-1 py-2 font-mono text-xs tabular-nums">
                      <span className="text-muted-foreground">
                        {row.money === null ? "—" : formatWholeUsd(row.money)}
                      </span>
                    </TableCell>
                    {/* **A waiting level borrows the PnL column for its
                        distance** (Tyler, 14 Sep 2026). It is not a profit and
                        must never read as one, so it takes the muted colour
                        every other "nothing here" in this table wears, while a
                        real profit keeps the money colour and the weight. */}
                    <TableCell className="px-1 py-2 font-mono text-xs tabular-nums">
                      {row.profit !== null ? (
                        <PnlAmount
                          className={cn("font-medium", moneyTone(row.profit))}
                        >
                          {formatSignedUsd(row.profit)}
                        </PnlAmount>
                      ) : (
                        // Smaller than the figures around it (Tyler, 14 Sep
                        // 2026), so the eye reads the column as money first
                        // and the distance as the aside it is. 10px is as
                        // small as a whole phrase goes here — half of 12px
                        // would be 6px, which nobody can read.
                        <span className="text-[10px] text-muted-foreground">
                          {row.distance === null
                            ? "—"
                            : orderDistanceLabel(row.distance)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The positions you opened yourself, biggest stake first.
 *
 * **A coin a strategy is running is not one of these.** A ladder, a grid or a
 * signal already has its own row in the Smart orders panel directly above,
 * with its money beside the strategy's name, so repeating the same holding
 * here would put one position on the screen twice. A watch is the exception:
 * a watch IS a hand-placed order, so a coin with one waiting is still yours.
 *
 * **An automation's coin is not one of those rows, so it stays here.** The
 * Smart orders panel leaves a flow's orders to that flow's own run dashboard,
 * which is not this screen. Counting them anyway took the coin off this panel
 * without putting it anywhere else: ARB, held by an automation on 16 Sep 2026,
 * was on the Positions tab and nowhere in Manual orders (Tyler). The rule is
 * now the one `smartOrdersYouPlaced` states, the same one the Positions tab
 * filters by, so the two lists can never disagree about which coins a
 * strategy owns.
 *
 * Sorted by what was put in rather than by what it is worth now, so a row
 * cannot move under the pointer while a price ticks.
 */
export function positionsYouOpenedByHand(
  positions: readonly TradePosition[],
  smartOrders: readonly SmartOrder[]
): TradePosition[] {
  const run = new Set(
    smartOrdersYouPlaced(smartOrders).map(
      (order) => `${order.walletId}:${order.marketKey}`
    )
  )
  return positions
    .filter(
      (position) => !run.has(`${position.walletId}:${position.marketKey}`)
    )
    .sort(
      (left, right) =>
        Math.abs(right.szi * right.entryPx) - Math.abs(left.szi * left.entryPx)
    )
}

/**
 * What a held position is up or down right now, or null when no price has
 * been quoted for it.
 *
 * Fees come off, so a position that has paid more in fees than the price has
 * moved reads as down rather than even. That is the same figure the Smart
 * orders panel shows beside a strategy's name.
 */
function openProfit(
  position: TradePosition,
  mark: number | null
): number | null {
  // A Solana holding whose entry price was never recorded, or which nothing
  // will quote, has no honest answer here. A made-up zero would read as
  // breaking even.
  if (mark === null) return null
  if (
    position.owned &&
    (!position.owned.entryKnown || !position.owned.priced)
  ) {
    return null
  }
  return positionProfit(position, mark) - position.feesPaid
}

/**
 * Keeps one waiting price per market and chooses the one nearest its mark.
 *
 * Input order decides where each market sits and breaks ties. Both fresh and
 * cached levels arrive newest first, so a missing mark keeps the newest order
 * and equal distances do the same.
 */
function nearestWatchedLevels(
  levels: readonly WatchedLevel[],
  marks: ReadonlyMap<string, number>
): WatchedLevel[] {
  const shown: WatchedLevel[] = []
  const indexByMarket = new Map<string, number>()

  for (const level of levels) {
    const existingIndex = indexByMarket.get(level.marketKey)
    if (existingIndex === undefined) {
      indexByMarket.set(level.marketKey, shown.length)
      shown.push(level)
      continue
    }

    const mark = marks.get(level.marketKey)
    if (mark === undefined) continue
    const existing = shown[existingIndex]
    if (distanceFromMark(level, mark) < distanceFromMark(existing, mark)) {
      shown[existingIndex] = level
    }
  }

  return shown
}

function distanceFromMark(level: WatchedLevel, mark: number): number {
  return orderDistance({ ...level, watched: true }, mark) ?? Infinity
}

/**
 * The line shown when the read REFUSED and these rows are all there is.
 *
 * **Only on failure.** A "checking these are still waiting" line used to sit
 * here for the second or two of a normal load and Tyler asked for it gone on
 * 21 Aug 2026: the read lands almost at once, the levels almost never differ,
 * and a spinner on the first thing he looks at every visit was the whole
 * problem he asked to be rid of.
 *
 * A failed read is not that. Nothing is coming to correct these rows, so old
 * levels have to say they are old and offer the way to try again — otherwise
 * a level that filled overnight sits here looking live with nothing on screen
 * admitting the app never checked.
 */
function StaleAfterFailureNote({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorRow
      message="The read failed. This is what was here last time."
      onRetry={onRetry}
      className="border-b px-3 py-2 text-xs"
    />
  )
}

/**
 * Why this level has not fired, under the level it belongs to.
 *
 * **A refused level is indistinguishable from a patient one without it.** The
 * engine works in the background with nobody watching, so a refusal has no
 * press to throw back to and never became a toast; it went into a table
 * nothing read. On 21 Aug 2026 a Phemex level was refused twenty times over
 * eighteen minutes — the market was at the exchange's open-interest cap and
 * would not accept anything that opened a position — and this row said
 * "waiting" the whole time.
 *
 * **The triangle carries it as much as the colour does.** The panel is a
 * couple of hundred pixels wide so the sentence is clamped to two lines, with
 * the whole of it on the row's own tooltip; the standard's rule against
 * saying anything in colour alone is why the icon is not decoration.
 *
 * Nothing here offers a way to retry. The engine is already retrying — that
 * is what made twenty rows — and a button promising to do again what is
 * happening anyway would be a lie about who is stuck.
 */
function RefusalNote({ refusal }: { refusal: LiveRefusal }) {
  const Icon = refusal.retrying ? InfoIcon : TriangleAlertIcon
  return (
    <span
      title={refusal.note}
      className={`mt-0.5 flex items-start gap-1 text-xs leading-4 ${refusal.retrying ? "text-muted-foreground" : "text-destructive"}`}
    >
      <Icon aria-hidden className="mt-0.5 size-3 shrink-0" />
      {/* `anywhere` rather than plain wrapping: an exchange's own code comes
          through as one unbroken token — `PHEMEX_11150:TE_OI_LIMIT_REDUCE_ONLY`
          — and a word longer than the panel runs off the edge instead of
          wrapping. Seen on the real panel at 296px on 21 Aug 2026. Ordinary
          sentences are unaffected, because it only breaks where it must. */}
      <span className="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]">
        {refusal.note}
      </span>
    </span>
  )
}
