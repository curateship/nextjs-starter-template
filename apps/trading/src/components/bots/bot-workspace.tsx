import * as React from "react"
import { ClientOnly, Link, useRouter } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { toast } from "sonner"

import {
  BacktestMarketsTable,
  sortMarketRows,
  useMarketSort,
} from "@/components/backtest/backtest-markets-table"
import { truncateWords } from "@/lib/format"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { StrategyTester } from "@/components/backtest/strategy-tester"
import { BotEventsList } from "@/components/bots/bot-events-list"
import {
  BotLifecycleControls,
  type BotCommand,
} from "@/components/bots/bot-lifecycle-controls"
import { BotLiveChartPanel } from "@/components/bots/bot-live-chart-panel"
import { BotMarketsDialog } from "@/components/bots/bot-markets-dialog"
import { buildBotRungLines } from "@/components/bots/bot-rung-lines"
import { buildBotMarketRows } from "@/components/bots/bot-market-rows"
import { buildBotResult } from "@/components/bots/bot-result"
import { BotSummaryPanel } from "@/components/bots/bot-summary-panel"
import { useBotLive } from "@/components/bots/use-bot-live"
import { BotSettingsBanner } from "@/components/bots/bot-settings-banner"
import { WorkerOfflineBanner } from "@/components/bots/worker-offline-banner"
import { ViewSwitcher } from "@/components/automations/automation-view-switcher"
import { IconButton } from "@/components/icon-button"
import { PanelToggle } from "@/components/panel-toggles"
import { togglePanel } from "@/lib/panel-collapse"
import { ArrowLeftIcon, Loader2Icon, SettingsIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import {
  getBotErrorMessage,
  loadBotDetail,
  renameBot,
  sendCommand,
  type BotDetailResponse,
} from "@/lib/api/bots"
import { PREVIOUS_RUN_NAME_PREFIX } from "@/lib/backtest/types"
import { isAutomationConfig } from "@/lib/strategies/strategy-config"
import type { CandleInterval } from "@/lib/hl/ws"
import { useIntervalLoader } from "@/lib/use-interval-loader"
import { usePanelLayout } from "@/lib/use-panel-layout"
import { usePersistedState } from "@/lib/use-persisted-state"

/**
 * Viewer for one saved bot run — the same four panels as the editor's Bot
 * mode (summary · chart · markets · trades + events). Lifecycle controls sit
 * in the chart toolbar so a kept run that is still trading can be paused or
 * flattened right here; strategy editing stays on the automation's canvas.
 */
export function BotWorkspace({
  botId,
  initial,
}: {
  botId: string
  initial: BotDetailResponse
}) {
  const router = useRouter()
  const { data, refresh } = useIntervalLoader(() => loadBotDetail(botId), initial)
  const { bot, states, stats, trades } = data

  const [botCommandBusy, setBotCommandBusy] = React.useState(false)
  async function runBotCommand(command: BotCommand) {
    setBotCommandBusy(true)
    try {
      await sendCommand(bot.id, command)
      await refresh()
    } catch (error) {
      toast.error(getBotErrorMessage(error))
    } finally {
      setBotCommandBusy(false)
    }
  }

  // The current unnamed run lands here straight after deploy. Naming keeps
  // it: the run is finished and filed (closing any open position at market
  // and stopping it — renameUserBot's semantics), and the next deploy from
  // the editor starts fresh.
  const replaceable = bot.name.startsWith(PREVIOUS_RUN_NAME_PREFIX)
  const hasOpenPosition = states.some(
    (state) => state.paper_position && Number(state.paper_position.szi) !== 0
  )
  const [saveRunOpen, setSaveRunOpen] = React.useState(false)
  const [keepName, setKeepName] = React.useState("")
  const [keeping, setKeeping] = React.useState(false)
  const [marketsOpen, setMarketsOpen] = React.useState(false)
  const openPositionMarkets = React.useMemo(
    () =>
      states
        .filter(
          (state) =>
            state.paper_position && Number(state.paper_position.szi) !== 0
        )
        .map((state) => state.market),
    [states]
  )
  async function keepRun() {
    const trimmed = keepName.trim()
    if (!trimmed || keeping) return
    setKeeping(true)
    try {
      await renameBot(bot.id, trimmed)
      await refresh()
      setSaveRunOpen(false)
      setKeepName("")
    } catch (error) {
      toast.error(getBotErrorMessage(error))
    } finally {
      setKeeping(false)
    }
  }

  const automationConfig = React.useMemo(
    () => (isAutomationConfig(bot.params) ? bot.params : null),
    [bot.params]
  )

  // Remembered per run, so coming back reopens the chart you were looking
  // at. A market that left the run's list falls back to the first one.
  const [selectedMarket, setSelectedMarket] = usePersistedState(
    `bot-run-market:${botId}`,
    bot.markets[0] ?? ""
  )
  React.useEffect(() => {
    if (!bot.markets.includes(selectedMarket) && bot.markets[0]) {
      setSelectedMarket(bot.markets[0])
    }
  }, [bot.markets, selectedMarket, setSelectedMarket])

  const live = useBotLive(data, selectedMarket)
  const [focusedTradeN, setFocusedTradeN] = React.useState<number | null>(null)
  const marketSort = useMarketSort("net")

  // DCA only: the ladder's pending buys as yellow "waiting" lines, labeled
  // with the dollars each rung will spend. Paper cash stands in as the
  // equity estimate for pre-arm previews (live runs fall back to percents).
  const rungLines = React.useMemo(
    () =>
      buildBotRungLines(
        live.state?.strategy_state,
        automationConfig?.dca,
        live.state?.paper_cash ?? null
      ),
    [live.state?.strategy_state, automationConfig?.dca, live.state?.paper_cash]
  )

  const marketRows = React.useMemo(
    () =>
      sortMarketRows(
        buildBotMarketRows(bot.markets, states, trades),
        marketSort.sortColumn,
        marketSort.sortDirection
      ),
    [bot.markets, states, trades, marketSort.sortColumn, marketSort.sortDirection]
  )

  // Per-market equity base: cash minus what this market realized.
  const closedPnl = live.trips
    .filter((trip) => !trip.open)
    .reduce((sum, trip) => sum + trip.pnl, 0)
  const startingEquity =
    live.state?.paper_cash != null && live.state.paper_cash - closedPnl > 0
      ? live.state.paper_cash - closedPnl
      : (bot.paper_starting_equity ?? 10_000)
  const result = React.useMemo(
    () =>
      buildBotResult(live.trips, live.marketTrades, live.state, startingEquity),
    [live.trips, live.marketTrades, live.state, startingEquity]
  )

  // Collapsible panels, persisted — the backtest group workspace's pattern.
  const summaryPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const marketsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const tradesPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const [summaryCollapsed, setSummaryCollapsed] = React.useState(false)
  const [marketsCollapsed, setMarketsCollapsed] = React.useState(false)
  const [tradesCollapsed, setTradesCollapsed] = React.useState(false)
  const horizontalLayout = usePanelLayout("bot-run-workspace-horizontal")
  const verticalLayout = usePanelLayout("bot-run-workspace-vertical")

  // Toggles live in the bottom panel's tab bar — see the three-panel workspace
  // standard in `.agents/skills/Ui-standards`. That panel collapses to exactly
  // this row, so the buttons that reopen the panels never disappear.
  const panelToggles = (
    <div className="flex shrink-0 items-center gap-1">
      <PanelToggle
        side="left"
        collapsed={summaryCollapsed}
        label={summaryCollapsed ? "Show summary panel" : "Hide summary panel"}
        onClick={() => togglePanel(summaryPanelRef, "21%")}
      />
      <PanelToggle
        side="right"
        collapsed={marketsCollapsed}
        label={marketsCollapsed ? "Show markets panel" : "Hide markets panel"}
        onClick={() => togglePanel(marketsPanelRef, "26%")}
      />
      <PanelToggle
        side="bottom"
        collapsed={tradesCollapsed}
        label={tradesCollapsed ? "Show trades panel" : "Hide trades panel"}
        onClick={() => togglePanel(tradesPanelRef, "32%")}
      />
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 flex-col bg-muted/60 dark:bg-background">
      {/* A saved run is a history record — same header anatomy as the
          backtest group workspace. Strategy editing lives on the automation's
          canvas, never here. */}
      <div className="relative flex items-center gap-3 border-b bg-card px-4 py-2">
        <IconButton
          label="Back to bot runs"
          onClick={() => void router.navigate({ to: "/bots" })}
        >
          <ArrowLeftIcon className="size-4" />
        </IconButton>
        <Breadcrumbs
          crumbs={[
            { label: "Bot", to: "/bots" },
            { label: truncateWords(bot.name, 12) },
          ]}
        />
        {/* Same centered Canvas · Backtest · Bot pills as the editor — Bot is
            this page; the other two navigate to the automation's editor. */}
        {bot.automation_id ? (
          <div className="absolute left-1/2 hidden -translate-x-1/2 xl:block">
            <ViewSwitcher
              segments={[
                {
                  id: "canvas",
                  label: "Canvas",
                  active: false,
                  onSelect: () =>
                    void router.navigate({
                      to: "/automations/$automationId",
                      params: { automationId: bot.automation_id! },
                    }),
                },
                {
                  id: "backtest",
                  label: "Backtest",
                  active: false,
                  onSelect: () =>
                    void router.navigate({
                      to: "/automations/$automationId",
                      params: { automationId: bot.automation_id! },
                      search: { view: "backtest" },
                    }),
                },
                {
                  id: "bot",
                  label: "Bot",
                  active: true,
                  onSelect: () => {},
                },
              ]}
            />
          </div>
        ) : null}
        <div className="flex-1" />
        {replaceable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setSaveRunOpen(true)}
          >
            Save run
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setMarketsOpen(true)}
        >
          <SettingsIcon className="size-4" />
          Settings
        </Button>
        {bot.automation_id ? (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 xl:hidden"
          >
            <Link
              to="/automations/$automationId"
              params={{ automationId: bot.automation_id }}
            >
              Open automation
            </Link>
          </Button>
        ) : null}
      </div>

      {/* Mounted on demand: the market list rides the browser-only price
          feed, so it must never render on the server. */}
      {marketsOpen ? (
        <BotMarketsDialog
          botId={bot.id}
          open={marketsOpen}
          onOpenChange={setMarketsOpen}
          markets={bot.markets}
          network={live.network}
          isDca={Boolean(automationConfig?.dca)}
          openPositionMarkets={openPositionMarkets}
          onSaved={refresh}
        />
      ) : null}

      {/* Saving finishes the run — with an open position that means closing
          it at market, so the button says exactly that. */}
      <Dialog
        open={saveRunOpen}
        onOpenChange={(open) => {
          if (!keeping) setSaveRunOpen(open)
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this run</DialogTitle>
            <DialogDescription>
              A saved run becomes a permanent record in your history.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Input
              value={keepName}
              onChange={(event) => setKeepName(event.target.value)}
              placeholder="Run name"
              aria-label="Run name"
            />
            <p className="text-xs text-muted-foreground">
              Unnamed runs are replaced by your next deploy. Saving finishes
              this run — it stops trading and files the result
              {hasOpenPosition
                ? ", and closes its open position at market"
                : ""}
              .
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={keeping}
              onClick={() => setSaveRunOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={hasOpenPosition ? "destructive" : "default"}
              disabled={keeping || !keepName.trim()}
              onClick={() => void keepRun()}
            >
              {keeping ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {hasOpenPosition ? "Close position & save" : "Save run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {!data.workerOnline ? (
        <WorkerOfflineBanner className="border-b px-4 py-1.5 text-xs" />
      ) : null}
      <BotSettingsBanner
        settingsBehind={bot.settings_behind}
        botId={bot.id}
        desiredState={bot.desired_state}
        commandBusy={botCommandBusy}
        onPause={() => runBotCommand("pause")}
        onChanged={refresh}
      />

      <ClientOnly fallback={null}>
        <div className="min-h-0 flex-1 p-[var(--shell-gutter,0.75rem)]">
          <ResizablePanelGroup
            key={verticalLayout.layoutKey}
            orientation="vertical"
            defaultLayout={verticalLayout.defaultLayout}
            onLayoutChanged={verticalLayout.onLayoutChanged}
          >
            <ResizablePanel id="main" defaultSize="68%" minSize="35%">
              <ResizablePanelGroup
                key={horizontalLayout.layoutKey}
                orientation="horizontal"
                defaultLayout={horizontalLayout.defaultLayout}
                onLayoutChanged={horizontalLayout.onLayoutChanged}
              >
                <ResizablePanel
                  id="summary"
                  panelRef={summaryPanelRef}
                  collapsible
                  collapsedSize="0%"
                  defaultSize="21%"
                  minSize="16%"
                  maxSize="34%"
                  onResize={(size) =>
                    setSummaryCollapsed(size.asPercentage < 0.5)
                  }
                >
                  <WorkspacePanel>
                    <BotSummaryPanel
                      bot={bot}
                      state={live.state}
                      stats={stats}
                      openOrders={live.openOrders}
                      selectedMarket={selectedMarket}
                      markPrice={live.markPrice}
                      dayChangePct={live.dayChangePct}
                    />
                  </WorkspacePanel>
                </ResizablePanel>
                <ResizableHandle gap collapsed={summaryCollapsed} />
                <ResizablePanel id="chart" defaultSize="53%" minSize="30%">
                  <WorkspacePanel className="flex flex-col">
                    <BotLiveChartPanel
                      key={selectedMarket}
                      network={live.network}
                      market={selectedMarket}
                      interval={
                        (automationConfig?.interval ?? "15m") as CandleInterval
                      }
                      automationConfig={automationConfig}
                      fills={live.marketTrades}
                      trips={live.trips}
                      focusedTradeN={focusedTradeN}
                      priceLines={rungLines}
                    />
                  </WorkspacePanel>
                </ResizablePanel>
                <ResizableHandle gap collapsed={marketsCollapsed} />
                <ResizablePanel
                  id="markets"
                  panelRef={marketsPanelRef}
                  collapsible
                  collapsedSize="0%"
                  defaultSize="26%"
                  minSize="18%"
                  maxSize="42%"
                  onResize={(size) =>
                    setMarketsCollapsed(size.asPercentage < 0.5)
                  }
                >
                  <WorkspacePanel className="flex flex-col">
                    {/* The backtest side panel's anatomy: title row, actions
                        up top, results in the middle, run naming at the
                        bottom. */}
                    <div className="flex min-h-10 shrink-0 items-center gap-2 border-b px-4 py-2.5">
                      <h2 className="text-xs font-semibold tracking-wide uppercase">
                        Bot
                      </h2>
                      <span className="text-[10px] text-muted-foreground">
                        {bot.markets.length}{" "}
                        {bot.markets.length === 1 ? "market" : "markets"}
                      </span>
                      <div className="ml-auto">
                        <BotLifecycleControls
                          bot={bot}
                          busy={botCommandBusy}
                          onCommand={(command) => void runBotCommand(command)}
                        />
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                      <BacktestMarketsTable
                        rows={marketRows}
                        state={marketSort}
                        selectedId={selectedMarket}
                        onSelect={(row) => setSelectedMarket(row.id)}
                        emptyLabel="No markets."
                      />
                    </div>
                  </WorkspacePanel>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            {/* The trades panel collapses to its own tab bar, not to nothing,
                so this gutter always has two visible panels to separate. */}
            <ResizableHandle gap />
            <ResizablePanel
              id="trades"
              panelRef={tradesPanelRef}
              collapsible
              collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
              defaultSize="32%"
              minSize="15%"
              onResize={() =>
                setTradesCollapsed(tradesPanelRef.current?.isCollapsed() ?? false)
              }
            >
              <WorkspacePanel>
                <StrategyTester
                  result={result}
                  startingEquity={startingEquity}
                  markPrice={live.markPrice}
                  selectedTradeN={focusedTradeN}
                  onSelectTrade={(trade) => setFocusedTradeN(trade?.n ?? null)}
                  toggles={panelToggles}
                  extraTabs={[
                    {
                      value: "events",
                      label: "Events",
                      content: <BotEventsList events={data.events} />,
                    },
                  ]}
                />
              </WorkspacePanel>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </ClientOnly>
    </div>
  )
}
