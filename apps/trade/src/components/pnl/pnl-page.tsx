import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { PnlJournalPanel } from "@/components/pnl/pnl-journal-panel"
import { PnlMonthGrid } from "@/components/pnl/pnl-month-grid"
import { PnlCardsPanel } from "@/components/pnl/pnl-cards-panel"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import {
  loadOlderPnlJournalPage,
  type PnlJournalPage,
  type PnlPage as PnlPageData,
} from "@/lib/api/trade/pnl"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { bucketDays } from "@/lib/trade/pnl/day-buckets"
import { tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import { groupPatterns } from "@/lib/trade/pnl/patterns"
import {
  currentMonth,
  periodStart,
  type PnlPeriod,
} from "@/lib/trade/pnl/periods"
import { walletProfitWindowStart } from "@/lib/trade/wallets"
import { showErrorToast } from "@/lib/toast/error-toast"

const NO_RING = "focus-visible:ring-0"

/**
 * The P&L page: how the trading has gone, in one place.
 *
 * Three resizable panels. The Journal takes most of the width on the left;
 * the right column holds the month grid above the three cards. The dividers
 * are remembered per browser under keys in `panel-keys.ts`, the way every
 * other workspace here remembers its own.
 *
 * Everything on the right is worked out here, in the browser, from the one
 * answer the route loaded: the grid's days and the cards' groups are pure
 * functions of the same fills and trades, so changing the month or the
 * period costs no request. Only the AI score asks the server, because a
 * model has to be called.
 */
export function PnlPage({ initial }: { initial: PnlPageData }) {
  const desktop = useWideScreen()
  const [journal, setJournal] = React.useState<PnlJournalPage>(initial.journal)
  const [olderBusy, setOlderBusy] = React.useState(false)
  const [period, setPeriod] = React.useState<PnlPeriod>("month")
  const [month, setMonth] = React.useState(() => currentMonth(initial.readAt))

  const olderDone = journal.paperBefore === null && journal.liveBefore === null
  const loadOlder = React.useCallback(async () => {
    if (olderBusy || olderDone) return
    setOlderBusy(true)
    try {
      const page = await loadOlderPnlJournalPage({
        paper: journal.paperBefore,
        live: journal.liveBefore,
      })
      setJournal((current) => {
        const known = new Set(current.trades.map((trade) => trade.id))
        const fillKeys = new Set(
          current.fills.map((fill) => `${fill.walletId}:${fill.fillId}`)
        )
        return {
          trades: [
            ...current.trades,
            ...page.trades.filter((trade) => !known.has(trade.id)),
          ],
          fills: [
            ...current.fills,
            ...page.fills.filter(
              (fill) => !fillKeys.has(`${fill.walletId}:${fill.fillId}`)
            ),
          ],
          paperBefore: page.paperBefore,
          liveBefore: page.liveBefore,
        }
      })
    } catch {
      showErrorToast("Older trades could not be read. Try again.")
    } finally {
      setOlderBusy(false)
    }
  }, [journal.liveBefore, journal.paperBefore, olderBusy, olderDone])

  const days = React.useMemo(
    () => bucketDays(initial.fills, initial.trades, walletProfitWindowStart()),
    [initial.fills, initial.trades]
  )
  const periodTrades = React.useMemo(() => {
    const since = periodStart(period, initial.readAt)
    return initial.trades.filter((trade) => trade.closedAt >= since)
  }, [initial.readAt, initial.trades, period])
  const made = React.useMemo(
    () => groupPatterns(periodTrades, "made"),
    [periodTrades]
  )
  const lost = React.useMemo(
    () => groupPatterns(periodTrades, "lost"),
    [periodTrades]
  )

  const horizontal = useRememberedPanelLayout(tradePanelLayoutKey.pnlHorizontal)
  const vertical = useRememberedPanelLayout(tradePanelLayoutKey.pnlVertical)
  const figuresRef = React.useRef<PanelImperativeHandle | null>(null)
  const cardsRef = React.useRef<PanelImperativeHandle | null>(null)
  const [figuresCollapsed, setFiguresCollapsed] = React.useState(false)
  const toggleFigures = usePanelToggle(figuresRef)
  const figuresDoubleClick = useBlankSpaceDoubleClick(toggleFigures)
  const toggleCards = usePanelToggle(cardsRef)
  const cardsDoubleClick = useBlankSpaceDoubleClick(toggleCards)

  const journalPanel = (
    <PnlJournalPanel
      journal={journal}
      wallets={initial.wallets}
      olderBusy={olderBusy}
      olderDone={olderDone}
      onLoadOlder={() => void loadOlder()}
    />
  )
  const monthsPanel = (
    <PnlMonthGrid
      days={days}
      month={month}
      onMonthChange={setMonth}
      now={initial.readAt}
    />
  )
  const cardsPanel = (
    <PnlCardsPanel
      period={period}
      onPeriodChange={setPeriod}
      made={made}
      lost={lost}
      periodTrades={periodTrades.length}
    />
  )

  if (!desktop) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        <WorkspacePanel className="flex h-auto shrink-0 flex-col">
          {monthsPanel}
        </WorkspacePanel>
        <WorkspacePanel className="flex h-auto max-h-[70vh] shrink-0 flex-col">
          {cardsPanel}
        </WorkspacePanel>
        <WorkspacePanel className="flex h-[70vh] min-w-0 shrink-0 flex-col">
          {journalPanel}
        </WorkspacePanel>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ResizablePanelGroup
        key={horizontal.layoutKey}
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={horizontal.defaultLayout}
        onLayoutChanged={horizontal.onLayoutChanged}
      >
        <ResizablePanel id="journal" defaultSize="62%" minSize="35%">
          <WorkspacePanel className="relative flex min-w-0 flex-col">
            {journalPanel}
            {figuresCollapsed ? (
              <PanelReopenTab
                side="right"
                label="Show the month grid and the cards"
                onClick={toggleFigures}
              />
            ) : null}
          </WorkspacePanel>
        </ResizablePanel>
        <ResizableHandle gap collapsed={figuresCollapsed} className={NO_RING} />
        <ResizablePanel
          id="figures"
          panelRef={figuresRef}
          collapsible
          collapsedSize="0%"
          defaultSize="38%"
          minSize="24%"
          maxSize="55%"
          onResize={(size) => setFiguresCollapsed(size.asPercentage < 0.5)}
        >
          <ResizablePanelGroup
            key={vertical.layoutKey}
            orientation="vertical"
            className="h-full min-h-0"
            defaultLayout={vertical.defaultLayout}
            onLayoutChanged={vertical.onLayoutChanged}
          >
            <ResizablePanel id="months" defaultSize="46%" minSize="25%">
              <WorkspacePanel
                className="flex flex-col"
                onDoubleClick={figuresDoubleClick}
              >
                {monthsPanel}
              </WorkspacePanel>
            </ResizablePanel>
            <ResizableHandle gap className={NO_RING} />
            <ResizablePanel
              id="cards"
              panelRef={cardsRef}
              defaultSize="54%"
              minSize="20%"
              collapsible
              collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
            >
              <WorkspacePanel
                className="flex flex-col"
                onDoubleClick={cardsDoubleClick}
              >
                {cardsPanel}
              </WorkspacePanel>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
