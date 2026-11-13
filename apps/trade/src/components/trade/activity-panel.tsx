import { PositionSideBadge } from "@/components/trade/position-side-badge"
import * as React from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import {
  ListChecksIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  WalletIcon,
  XIcon,
} from "lucide-react"

import { CrmRowMenu } from "@/components/crm/crm-row"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { CountedFilterPopover } from "@/components/trade/counted-filter-popover"
import {
  TradeDetailsPanel,
  type DetailsSubject,
} from "@/components/trade/details/trade-details-panel"
import { useRememberedId } from "@/components/trade/details/use-remembered-id"
import type { JournalOpenRow } from "@/components/trade/positions-table"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { EMPTY_JOURNAL_VIEW, type JournalView } from "@/lib/trade/panel-layout"
import {
  TRADE_MAKER_LABELS,
  tradeMaker,
  type TradeMaker,
} from "@/lib/trade/trade-maker"

import { BracketsDialog } from "@/components/trade/brackets-dialog"
import { CloseAllMenu } from "@/components/trade/close-all-menu"
import { MenuRow, MiddleMenu } from "@/components/trade/middle-menu"
import { LazyDialogFallback } from "@/components/trade/lazy-window-fallback"
import {
  OpenOrdersTable,
  PositionsTable,
  TradesTable,
} from "@/components/trade/positions-table"
import { useCopyNotes } from "@/components/social/use-copy-notes"
import type { Trading } from "@/components/trade/use-trading"
import {
  DashboardCardHeader,
  dashboardCardTabClassName,
} from "@/components/shared/dashboard-card-header"
import {
  DashboardTabs,
  UnderlineTabsTrack,
  underlineTabClassName,
  useDashboardTabStyle,
} from "@/components/shared/dashboard-tabs"
import { ErrorRow } from "@/components/ui/error-row"
import {
  loadAllPositions,
  type AllOpenPositions,
} from "@/lib/api/trade/all-positions"
import { Tabs as TabsPrimitive } from "radix-ui"
import { Button } from "@/components/ui/button"
import { focusRing } from "@/lib/layout/focus-ring"
import { stickyPanelSectionBarClassName } from "@/lib/layout/panel-section-bar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { TableSortButton } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  marketChartHref,
  marketSymbol,
  parseMarketKey,
  protocolLabel,
  type MarketCatalog,
  type MarketRow,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { PnlAmount } from "@/components/trade/pnl-amount"
import { formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { useLiveMarks } from "@/lib/trade/live-market"
import { moneyTone } from "@/lib/trade/money-tone"
import type { PanelFit } from "@/lib/trade/panel-fit"
import {
  unmatchedTradeHistories,
  type LiveTrade,
  type RemovableTradeHistory,
} from "@/lib/trade/live-trades"
import { laddersAndGridsYouPlaced } from "@/lib/trade/smart-plan"
import { venueLabel, type TradeWallet } from "@/lib/trade/wallets"
import {
  positionProfit,
  positionValue,
  type TradePosition,
} from "@/lib/trade/paper"
import { cn } from "@/lib/utils"

const PositionMarginDialog = React.lazy(() =>
  import("@/components/trade/position-margin-dialog").then((module) => ({
    default: module.PositionMarginDialog,
  }))
)

/**
 * Which of the bottom panel's tabs is showing.
 *
 * Owned by the workspace rather than by this panel, because the poll needs
 * the answer too: the Journal's trade history is only read from the exchange
 * while the Journal is the tab on screen.
 */
export type ActivityTab = "chart" | "positions" | "orders" | "journal"

/**
 * The shell's tab header (`DashboardCardTabsHeader`), built from the same
 * shell parts so the row matches it exactly. Browse market sits with the
 * chart's controls on the right, before the timeframes (Tyler, 8 Nov 2026:
 * "move the brwose market button here").
 *
 * The tabs are drawn the way Settings → Styling → Dashboard tabs says, grey
 * pills or words with a line under the one showing, as every dashboard's are
 * (Tyler, 8 Nov 2026: "wire the tabs to the dashboard tab option in
 * settings"). They are not the shell's `DashboardTabs` because they share one
 * tab set with the chart and tables they show.
 */
const MiddleTabStyle = React.createContext<"pills" | "underline">("pills")

function TabsHeader({
  lead,
  action,
  children,
}: {
  /** At the header's start: the button that reopens a shut left panel. */
  lead?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const style = useDashboardTabStyle()
  return (
    <DashboardCardHeader>
      {lead}
      <MiddleTabStyle.Provider value={style}>
        {style === "underline" ? (
          // Out to the header's top and bottom edges, so the line sits on its divider.
          <div className="-my-3 flex min-w-0 flex-1 self-stretch">
            <UnderlineTabsTrack>{children}</UnderlineTabsTrack>
          </div>
        ) : (
          <TabsList className="min-w-0 justify-start">{children}</TabsList>
        )}
      </MiddleTabStyle.Provider>
      {action ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>
      ) : null}
    </DashboardCardHeader>
  )
}

/**
 * One middle tab: its name and its count, with no icon (Tyler, 8 Nov 2026:
 * "remove the icons in the middle tabs"), as a pill in the grey track or as a
 * word over the sliding line, whichever the header draws.
 */
function MiddleTab({
  label,
  count,
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  label: React.ReactNode
  count?: number
}) {
  const style = React.useContext(MiddleTabStyle)
  const inside = (
    <>
      {label}
      {count !== undefined ? (
        <span className="ml-[3px] inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-xs leading-none font-medium text-muted-foreground tabular-nums">
          {count}
        </span>
      ) : null}
    </>
  )
  if (style === "pills") {
    return (
      <TabsTrigger className={cn("flex-none", dashboardCardTabClassName, className)} {...props}>
        {inside}
      </TabsTrigger>
    )
  }
  return (
    <TabsPrimitive.Trigger
      data-slot="dashboard-tab"
      className={cn(underlineTabClassName, dashboardCardTabClassName, className)}
      {...props}
    >
      {inside}
    </TabsPrimitive.Trigger>
  )
}

/** Below this width the middle header draws its short forms. */
const NARROW_HEADER_PX = 1100

/** Whatever is highlighted right now, dropped. */
function clearHighlight(): void {
  if (typeof window === "undefined") return
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) selection.removeAllRanges()
}

type PositionGlanceColumn = "market" | "type" | "value" | "profit"

function positionGlanceDefaultDirection(
  column: PositionGlanceColumn
): "asc" | "desc" {
  return column === "market" || column === "type" ? "asc" : "desc"
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
 * The dashboard's middle panel (the Admin 3 panel design, 7 Nov 2026): the
 * chart, what you are holding, what you have asked for, and how the trades
 * that are finished actually went, as tabs (Tyler: "remove the bottom panel
 * and move into the middle panel as tabs so it looks like this [marketname
 * chart][positions][journal]", with Open orders kept as its own tab).
 *
 * The chart tab stays mounted under the others, so its live feed and its
 * drawings never reload when a table is looked at.
 */
export function ActivityPanel({
  protocol,
  network,
  trading,
  tab,
  onTabChange,
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
  chart,
  controls,
  wallet,
  menuRows,
  lead,
  detailsSlot,
  chartMarketKey,
  onShowOnChart,
  onDetailsOpened,
  journalView,
  onJournalViewChange,
}: {
  /** The page's exchange and network, the first tab of the Positions glance. */
  protocol: ProtocolId
  network: NetworkId
  /**
   * Where the right panel draws, the Trade dashboard's third panel (Tyler,
   * 10 Nov 2026). Null on Overview and before the panel is on screen.
   */
  detailsSlot?: HTMLElement | null
  /** The coin on the chart, which the chart and Open orders tabs open. */
  chartMarketKey?: string | null
  /** Draws a Journal trade on the chart and goes to the chart tab. */
  onShowOnChart?: (trade: LiveTrade) => void
  /** A row was opened in the right panel, so a phone can show it. */
  onDetailsOpened?: () => void
  /** The Journal's filter and its hide-practice switch, kept on the account. */
  journalView?: JournalView
  onJournalViewChange?: (view: JournalView) => void
  /**
   * At the header's start, before the tabs: the button that reopens a shut
   * left panel, as the shell's dashboards have it (Tyler, 8 Nov 2026: "put
   * the uncollapse here like how shell does it").
   */
  lead?: React.ReactNode
  /**
   * The market's own rows in the ⋮, after Wallet: Folders and Pin to top
   * (8 Nov 2026, from the right panel that went).
   */
  menuRows?: React.ReactNode
  /**
   * The chart's controls in the one middle header (Tyler, 7 Nov 2026: "There
   * should only be one middle header"): the timeframe, Indicators, View
   * options and Browse market. Told whether the panel is narrow, so the
   * timeframe can draw its short form.
   */
  controls?: (narrow: boolean) => React.ReactNode
  /** The wallet menu, opened from its row in the ⋮, and the wallet in use. */
  wallet?: {
    name: string | null
    menu: (trigger: React.ReactElement) => React.ReactNode
  }
  /**
   * The first tab: the market's chart under its header row, named after the
   * market ("BTC-USD chart").
   */
  chart?: {
    label: string
    /**
     * Drawn inside the chart tab after its name: the "i" whose tooltip holds
     * the market's facts (Tyler, 8 Nov 2026: "for the market info, just add
     * the tooltip beside market ticker on the middle tab").
     */
    info?: React.ReactNode
    content: React.ReactNode
    /** Full screen: the chart alone, with the tab row out of sight but the chart never re-drawn. */
    only?: boolean
  }
  trading: Trading
  tab: ActivityTab
  onTabChange: (tab: ActivityTab) => void
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
  const [editing, setEditing] = React.useState<TradePosition | null>(null)
  const [changingMargin, setChangingMargin] =
    React.useState<TradePosition | null>(null)
  // Offered when the exchange allows either of the two. The window itself says
  // which half it cannot do, so one refused half never hides the other.
  const canChangeMargin = canChangeLeverage || canAdjustMargin
  const [flipping, setFlipping] = React.useState<TradePosition | null>(null)
  const unmatchedHistory = React.useMemo(
    () => unmatchedTradeHistories(trading.journalFills, trading.positions),
    [trading.journalFills, trading.positions]
  )
  // ----- The Journal's filter: who placed it, and practice hidden ----------
  const view = journalView ?? EMPTY_JOURNAL_VIEW
  const makerOf = React.useCallback(
    (row: { fills: LiveTrade["fills"]; copiedFrom?: string }): TradeMaker =>
      tradeMaker(row.fills, row.copiedFrom),
    []
  )
  const keepJournalRow = React.useCallback(
    (row: { live: boolean; fills: LiveTrade["fills"]; copiedFrom?: string }) =>
      (!view.hidePractice || row.live) &&
      (view.makers.length === 0 || view.makers.includes(makerOf(row))),
    [view.hidePractice, view.makers, makerOf]
  )
  const journalTrades = React.useMemo(
    () => trading.trades.filter(keepJournalRow),
    [trading.trades, keepJournalRow]
  )
  const journalHistory = React.useMemo(
    () => unmatchedHistory.filter(keepJournalRow),
    [unmatchedHistory, keepJournalRow]
  )
  const journalFilterItems = React.useMemo(
    () =>
      [...trading.trades, ...unmatchedHistory]
        .filter((row) => !view.hidePractice || row.live)
        .map((row) => makerOf(row)),
    [trading.trades, unmatchedHistory, view.hidePractice, makerOf]
  )

  // What the Journal lists right now, so a tick never outlives its row being
  // filtered away and Remove (n) only ever means rows on screen.
  const removableHistory = React.useMemo(
    () => [
      ...journalTrades,
      ...journalHistory.filter((history) => !history.open),
    ],
    [journalTrades, journalHistory]
  )
  // The bin on a row and the Remove button over ticked rows both ask first.
  // Nothing here can be put back from the screen, and the two lists sit under
  // a chart people click around on all day. One row or many, it is the same
  // question, so one dialog holds whichever list is being asked about.
  const [removingTrades, setRemovingTrades] = React.useState<
    RemovableTradeHistory[] | null
  >(null)

  // Which Journal rows are ticked for a mass remove, by trade id.
  const journalTicks = useSelection()
  const { setSelected: setJournalTicks } = journalTicks
  const tickedTrades = React.useMemo(
    () =>
      removableHistory.filter((trade) => journalTicks.selected.has(trade.id)),
    [removableHistory, journalTicks.selected]
  )

  // A tick never outlives its row. A poll that removes a trade — or a mass
  // remove that just went through — takes the tick with it, so Remove (n)
  // can only ever mean rows that are on screen right now.
  React.useEffect(() => {
    const listed = new Set(removableHistory.map((trade) => trade.id))
    setJournalTicks((current) => {
      const next = new Set([...current].filter((id) => listed.has(id)))
      return next.size === current.size ? current : next
    })
  }, [removableHistory, setJournalTicks])

  // Copies of another trader that did not happen, listed in the Journal with
  // their reasons.
  const copyNotes = useCopyNotes(
    React.useMemo(() => wallets.map((wallet) => wallet.id), [wallets]),
    tab === "journal",
    trading.trades
  )

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
   * What this table lists: every position held (Tyler, 10 Nov 2026: "fix the
   * positions tab to show all positions and not just manual trades"). A coin
   * a grid or DCA ladder you placed is running carries a Grid or DCA badge on
   * its row, so the same holding in the Grid block and here reads as one.
   * Until then, from 24 Aug 2026, those coins were left out of this tab.
   */
  const visible = trading.positions

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

  // ----- The right panel's open record, per tab ---------------------------
  const [openPositionId, setOpenPositionId] = useRememberedId("trade-details-open-position")
  const [openJournalId, setOpenJournalId] = useRememberedId("trade-details-open-journal")
  const [positionRows, setPositionRows] = React.useState<string[]>([])
  const [journalRows, setJournalRows] = React.useState<string[]>([])
  // The remembered record, or the first row when it has gone or none was
  // picked yet, so the panel is never empty while the list has rows.
  const shownPositionId =
    openPositionId && visible.some((one) => one.id === openPositionId)
      ? openPositionId
      : (positionRows[0] ?? null)
  const shownJournalId =
    openJournalId && journalRows.includes(openJournalId)
      ? openJournalId
      : (journalRows[0] ?? null)
  const subject: DetailsSubject | null = (() => {
    if (tab === "positions") {
      const position = visible.find((one) => one.id === shownPositionId)
      return position ? { kind: "position", position } : null
    }
    if (tab === "journal") {
      const trade = journalTrades.find((one) => one.id === shownJournalId)
      if (trade) return { kind: "trade", trade }
      const history = journalHistory.find((one) => one.id === shownJournalId)
      return history ? { kind: "history", history } : null
    }
    return chartMarketKey ? { kind: "coin", marketKey: chartMarketKey } : null
  })()
  const openJournalRow = (row: JournalOpenRow) => {
    const id = row.kind === "finished" ? row.trade.id : row.history.id
    setOpenJournalId(id)
    // Drawn on the chart under the tab, which stays where it is: the chart
    // tab is one press away, and Show on chart is that press.
    if (row.kind === "finished") onShowTrade(row.trade)
    onDetailsOpened?.()
  }
  const openPosition = (position: TradePosition) => {
    setOpenPositionId(position.id)
    onDetailsOpened?.()
  }

  // ----- Mass select and the right-click menus ----------------------------
  const [positionMass, setPositionMass] = React.useState(false)
  const [journalMass, setJournalMass] = React.useState(false)
  const positionTicks = useSelection()
  const { setSelected: setPositionTicks } = positionTicks
  const tickedPositions = React.useMemo(
    () => visible.filter((one) => positionTicks.selected.has(one.id)),
    [visible, positionTicks.selected]
  )
  React.useEffect(() => {
    const listed = new Set(visible.map((one) => one.id))
    setPositionTicks((current) => {
      const next = new Set([...current].filter((id) => listed.has(id)))
      return next.size === current.size ? current : next
    })
  }, [visible, setPositionTicks])
  const [closingTicked, setClosingTicked] = React.useState<TradePosition[] | null>(null)
  const [confirmingClose, setConfirmingClose] = React.useState<TradePosition | null>(null)
  const [positionMenu, setPositionMenu] = React.useState<{
    position: TradePosition
    x: number
    y: number
  } | null>(null)
  const [journalMenu, setJournalMenu] = React.useState<{
    row: JournalOpenRow
    x: number
    y: number
  } | null>(null)
  const togglePositionMass = (startWith?: string) => {
    setPositionMass(!positionMass)
    setPositionTicks(positionMass || !startWith ? new Set() : new Set([startWith]))
  }
  const toggleJournalMass = (startWith?: string) => {
    setJournalMass(!journalMass)
    setJournalTicks(journalMass || !startWith ? new Set() : new Set([startWith]))
  }

  // Resolved against the live list every render, so a position closed by its
  // own stop while its window is open closes the window instead of editing
  // something that is no longer there.
  const editingNow =
    trading.positions.find((one) => one.id === editing?.id) ?? null
  const marginNow =
    trading.positions.find((one) => one.id === changingMargin?.id) ?? null

  /**
   * The Close all list, opened from whatever is handed in: the middle
   * header's ⋮ row, or the details panel's Close all trades button.
   */
  const closeAllMenu = (trigger: React.ReactElement) => (
    <CloseAllMenu
      trigger={trigger}
      positions={trading.positions}
      watched={trading.watchOrders}
      smart={standing}
      restingOrders={trading.orders.length}
      markets={markets}
      realWallets={realWallets}
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
  )

  // A count that is not known yet shows nothing rather than a zero — before
  // the first read, and after a first read that failed, "0" would be claiming
  // an answer the panel does not have.
  const countOf = (length: number) =>
    !trading.settled || trading.failed ? undefined : length

  // The three words and Close all together are wider than a phone. The word
  // stays on the tab that is open, and the other two keep their picture and
  // their count. A screen reader still reads the full name of all three.
  // Every tab keeps its name: with no icon there is nothing else to show,
  // and a header too narrow for them all scrolls its tab row sideways.
  const tabProps = (_which: ActivityTab, word: string) => ({
    label: <span>{word}</span>,
    "aria-label": word,
  })

  // ----- Growing the panel to fit the tab you just pressed -----------------
  //
  // Asking for the panel's height bumps this counter and the effect below
  // does the measuring, because the rows can only be measured once the tab
  // holding them is on screen and an inactive tab holds nothing at all.
  const root = React.useRef<HTMLDivElement | null>(null)
  // Narrow: the header's tabs keep the word on the open tab only, and the
  // timeframe draws its short form, so one row holds the tabs and the chart's
  // controls together. Measured on the panel, which a divider can narrow.
  const [narrow, setNarrow] = React.useState(false)
  React.useEffect(() => {
    const element = root.current
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) =>
      setNarrow((entry?.contentRect.width ?? 0) < NARROW_HEADER_PX)
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const [landed, setLanded] = React.useState(0)
  const measured = React.useRef(0)

  // The open tab, brought fully into view when the row is too narrow to hold
  // all three. On a phone the row slides sideways, and the tab somebody has
  // just opened is the one whose count must not be the part hanging off the
  // end. `scrollLeft` is set by hand rather than through `scrollIntoView`,
  // which also scrolls every box above this one.
  React.useEffect(() => {
    const list = root.current?.querySelector('[data-slot="tabs-list"]')
    if (!(list instanceof HTMLElement)) return
    const open = list.querySelector('[data-state="active"]')
    if (!(open instanceof HTMLElement)) return
    const overshoot = open.offsetLeft + open.offsetWidth - list.clientWidth
    if (overshoot > list.scrollLeft) list.scrollLeft = overshoot
    else if (open.offsetLeft < list.scrollLeft) list.scrollLeft = open.offsetLeft
  }, [tab])

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
        onTabChange(value as ActivityTab)
        setLanded((count) => count + 1)
        clearHighlight()
      }}
      // The tab row slides sideways rather than running under Close all on a
      // phone, where four tabs and their counts are wider than the screen.
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card [&_[data-slot=tabs-list]]:overflow-x-auto"
    >
      {/* Out of sight in full screen, without unmounting the chart's tab. */}
      <div className={chart?.only ? "hidden" : "contents"}>
      <TabsHeader
        lead={lead}
        action={
          <>
            {/* Removes every ticked Journal row at once, through the same
                confirm the bin on one row uses. Only there once something is
                ticked — a button that could do nothing would just be
                furniture. */}
            {tab === "positions" && positionMass && tickedPositions.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={trading.busy}
                aria-label={`Close ${tickedPositions.length} ticked positions`}
                onClick={() => setClosingTicked(tickedPositions)}
              >
                <XIcon className="size-4" />
                <span className="max-sm:sr-only">Close </span>(
                {tickedPositions.length})
              </Button>
            ) : null}
            {(tab === "positions" && positionMass) || (tab === "journal" && journalMass) ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => (tab === "positions" ? togglePositionMass() : toggleJournalMass())}
              >
                <ListChecksIcon className="size-4" />
                <span className="max-sm:sr-only">Hide select</span>
              </Button>
            ) : null}
            {tab === "journal" && onJournalViewChange ? (
              <CountedFilterPopover
                items={journalFilterItems}
                groups={[
                  {
                    label: "Placed by",
                    value: view.makers.length === 0 ? null : view.makers,
                    valueOf: (maker) => maker,
                    labelOf: (maker) => TRADE_MAKER_LABELS[maker],
                    onChange: (value) =>
                      onJournalViewChange({ ...view, makers: (value ?? []) as TradeMaker[] }),
                  },
                ]}
                extraActive={view.hidePractice ? 1 : 0}
                extra={
                  <div className="flex items-center justify-between gap-3 px-2">
                    <Label htmlFor="journal-hide-practice" className="text-sm font-normal">
                      Hide practice trades
                    </Label>
                    <Switch
                      id="journal-hide-practice"
                      checked={view.hidePractice}
                      onCheckedChange={(on) => onJournalViewChange({ ...view, hidePractice: on })}
                    />
                  </div>
                }
                onClear={() => onJournalViewChange({ hidePractice: false, makers: [] })}
              />
            ) : null}
            {tab === "journal" && journalMass && tickedTrades.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={trading.busy}
                aria-label={`Remove ${tickedTrades.length} ticked trades`}
                onClick={() => setRemovingTrades(tickedTrades)}
              >
                <Trash2Icon className="size-4" />
                <span className="max-sm:sr-only">Remove </span>(
                {tickedTrades.length})
              </Button>
            ) : null}
            {controls?.(narrow)}
            <MiddleMenu>
              {wallet
                ? wallet.menu(
                    <MenuRow
                      icon={<WalletIcon />}
                      label="Wallet"
                      detail={wallet.name ?? undefined}
                    />
                  )
                : null}
              {menuRows}
            {/* The emergency button: one press opens the list of what can go,
                a second press does it. Positions, watched prices and smart
                orders all start ticked, and untick whatever should stay —
                closing what you hold and standing your waiting orders down are
                two different decisions, and a fast market is exactly when
                somebody wants one without the other. */}
            {closable > 0
              ? closeAllMenu(
                  <MenuRow
                    icon={<XIcon />}
                    label="Close all"
                    disabled={trading.busy}
                  />
                )
              : null}
            </MiddleMenu>
            {detailsSlot ? <PanelReopenButton side="right" label="Show the trade" /> : null}
          </>
        }
      >
        {chart ? (
          <MiddleTab
            value="chart"
            {...tabProps("chart", chart.label)}
            label={
              <>
                {tabProps("chart", chart.label).label}
                {chart.info}
              </>
            }
          />
        ) : null}
        <PositionsGlance
          protocol={protocol}
          network={network}
          positions={visible}
          markets={markets}
          onSelectMarket={onSelectMarket}
        >
          <MiddleTab
            value="positions"
            {...tabProps("positions", "Positions")}
            count={countOf(visible.length)}
            onPointerDown={pressTab("positions")}
          />
        </PositionsGlance>
        <MiddleTab
          value="orders"
          {...tabProps("orders", "Open orders")}
          count={countOf(trading.orders.length + trading.watchOrders.length)}
          onPointerDown={pressTab("orders")}
        />
        <MiddleTab
          value="journal"
          {...tabProps("journal", "Journal")}
          count={countOf(journalTrades.length + journalHistory.length)}
          onPointerDown={pressTab("journal")}
        />
      </TabsHeader>
      </div>

      {chart ? (
        <TabsContent
          value="chart"
          forceMount
          className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          {chart.content}
        </TabsContent>
      ) : null}

      <TabsContent value="positions" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <PositionsTable
            positions={visible}
            pendingAdditions={trading.pendingAdditions}
            markets={markets}
            // What a real position's fee total is added up from.
            fills={trading.fills}
            smartOrders={trading.smartOrders}
            walletName={walletName}
            realWallets={realWallets}
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
            openId={shownPositionId}
            onOpen={openPosition}
            onRows={setPositionRows}
            onRightClick={(position, x, y) => setPositionMenu({ position, x, y })}
            ticks={
              positionMass
                ? {
                    ticked: positionTicks.selected,
                    toggle: positionTicks.toggle,
                    toggleVisible: positionTicks.toggleVisible,
                    state: positionTicks.selectAllState,
                  }
                : null
            }
            confirming={confirmingClose}
            onConfirmingChange={setConfirmingClose}
          />
          <ScrollBar orientation="horizontal" />
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
            realWallets={realWallets}
            busy={trading.busy}
            settled={trading.settled}
            failed={trading.failed}
            onRetry={trading.retry}
            onSelectMarket={onSelectMarket}
            onCancel={(order) => void trading.cancel(order)}
            onResume={trading.resumeSmartOrder}
          />
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="journal" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <TradesTable
            trades={journalTrades}
            unmatchedHistory={journalHistory}
            copyNotes={copyNotes.notes}
            onRemoveCopyNote={copyNotes.remove}
            markets={markets}
            walletName={walletName}
            openId={shownJournalId}
            onRows={setJournalRows}
            onRightClick={(row, x, y) => setJournalMenu({ row, x, y })}
            selectShown={journalMass}
            busy={trading.busy}
            settled={trading.settled}
            failed={trading.failed}
            onRetry={trading.retry}
            onLoadOlder={() => void trading.loadOlderTrades()}
            olderBusy={trading.olderTradesBusy}
            olderDone={trading.olderTradesDone}
            onOpenRow={openJournalRow}
            onSelectMarket={onSelectMarket}
            onRemove={(trade) => setRemovingTrades([trade])}
            ticked={journalTicks.selected}
            onTickTrade={journalTicks.toggle}
            onTickVisible={journalTicks.toggleVisible}
            tickAllState={journalTicks.selectAllState}
          />
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </TabsContent>

      {positionMenu ? (
        <CrmRowMenu
          at={positionMenu}
          massSelect={{
            on: positionMass,
            onToggle: () => togglePositionMass(positionMenu.position.id),
          }}
          items={[
            {
              label: "Add to position",
              icon: <PlusIcon className="size-4" />,
              onSelect: () => onAddToPosition(positionMenu.position),
            },
            ...(positionMenu.position.owned
              ? []
              : [
                  {
                    label: "Stop and target",
                    icon: <SettingsIcon className="size-4" />,
                    onSelect: () => setEditing(positionMenu.position),
                  },
                ]),
            {
              label: positionMenu.position.owned ? "Sell all" : "Close position",
              icon: <XIcon className="size-4" />,
              destructive: true,
              onSelect: () => setConfirmingClose(positionMenu.position),
            },
          ]}
          onClose={() => setPositionMenu(null)}
        />
      ) : null}
      {journalMenu ? (
        <CrmRowMenu
          at={journalMenu}
          massSelect={{
            on: journalMass,
            onToggle: () =>
              toggleJournalMass(
                journalMenu.row.kind === "finished"
                  ? journalMenu.row.trade.id
                  : journalMenu.row.history.open
                    ? undefined
                    : journalMenu.row.history.id
              ),
          }}
          items={
            journalMenu.row.kind === "unmatched" && journalMenu.row.history.open
              ? []
              : [
                  {
                    label: "Delete",
                    icon: <Trash2Icon className="size-4" />,
                    destructive: true,
                    onSelect: () =>
                      setRemovingTrades([
                        journalMenu.row.kind === "finished"
                          ? journalMenu.row.trade
                          : journalMenu.row.history,
                      ]),
                  },
                ]
          }
          onClose={() => setJournalMenu(null)}
        />
      ) : null}
      <ConfirmDialog
        open={closingTicked !== null}
        onOpenChange={(open) => {
          if (!open) setClosingTicked(null)
        }}
        title={
          closingTicked && closingTicked.length === 1
            ? `Close ${marketSymbol(closingTicked[0].marketKey)}?`
            : `Close ${closingTicked?.length ?? 0} positions?`
        }
        description={
          closingTicked && closingTicked.some((one) => realWallets.has(one.walletId))
            ? "Each one is sold at whatever its market costs right now, real money included. Only the ticked positions close."
            : "Each one is sold at whatever its market costs right now. Only the ticked positions close."
        }
        confirmLabel={
          closingTicked && closingTicked.length === 1 ? "Close it" : "Close them"
        }
        onConfirm={() => {
          if (closingTicked) void trading.closeSome(closingTicked)
          setClosingTicked(null)
          togglePositionMass()
        }}
      />
      {detailsSlot
        ? createPortal(
            <TradeDetailsPanel
              subject={subject}
              data={{
                markets,
                positions: visible,
                trades: trading.trades,
                fills: trading.journalFills,
                positionFills: trading.fills,
                smartOrders: trading.smartOrders,
                walletName,
                busy: trading.busy,
              }}
              actions={{
                onClose: setConfirmingClose,
                closeAll: closeAllMenu,
                onAdd: onAddToPosition,
                onEdit: setEditing,
                onShowOnChart: (trade) => onShowOnChart?.(trade),
                onRemove: (trade) => setRemovingTrades([trade]),
                onOpenTrade: (trade) => {
                  onTabChange("journal")
                  setOpenJournalId(trade.id)
                  onShowTrade(trade)
                },
              }}
            />,
            detailsSlot
          )
        : null}
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
          removingTrades && removingTrades.length > 1
            ? "Remove them"
            : "Remove it"
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

      {marginNow ? (
        <React.Suspense
          fallback={
            <LazyDialogFallback
              title="Change position margin"
              onClose={() => setChangingMargin(null)}
            />
          }
        >
          <PositionMarginDialog
            position={marginNow}
            maxLeverage={markets.get(marginNow.marketKey)?.maxLeverage ?? null}
            walletName={walletName(marginNow.walletId)}
            canChangeLeverage={canChangeLeverage}
            leverageRefusal={leverageRefusal}
            canAdjustMargin={canAdjustMargin}
            marginRefusal={marginRefusal}
            busy={trading.busy}
            onSetLeverage={trading.setPositionLeverage}
            onAdjustMargin={trading.adjustPositionMargin}
            onDismiss={() => setChangingMargin(null)}
          />
        </React.Suspense>
      ) : null}

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
            ? `Flip ${marketSymbol(flipping.marketKey)} to ${flipping.szi > 0 ? "short" : "long"} in ${walletName(flipping.walletId)}?`
            : "Flip this position?"
        }
        description="Close this position at the market price, then immediately request the same number of coins in the opposite direction. Stops and targets are cleared. The new entry can fail or fill only partly after the close. Exchange fees apply."
        confirmLabel="Flip trade"
        destructive={false}
        onConfirm={() => {
          if (flipping) void trading.flip(flipping.walletId, flipping.marketKey, flipping.szi)
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
 * Two tabs (Tyler, 13 Nov 2026: "[Hyperliquid][All protocols]"): this
 * exchange's positions, the ones the Positions tab lists, and every exchange's
 * at once. This exchange's rows come from the same live feed the table uses,
 * so the two never disagree; the other exchanges' rows are read from the
 * server when the All protocols tab opens (see `useEveryPosition`). Each row
 * opens its market, so the glance is a popover rather than a tooltip.
 */
type GlanceTab = "here" | "all"

type GlanceRow = {
  position: TradePosition
  symbol: string
  /** The exchange's name, shown after the ticker on the All protocols tab. */
  venue: string | null
  type: string
  value: number
  valueLabel: string
  profit: number
  profitLabel: string
}

/** How long one read of every exchange is reused, as the header button's. */
const EVERYWHERE_FRESH_MS = 15_000

/**
 * Every exchange's positions, read when the All protocols tab is showing. An
 * answer younger than fifteen seconds is reused, so hovering the tab again
 * does not ask every exchange again, and only one read is ever on its way.
 * The last answer stays on screen while a new one is read.
 */
function useEveryPosition(wanted: boolean) {
  const [answer, setAnswer] = React.useState<AllOpenPositions | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const readAt = React.useRef(0)
  const reading = React.useRef(false)
  React.useEffect(() => {
    if (!wanted || reading.current) return
    if (Date.now() - readAt.current < EVERYWHERE_FRESH_MS) return
    reading.current = true
    loadAllPositions()
      .then((next) => {
        readAt.current = Date.now()
        setAnswer(next)
        setFailed(false)
      })
      .catch(() => setFailed(true))
      .finally(() => {
        reading.current = false
      })
  }, [wanted, attempt])
  const retry = () => {
    setFailed(false)
    setAttempt((count) => count + 1)
  }
  return { answer, failed, retry }
}

function PositionsGlance({
  protocol,
  network,
  positions,
  markets,
  onSelectMarket,
  children,
}: {
  protocol: ProtocolId
  network: NetworkId
  positions: TradePosition[]
  markets: ReadonlyMap<string, MarketRow>
  onSelectMarket: (marketKey: string) => void
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState<GlanceTab>("here")
  const everywhere = useEveryPosition(open && tab === "all")
  // The page's own exchange and network are the first tab's live rows, so the
  // server's copy of them is left out rather than listed twice.
  const onThisPage = React.useCallback(
    (marketKey: string) => {
      const ref = parseMarketKey(marketKey)
      return ref?.protocol === protocol && ref.network === network
    },
    [protocol, network]
  )
  const elsewhere = React.useMemo(
    () =>
      (everywhere.answer?.positions ?? []).filter(
        (position) => !onThisPage(position.marketKey)
      ),
    [everywhere.answer, onThisPage]
  )
  const shown = tab === "here" ? positions : [...positions, ...elsewhere]
  const marks = useLiveMarks(shown.map((one) => one.marketKey))
  const { sort, direction, toggleSort } = useTableSort<PositionGlanceColumn>(
    "profit",
    "desc",
    positionGlanceDefaultDirection
  )
  const rows: GlanceRow[] = shown
    .map((position) => {
      const mark =
        marks.get(position.marketKey) ??
        markets.get(position.marketKey)?.price ??
        everywhere.answer?.marks[position.marketKey] ??
        position.entryPx
      const profit = positionProfit(position, mark)
      const value = positionValue(position, mark)
      const ref = parseMarketKey(position.marketKey)
      return {
        position,
        symbol: marketSymbol(position.marketKey),
        venue: tab === "all" && ref ? venueLabel(ref.protocol, ref.network) : null,
        type: position.szi > 0 ? "Long" : "Short",
        value,
        valueLabel: formatUsd(value),
        profit,
        profitLabel: formatSignedUsd(profit),
      }
    })
    .sort((a, b) => {
      const compared =
        sort === "market"
          ? a.symbol.localeCompare(b.symbol)
          : sort === "type"
            ? a.type.localeCompare(b.type)
            : sort === "value"
              ? a.value - b.value
              : a.profit - b.profit
      return direction === "asc" ? compared : -compared
    })
  const totalValue = rows.reduce((sum, row) => sum + row.value, 0)
  const totalProfit = rows.reduce((sum, row) => sum + row.profit, 0)
  const hoverTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHover = React.useCallback(() => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }, [])
  const openSoon = React.useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== "mouse") return
      clearHover()
      hoverTimer.current = setTimeout(() => setOpen(true), 120)
    },
    [clearHover]
  )
  const closeSoon = React.useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== "mouse") return
      clearHover()
      hoverTimer.current = setTimeout(() => setOpen(false), 220)
    },
    [clearHover]
  )
  React.useEffect(() => clearHover, [clearHover])

  const pick = (position: TradePosition) => {
    clearHover()
    setOpen(false)
    // A coin on this exchange opens on this page; one on another exchange
    // opens that exchange's chart.
    if (onThisPage(position.marketKey)) {
      onSelectMarket(position.marketKey)
      return
    }
    const href = marketChartHref(position.marketKey)
    if (href) void navigate({ href })
  }

  const here = protocolLabel(protocol)
  const reading = tab === "all" && !everywhere.answer && !everywhere.failed
  const short = tab === "all" && (everywhere.answer?.unavailable.length ?? 0) > 0

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        clearHover()
        setOpen(next)
      }}
    >
      {/* A wrapper, NOT `asChild` on the tab. The popover's trigger writes its
          own `data-state` (open/closed) onto whatever element it becomes, and
          handed the tab itself, that overwrote the tab's own
          `data-state="active"`, so the pill behind the selected tab stopped
          being drawn. Wrapping keeps the two states on two elements. */}
      <PopoverTrigger asChild>
        <span
          data-positions-glance-trigger
          className="flex h-full items-center"
          onPointerEnter={openSoon}
          onPointerLeave={closeSoon}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-104 max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={clearHover}
        onPointerLeave={closeSoon}
      >
        <DashboardCardHeader>
          <DashboardTabs
            value={tab}
            onValueChange={(value) => setTab(value as GlanceTab)}
            tabs={[
              { value: "here", label: here, count: positions.length },
              {
                value: "all",
                label: "All protocols",
                count: everywhere.answer ? positions.length + elsewhere.length : undefined,
              },
            ]}
          />
        </DashboardCardHeader>
        <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_6rem] gap-3 border-b px-3 text-[11px] text-muted-foreground">
          <TableSortButton
            active={sort === "market"}
            direction={direction}
            className="gap-1 text-[11px] sm:text-[11px]"
            onClick={() => toggleSort("market")}
          >
            Ticker
          </TableSortButton>
          <TableSortButton
            active={sort === "type"}
            direction={direction}
            className="gap-1 text-[11px] sm:text-[11px]"
            onClick={() => toggleSort("type")}
          >
            Type
          </TableSortButton>
          <TableSortButton
            active={sort === "value"}
            direction={direction}
            className="justify-end gap-1 text-[11px] sm:text-[11px]"
            onClick={() => toggleSort("value")}
          >
            Value
          </TableSortButton>
          <TableSortButton
            active={sort === "profit"}
            direction={direction}
            className="justify-end gap-1 text-[11px] sm:text-[11px]"
            onClick={() => toggleSort("profit")}
          >
            Current P&amp;L
          </TableSortButton>
        </div>
        <ScrollArea viewportClassName="max-h-[calc(var(--radix-popover-content-available-height)-8.5rem)]">
          {rows.map(({ position, symbol, venue, type, valueLabel, profit, profitLabel }) => (
            <button
              key={position.id}
              type="button"
              aria-label={`Open ${symbol} market${venue ? ` on ${venue}` : ""}, ${type}, ${valueLabel} value, ${profitLabel} current profit and loss`}
              className={cn("grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_5rem_5rem_6rem] items-center gap-3 px-3 py-2 text-left text-xs tabular-nums transition-colors hover:bg-muted focus-visible:bg-muted", focusRing)}
              onClick={() => pick(position)}
            >
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate font-medium">{symbol}</span>
                {venue ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">{venue}</span>
                ) : null}
              </span>
              <span className="whitespace-nowrap">
                <PositionSideBadge position={position} />
              </span>
              <span className="text-right">{valueLabel}</span>
              <PnlAmount
                className={cn("text-right font-medium", moneyTone(profit))}
              >
                {profitLabel}
              </PnlAmount>
            </button>
          ))}
          {reading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" />
              Reading the other exchanges
            </div>
          ) : tab === "all" && everywhere.failed ? (
            <ErrorRow
              message="The other exchanges could not be read."
              onRetry={everywhere.retry}
              className="px-3 py-2 text-xs"
            />
          ) : rows.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {tab === "here"
                ? `No open positions on ${here}.`
                : "No open positions on any exchange."}
            </p>
          ) : null}
          {short ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Some wallets did not answer, so this list may be short.
            </p>
          ) : null}
        </ScrollArea>
        {/* The sums of the rows on the tab showing, outside the scrolling
            list so they stay in view (Tyler, 13 Nov 2026: "add total to the
            footer"). */}
        {rows.length > 0 ? (
          <div
            data-positions-glance-total
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_5rem_5rem_6rem] items-center gap-3 px-3 py-2 text-xs tabular-nums",
              // The panel's own footer fill; only the line above it, since the
              // popover's edge is the line below.
              stickyPanelSectionBarClassName,
              "border-b-0"
            )}
          >
            <span className="font-medium text-muted-foreground">Total</span>
            <span aria-hidden />
            <span className="text-right font-semibold">{formatUsd(totalValue)}</span>
            <PnlAmount
              className={cn("text-right font-semibold", moneyTone(totalProfit))}
            >
              {formatSignedUsd(totalProfit)}
            </PnlAmount>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
