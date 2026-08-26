import * as React from "react"
import {
  BookOpenIcon,
  LayersIcon,
  ScrollTextIcon,
  Trash2Icon,
} from "lucide-react"

import { BracketsDialog } from "@/components/trade/brackets-dialog"
import { CloseAllMenu } from "@/components/trade/close-all-menu"
import { PositionMarginDialog } from "@/components/trade/position-margin-dialog"
import {
  OpenOrdersTable,
  PositionsTable,
  TradesTable,
} from "@/components/trade/positions-table"
import type { Trading } from "@/components/trade/use-trading"
import {
  DashboardCardTab,
  DashboardCardTabsHeader,
} from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  marketSymbol,
  type MarketCatalog,
  type MarketRow,
} from "@/lib/protocols/contracts"
import { useSelection } from "@/lib/hooks/use-selection"
import { formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { useLiveMarks } from "@/lib/trade/live-market"
import { moneyTone } from "@/lib/trade/money-tone"
import type { PanelFit } from "@/lib/trade/panel-fit"
import type { LiveTrade } from "@/lib/trade/live-trades"
import {
  laddersAndGridsYouPlaced,
  smartOrdersYouPlaced,
} from "@/lib/trade/smart-plan"
import type { TradeWallet } from "@/lib/trade/wallets"
import {
  positionProfit,
  positionValue,
  type TradePosition,
} from "@/lib/trade/paper"
import { cn } from "@/lib/utils"

type ActivityTab = "positions" | "orders" | "journal"

/** Whatever is highlighted right now, dropped. */
function clearHighlight(): void {
  if (typeof window === "undefined") return
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) selection.removeAllRanges()
}

/**
 * Any stray highlight a tab press leaves behind, dropped once the press ends.
 *
 * **Pressing a tab moves everything under the pointer.** The divider jumps,
 * the rows slide up, and the browser — still working out what the press meant
 * — finishes by highlighting everything between where the press started and
 * whatever ended up under the pointer afterwards. That is a whole table turned
 * blue by a press that was only ever asking for a taller panel.
 *
 * It waits for the pointer to come up, because that is when the browser
 * settles the highlight. Only ever hung on a press made with a pointer: a tab
 * reached with the arrow keys highlights nothing, and a listener left waiting
 * from one would go off on some later click and take a highlight somebody
 * meant to keep.
 */
function dropStrayHighlightAfter(): void {
  if (typeof window === "undefined") return
  window.addEventListener("pointerup", clearHighlight, { once: true })
}

/**
 * The bottom panel: what you are holding, what you have asked for, and how the
 * trades that are finished actually went.
 *
 * Its tab row is also its collapsed state — dragging the divider all the way
 * down leaves exactly this header on screen, counts and all, so the panel can
 * always be found and dragged back open. That is why it collapses to a height
 * rather than to nothing the way the side panels do.
 */
export function ActivityPanel({
  trading,
  catalogs,
  wallets,
  onSelectMarket,
  onAddToPosition,
  canChangeLeverage,
  leverageRefusal,
  canAdjustMargin,
  marginRefusal,
  shownTrade,
  onShowTrade,
  fit,
}: {
  trading: Trading
  catalogs: MarketCatalog[]
  /** Every wallet on this exchange, for telling real money from practice. */
  wallets: readonly TradeWallet[]
  onSelectMarket: (marketKey: string) => void
  /**
   * Buy more of a position: the workspace charts that coin, switches to that
   * wallet, and opens the order window over today's price. It owns both
   * switches, which is why the row's button reaches all the way up here.
   */
  onAddToPosition: (position: TradePosition) => void
  /**
   * Whether this exchange allows leverage or margin to be changed on an open
   * position, and its own reason when it does not — see `useProtocolAbilities`.
   */
  canChangeLeverage: boolean
  leverageRefusal: string | null
  canAdjustMargin: boolean
  marginRefusal: string | null
  /** The trade drawn on the chart right now, owned by the workspace. */
  shownTrade: LiveTrade | null
  onShowTrade: (trade: LiveTrade | null) => void
  /** How the panel changes its own height when a tab is pressed. */
  fit: PanelFit
}) {
  const [tab, setTab] = React.useState<ActivityTab>("positions")
  const [editing, setEditing] = React.useState<TradePosition | null>(null)
  const [changingMargin, setChangingMargin] =
    React.useState<TradePosition | null>(null)
  // Offered when the exchange allows either of the two. The window itself says
  // which half it cannot do, so one refused half never hides the other.
  const canChangeMargin = canChangeLeverage || canAdjustMargin
  const [flipping, setFlipping] = React.useState<TradePosition | null>(null)
  // The bin on a row and the Remove button over ticked rows both ask first.
  // Nothing here can be put back from the screen, and the two lists sit under
  // a chart people click around on all day. One row or many, it is the same
  // question, so one dialog holds whichever list is being asked about.
  const [removingTrades, setRemovingTrades] = React.useState<LiveTrade[] | null>(
    null
  )

  // Which Journal rows are ticked for a mass remove, by trade id.
  const journalTicks = useSelection()
  const { setSelected: setJournalTicks } = journalTicks
  const tickedTrades = React.useMemo(
    () => trading.trades.filter((trade) => journalTicks.selected.has(trade.id)),
    [trading.trades, journalTicks.selected]
  )

  // A tick never outlives its row. A poll that removes a trade — or a mass
  // remove that just went through — takes the tick with it, so Remove (n)
  // can only ever mean rows that are on screen right now.
  React.useEffect(() => {
    const listed = new Set(trading.trades.map((trade) => trade.id))
    setJournalTicks((current) => {
      const next = new Set([...current].filter((id) => listed.has(id)))
      return next.size === current.size ? current : next
    })
  }, [trading.trades, setJournalTicks])

  /** Each row says which wallet it is in; the panel shows several at once. */
  const walletNames = trading.walletNames
  const walletName = React.useCallback(
    (walletId: string) => walletNames.get(walletId) ?? "another wallet",
    [walletNames]
  )

  // Every market on offer, by key, so a row can find its own art and its
  // fallback price without each one searching the catalogues itself.
  const markets = React.useMemo(() => {
    const byKey = new Map<string, MarketRow>()
    for (const catalog of catalogs) {
      for (const row of catalog.rows) byKey.set(row.key, row)
    }
    return byKey
  }, [catalogs])

  /**
   * What this table lists: everything held except the coins the Smart orders
   * panel is already showing on the right (decided 24 Aug 2026).
   *
   * A ladder's coin appears there under the strategy that owns it, with what
   * that strategy is doing, so listing its position here too put the same
   * holding on screen twice and neither copy said which was which. There is
   * no filter to switch: the panel on the right is the other half of this
   * list, not a hidden state.
   *
   * A flow's position stays here. Nothing else on this screen shows it — the
   * flow's own orders live on its run dashboard — so leaving it out would be
   * money with nowhere on the page to see it.
   */
  const visible = React.useMemo(() => {
    const managed = new Set(
      smartOrdersYouPlaced(trading.smartOrders).map(
        (order) => `${order.walletId}:${order.marketKey}`
      )
    )
    return trading.positions.filter(
      (position) => !managed.has(`${position.walletId}:${position.marketKey}`)
    )
  }, [trading.positions, trading.smartOrders])

  // The ladders and grids one press would stand down. The same list the menu
  // counts and the action works through, so the two cannot disagree.
  const standing = React.useMemo(
    () => laddersAndGridsYouPlaced(trading.smartOrders),
    [trading.smartOrders]
  )
  // With none of the three there is nothing for Close all to offer, so the
  // button is not there either.
  const closable =
    trading.positions.length + trading.watchOrders.length + standing.length
  const realWallets = React.useMemo(
    () =>
      new Set(
        wallets.filter((one) => one.kind === "live").map((one) => one.id)
      ),
    [wallets]
  )

  // Resolved against the live list every render, so a position closed by its
  // own stop while its window is open closes the window instead of editing
  // something that is no longer there.
  const editingNow =
    trading.positions.find((one) => one.id === editing?.id) ?? null
  const marginNow =
    trading.positions.find((one) => one.id === changingMargin?.id) ?? null

  // A count that is not known yet shows nothing rather than a zero — before
  // the first read, and after a first read that failed, "0" would be claiming
  // an answer the panel does not have.
  const countOf = (length: number) =>
    !trading.settled || trading.failed ? undefined : length

  // ----- Growing the panel to fit the tab you just pressed -----------------
  //
  // Asking for the panel's height bumps this counter and the effect below
  // does the measuring, because the rows can only be measured once the tab
  // holding them is on screen and an inactive tab holds nothing at all.
  const root = React.useRef<HTMLDivElement | null>(null)
  const [landed, setLanded] = React.useState(0)
  const measured = React.useRef(0)

  React.useEffect(() => {
    // Only ever once per press. The other things this effect reads move on
    // their own — a poll finishing flips `settled` — and the panel must not
    // change height under somebody who is reading it.
    if (landed === measured.current) return
    measured.current = landed
    // A table still loading, or one whose read failed, has no row count. Both
    // draw a single message where the rows would be, so measuring one would
    // fit the panel to a sentence. Leave it alone instead.
    if (!trading.settled || trading.failed) return

    // **Waited for, frame by frame, rather than measured straight away.** The
    // tab panel's own element appears in the render that switches tabs, and
    // its rows appear in the one after it — so anything measuring immediately
    // measures an empty box and grows the panel by nothing. A handful of
    // frames is plenty and stops before it could become a loop.
    let frames = 0
    let raf = 0
    const look = () => {
      const viewport = root.current?.querySelector<HTMLElement>(
        '[data-slot="tabs-content"][data-state="active"] [data-slot="scroll-area-viewport"]'
      )
      if (viewport && viewport.scrollHeight > 0) {
        fit.grow(viewport.scrollHeight - viewport.clientHeight)
        clearHighlight()
        return
      }
      frames += 1
      if (frames <= 5) raf = requestAnimationFrame(look)
    }
    raf = requestAnimationFrame(look)
    return () => cancelAnimationFrame(raf)
  }, [landed, fit, trading.settled, trading.failed])

  /**
   * Pressing the tab you are already on, caught on the way down.
   *
   * **It opens the panel, and pressing it again shuts it back.** The tab you
   * are on is the one you press when the rows you want are already in front of
   * you and there are not enough of them on screen, so doing nothing there
   * would be the one press that felt broken.
   *
   * Caught on pointer-down because Radix switches tab on mouse-down: by the
   * time a click handler ran, the tab it was pressed from would already be the
   * tab it landed on, and "the one you were already on" could never be told
   * apart. Pointer-down runs first.
   */
  const pressTab = (value: ActivityTab) => (event: React.PointerEvent) => {
    if (event.button !== 0 || value !== tab) return
    clearHighlight()
    dropStrayHighlightAfter()
    if (fit.grown()) fit.shrink()
    else setLanded((count) => count + 1)
  }

  return (
    <Tabs
      ref={root}
      value={tab}
      onValueChange={(value) => {
        setTab(value as ActivityTab)
        setLanded((count) => count + 1)
        clearHighlight()
      }}
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card"
    >
      <DashboardCardTabsHeader
        action={
          <>
            {/* Removes every ticked Journal row at once, through the same
                confirm the bin on one row uses. Only there once something is
                ticked — a button that could do nothing would just be
                furniture. */}
            {tab === "journal" && tickedTrades.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={trading.busy}
                onClick={() => setRemovingTrades(tickedTrades)}
              >
                <Trash2Icon className="size-4" />
                Remove ({tickedTrades.length})
              </Button>
            ) : null}
            {/* The emergency button: one press opens the list of what can go,
                a second press does it. Positions, watched prices and smart
                orders all start ticked, and untick whatever should stay —
                closing what you hold and standing your waiting orders down are
                two different decisions, and a fast market is exactly when
                somebody wants one without the other. */}
            {closable > 0 ? (
              <CloseAllMenu
                positions={trading.positions}
                managed={trading.positions.length - visible.length}
                watched={trading.watchOrders}
                smart={standing}
                restingOrders={trading.orders.length}
                markets={markets}
                realWallets={realWallets}
                busy={trading.busy}
                onConfirm={(picked) => {
                  // Started together, never queued behind each other. This is
                  // the press somebody makes because the market is moving, so
                  // a stuck watch must never be the reason real money stayed
                  // open. Each call reports its own refusals.
                  if (picked.positions) void trading.closeAll()
                  if (picked.watched) void trading.cancelAllWatchedOrders()
                  if (picked.smart) void trading.cancelAllSmartOrders()
                }}
              />
            ) : null}
          </>
        }
      >
        <PositionsGlance positions={visible} markets={markets}>
          <DashboardCardTab
            value="positions"
            icon={<LayersIcon className="size-4" />}
            label="Positions"
            count={countOf(visible.length)}
            onPointerDown={pressTab("positions")}
          />
        </PositionsGlance>
        <DashboardCardTab
          value="orders"
          icon={<ScrollTextIcon className="size-4" />}
          label="Open orders"
          count={countOf(trading.orders.length + trading.watchOrders.length)}
          onPointerDown={pressTab("orders")}
        />
        <DashboardCardTab
          value="journal"
          icon={<BookOpenIcon className="size-4" />}
          label="Journal"
          count={countOf(trading.trades.length)}
          onPointerDown={pressTab("journal")}
        />
      </DashboardCardTabsHeader>

      <TabsContent value="positions" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <PositionsTable
            positions={visible}
            markets={markets}
            // What a real position's fee total is added up from.
            fills={trading.fills}
            walletName={walletName}
            busy={trading.busy}
            settled={trading.settled}
            failed={trading.failed}
            onRetry={trading.retry}
            onSelectMarket={onSelectMarket}
            onAdd={onAddToPosition}
            onMargin={canChangeMargin ? setChangingMargin : null}
            onEdit={setEditing}
            onFlip={setFlipping}
            onClose={(position) => void trading.close(position)}
            onClosePart={(position, ask) =>
              void trading.closePart(position, ask)
            }
          />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="orders" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <OpenOrdersTable
            // Real, practice and watched in one list — a watched price IS an
            // open order to the person who placed it, wherever it happens to
            // be held.
            orders={[...trading.orders, ...trading.watchOrders]}
            markets={markets}
            walletName={walletName}
            busy={trading.busy}
            settled={trading.settled}
            failed={trading.failed}
            onRetry={trading.retry}
            onSelectMarket={onSelectMarket}
            onCancel={(order) => void trading.cancel(order)}
          />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="journal" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <TradesTable
            trades={trading.trades}
            markets={markets}
            walletName={walletName}
            selectedId={shownTrade?.id ?? null}
            busy={trading.busy}
            settled={trading.settled}
            failed={trading.failed}
            onRetry={trading.retry}
            onLoadOlder={() => void trading.loadOlderTrades()}
            olderBusy={trading.olderTradesBusy}
            olderDone={trading.olderTradesDone}
            // Pressing the row already drawn puts the chart back to itself,
            // so the same press both shows and hides.
            onSelectTrade={(trade) =>
              onShowTrade(trade.id === shownTrade?.id ? null : trade)
            }
            onSelectMarket={onSelectMarket}
            onRemove={(trade) => setRemovingTrades([trade])}
            ticked={journalTicks.selected}
            onTickTrade={journalTicks.toggle}
            onTickVisible={journalTicks.toggleVisible}
            tickAllState={journalTicks.selectAllState}
          />
        </ScrollArea>
      </TabsContent>

      <ConfirmDialog
        open={removingTrades !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingTrades(null)
        }}
        title={
          removingTrades && removingTrades.length > 1
            ? `Remove ${removingTrades.length} trades from the Journal?`
            : "Remove this trade from the Journal?"
        }
        description={
          removingTrades && removingTrades.length > 1
            ? "They stop showing here, and stop being drawn on the chart. Nothing about your money changes — a practice wallet's cash is added up from its fills, so the fills are kept and only hidden."
            : "It stops showing here, and stops being drawn on the chart. Nothing about your money changes — a practice wallet's cash is added up from its fills, so the fills are kept and only hidden."
        }
        confirmLabel={
          removingTrades && removingTrades.length > 1 ? "Remove them" : "Remove it"
        }
        onConfirm={() => {
          if (removingTrades) {
            // Drawn on the chart right now? Then it goes from there too, or a
            // trade that is no longer in the list stays painted over the
            // candles with nothing to press to be rid of it.
            if (removingTrades.some((trade) => trade.id === shownTrade?.id)) {
              onShowTrade(null)
            }
            void trading.hideTrades(removingTrades)
          }
          setRemovingTrades(null)
        }}
      />

      <PositionMarginDialog
        position={marginNow}
        maxLeverage={
          marginNow ? (markets.get(marginNow.marketKey)?.maxLeverage ?? null) : null
        }
        walletName={marginNow ? walletName(marginNow.walletId) : ""}
        canChangeLeverage={canChangeLeverage}
        leverageRefusal={leverageRefusal}
        canAdjustMargin={canAdjustMargin}
        marginRefusal={marginRefusal}
        busy={trading.busy}
        onSetLeverage={(position, leverage) =>
          void trading.setPositionLeverage(position, leverage)
        }
        onAdjustMargin={(position, dollars) =>
          void trading.adjustPositionMargin(position, dollars)
        }
        onDismiss={() => setChangingMargin(null)}
      />

      <BracketsDialog
        position={editingNow}
        fills={trading.fills}
        busy={trading.busy}
        onSave={trading.setBrackets}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={flipping !== null}
        onOpenChange={(open) => {
          if (!open) setFlipping(null)
        }}
        title={
          flipping
            ? `Turn the ${marketSymbol(flipping.marketKey)} position in ${walletName(flipping.walletId)} around?`
            : "Turn this position around?"
        }
        description="What you are holding is closed at today's price and the same size is opened the other way, in one go. Whatever it has made or lost is banked, and any stop and target are cleared."
        confirmLabel="Turn it around"
        destructive={false}
        onConfirm={() => {
          if (flipping) void trading.flip(flipping.walletId, flipping.marketKey)
          setFlipping(null)
        }}
      />
    </Tabs>
  )
}

/**
 * A glance at what is held, without leaving the tab you are on.
 *
 * The panel is often collapsed to its header, or you are reading the Journal,
 * and the question "what am I actually in right now" costs a click and a
 * scroll to answer. Hovering the Positions tab answers it: the coin, what the
 * stake is worth at today's price, and what it is up or down.
 *
 * Prices come from the same live feed the table uses, so the two never
 * disagree. With nothing held there is nothing to say and no tooltip opens.
 */
function PositionsGlance({
  positions,
  markets,
  children,
}: {
  positions: TradePosition[]
  markets: ReadonlyMap<string, MarketRow>
  children: React.ReactNode
}) {
  const marks = useLiveMarks(positions.map((one) => one.marketKey))
  if (positions.length === 0) return <>{children}</>

  return (
    <Tooltip>
      {/* A wrapper, NOT `asChild`. The tooltip's trigger writes its own
          `data-state` (open/closed) onto whatever element it becomes — and
          handed the tab itself, that overwrote the tab's own
          `data-state="active"`, so the pill behind the selected tab
          stopped being drawn. Wrapping keeps the two states on two elements. */}
      <TooltipTrigger asChild>
        <span className="flex h-full items-center">{children}</span>
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-none p-0">
        <div className="flex flex-col gap-1 p-2">
          {positions.map((position) => {
            const mark =
              marks.get(position.marketKey) ??
              markets.get(position.marketKey)?.price ??
              position.entryPx
            const profit = positionProfit(position, mark)
            return (
              <div
                key={position.id}
                className="flex items-center gap-3 text-xs tabular-nums"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {marketSymbol(position.marketKey)}
                </span>
                <span className="shrink-0">
                  {formatUsd(positionValue(position, mark))}
                </span>
                <span
                  className={cn(
                    "w-20 shrink-0 text-right font-medium",
                    moneyTone(profit)
                  )}
                >
                  {formatSignedUsd(profit)}
                </span>
              </div>
            )
          })}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
