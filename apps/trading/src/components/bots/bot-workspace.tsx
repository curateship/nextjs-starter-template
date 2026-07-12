import * as React from "react"
import { ClientOnly, useRouter } from "@tanstack/react-router"
import { XIcon } from "lucide-react"

import {
  formatFocusDays,
  pct,
  price as fmtPrice,
  signedUsd,
} from "@/components/backtest/backtest-format"
import { BotActivityTabs } from "@/components/bots/bot-activity-tabs"
import { buildBotRoundTrips } from "@/components/bots/bot-round-trips"
import {
  buildBotFillMarkers,
  buildBotProtectionMenuItems,
  buildBotProtectionOverlays,
  type BotChartMenuItem,
} from "@/components/bots/bot-chart-overlays"
import { BotMarketsPanel } from "@/components/bots/bot-markets-panel"
import { BotOrderControls } from "@/components/bots/bot-order-controls"
import {
  BotWorkspaceHeader,
  type BotCommand,
} from "@/components/bots/bot-workspace-header"
import { ChartToolbar } from "@/components/chart/chart-toolbar"
import {
  PriceChart,
  type ChartCandle,
  type ChartFocusPoint,
  type ChartFocusResult,
  type ChartMarker,
  type PriceChartHandle,
} from "@/components/chart/price-chart"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  getBotErrorMessage,
  loadBotDetail,
  sendCommand,
  updateBot,
  type BotDetailResponse,
} from "@/lib/api/bots"
import { candleIntervalMs, useMarketRows } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import {
  isStrategyConfig,
  strategyConfigSchema,
  type AutomationStrategyConfig,
} from "@/lib/strategies/strategy-config"
import { useIntervalLoader } from "@/lib/use-interval-loader"
import { usePersistedLayout } from "@/lib/use-persisted-layout"
import { cn } from "@/lib/utils"

type ParamValues = Record<string, string>
const PROTECTIVE_KEYS = ["takeProfitPct", "stopLossPct"] as const
const NO_PROTECTIVE_KEYS: readonly (typeof PROTECTIVE_KEYS)[number][] = []

/**
 * Right-click menu on the bot chart: adds whichever TP/SL isn't set yet at
 * the clicked price, saving immediately. Fixed at the cursor; closes on
 * outside click or Escape (same pattern as the trade terminal's order menu).
 */
function BotChartMenu({
  menu,
  market,
  items,
  onPick,
  onResetView,
  onClose,
}: {
  menu: { price: number; x: number; y: number } | null
  market: string
  items: BotChartMenuItem[]
  onPick: (item: BotChartMenuItem) => void
  onResetView: () => void
  onClose: () => void
}) {
  React.useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menu, onClose])

  if (!menu) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        className="fixed z-50 min-w-52 rounded-md border bg-popover p-1 text-sm shadow-md"
        style={{
          left: Math.min(menu.x, window.innerWidth - 230),
          top: Math.min(menu.y, window.innerHeight - 120),
        }}
      >
        <div className="px-2 py-1.5 font-mono text-xs text-muted-foreground tabular-nums">
          {market} @ {fmtPrice(menu.price)}
        </div>
        {items.length > 0 ? (
          items.map((item) => (
            <Button
              key={item.key}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "w-full justify-start",
                item.tone === "up"
                  ? "text-emerald-600 hover:text-emerald-700"
                  : "text-red-500 hover:text-red-600"
              )}
              onClick={() => onPick(item)}
            >
              {item.label}
            </Button>
          ))
        ) : (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            TP / SL already set — drag the lines to move them.
          </div>
        )}
        <div className="my-1 border-t" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            onResetView()
            onClose()
          }}
        >
          Reset View
        </Button>
      </div>
    </>
  )
}

/** Automation rules stay fixed on the bot; protection is edited in its rail. */
function AutomationBotSettings({
  bot,
  config,
}: {
  bot: BotDetailResponse["bot"]
  config: AutomationStrategyConfig
}) {
  const source = bot.source_name ?? "Saved Automation"
  return (
    <div className="grid gap-4 p-4 text-sm">
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{source}</span> ·{" "}
        {config.interval} · {config.rules.length} action{" "}
        {config.rules.length === 1 ? "rule" : "rules"}
      </div>
      <p className="text-muted-foreground">
        This bot keeps the Automation rules it copied at creation. Use the order
        controls beside the chart to change take profit or stop loss.
      </p>
    </div>
  )
}

/**
 * The bot workspace: backtest-style chart layout around a live bot. Left rail
 * shows the locked strategy parameters, the right rail edits SL/TP live, the
 * header runs the lifecycle.
 */
export function BotWorkspace({
  botId,
  initial,
}: {
  botId: string
  initial: BotDetailResponse
}) {
  const router = useRouter()
  const { data, refresh } = useIntervalLoader(
    () => loadBotDetail(botId),
    initial
  )
  const { bot, states, stats, trades, events } = data
  const network = (
    bot.network === "mainnet" ? "mainnet" : "testnet"
  ) as TradingNetwork

  // Runnable bots carry a validated Automation snapshot. Anything else is
  // retired history and stays read-only.
  const botConfig = React.useMemo(() => {
    if (!isStrategyConfig(bot.params)) return null
    return bot.params.kind === "automation" ? bot.params : null
  }, [bot.params])
  const automationConfig = botConfig
  const protection = automationConfig?.protection ?? null

  const [selectedMarket, setSelectedMarket] = React.useState(
    bot.markets[0] ?? ""
  )
  // Keep the selection valid if the bot's markets change under us.
  React.useEffect(() => {
    if (!bot.markets.includes(selectedMarket) && bot.markets[0]) {
      setSelectedMarket(bot.markets[0])
    }
  }, [bot.markets, selectedMarket])

  const state = states.find((row) => row.market === selectedMarket) ?? null
  const openOrders = data.open_orders.filter(
    (order) => order.market === selectedMarket
  )
  const marketTrades = React.useMemo(
    () => trades.filter((trade) => trade.market === selectedMarket),
    [trades, selectedMarket]
  )

  const markets = useMarketRows(network)
  const marketRow = markets.find((row) => row.coin === selectedMarket)
  const markPrice = Number(marketRow?.markPx ?? 0)
  const dayChangePct =
    marketRow && Number(marketRow.prevDayPx) > 0
      ? (Number(marketRow.markPx) / Number(marketRow.prevDayPx) - 1) * 100
      : null
  const [interval, setInterval] = React.useState<CandleInterval>(
    botConfig?.interval ?? "15m"
  )
  const [marketsOpen, setMarketsOpen] = React.useState(true)
  const [controlsOpen, setControlsOpen] = React.useState(true)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState<{
    tone: "ok" | "error"
    text: string
  } | null>(null)
  const [slTpBusy, setSlTpBusy] = React.useState(false)
  const [slTpError, setSlTpError] = React.useState<string | null>(null)
  const [chartMenu, setChartMenu] = React.useState<{
    price: number
    x: number
    y: number
  } | null>(null)
  const chartApiRef = React.useRef<PriceChartHandle | null>(null)
  const registerChartApi = React.useCallback((api: PriceChartHandle | null) => {
    chartApiRef.current = api
  }, [])

  // The editable protective levels (TP/SL) as form strings. Archived legacy
  // bots are read-only, so they expose nothing here.
  const seed = React.useMemo<ParamValues>(() => {
    const out: ParamValues = {}
    if (!protection) return out
    out.takeProfitPct = protection.takeProfitPct
      ? String(protection.takeProfitPct)
      : ""
    out.stopLossPct = protection.stopLossPct
      ? String(protection.stopLossPct)
      : ""
    return out
  }, [protection])

  // Hovered candle for the toolbar's O/H/L/C readout (null while not hovering).
  const [ohlc, setOhlc] = React.useState<ChartCandle | null>(null)
  const [selectedTradeId, setSelectedTradeId] = React.useState<string | null>(
    null
  )

  // The SL/TP draft holds ONLY the protective keys the right rail edits; every
  // other param is read fresh from the bot at save time (see applyValues). So a
  // params change from elsewhere — the Settings sheet, or a status change that
  // bumps updated_at — can never be clobbered by a stale draft.
  const protectiveKeys = botConfig ? PROTECTIVE_KEYS : NO_PROTECTIVE_KEYS
  const seedProtective = React.useMemo(() => {
    const values: ParamValues = {}
    for (const key of protectiveKeys) values[key] = seed[key] ?? ""
    return values
  }, [seed, protectiveKeys])
  const [draft, setDraft] = React.useState<ParamValues>(seedProtective)
  const dirty = protectiveKeys.some(
    (key) => (draft[key] ?? "") !== (seedProtective[key] ?? "")
  )

  // Re-sync the draft from the server only when the user has no unsaved edits,
  // so a status change (which also bumps updated_at) never wipes half-typed
  // SL/TP. seededFor stays stale while dirty, so the sync catches up the moment
  // the edit is saved or reverted.
  const seededFor = React.useRef(bot.updated_at)
  React.useEffect(() => {
    if (bot.updated_at === seededFor.current || dirty) return
    seededFor.current = bot.updated_at
    setDraft(seedProtective)
    setSlTpError(null)
  }, [bot.updated_at, dirty, seedProtective])

  const notify = React.useCallback(
    (text: string, tone: "ok" | "error") => {
      setNotice({ text, tone })
      setTimeout(() => void refresh(), 800)
    },
    [refresh]
  )

  React.useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  async function run(command: BotCommand) {
    setBusy(true)
    try {
      await sendCommand(botId, command)
      if (command === "flatten") {
        notify("Flatten sent — closing the position and pausing the bot.", "ok")
      }
      await refresh()
    } catch (error) {
      notify(getBotErrorMessage(error), "error")
    } finally {
      setBusy(false)
    }
  }

  /**
   * Validate + save the protective (SL/TP) edits. The protective keys are
   * merged onto the bot's current params read fresh at call time, so only the
   * SL/TP the user touched changes — never a stale copy of the other params.
   */
  async function applyValues(protective: ParamValues) {
    setSlTpError(null)
    if (!botConfig) return // archived legacy bots are read-only

    const num = (raw?: string) => {
      const value = Number(raw)
      return raw && value > 0 ? value : undefined
    }
    const takeProfitPct = num(protective.takeProfitPct)
    const stopLossPct = num(protective.stopLossPct)
    const nextConfig = {
            ...botConfig,
            protection: { takeProfitPct, stopLossPct },
          }
    const parsed = strategyConfigSchema.safeParse(nextConfig)
    if (!parsed.success) {
      setSlTpError(parsed.error.issues[0]?.message ?? "Invalid levels")
      return
    }
    setSlTpBusy(true)
    try {
      await updateBot({
        botId,
        name: bot.name,
        markets: bot.markets,
        params: parsed.data,
      })
      notify(
        bot.status === "running"
          ? "Protection updated — bot restarting with the new levels."
          : "Protection updated.",
        "ok"
      )
    } catch (error) {
      setSlTpError(getBotErrorMessage(error))
    } finally {
      setSlTpBusy(false)
    }
  }

  // Chart lines + the drag-targets that map SL/TP lines back to the bot's
  // settings. Archived legacy bots draw no lines.
  const chart = React.useMemo(
    () =>
      protection
        ? buildBotProtectionOverlays(protection, state)
        : { lines: [], targets: {} },
    [protection, state]
  )

  /** Dropping a TP/SL line re-prices and saves immediately — no confirm. */
  function handleLineDrag(id: string, px: number) {
    const target = chart.targets[id]
    if (!target || !(px > 0)) return
    const value = target.toValue(px, markPrice)
    if (!value) return
    const next = { ...draft, [target.key]: value }
    setDraft(next)
    void applyValues(next)
  }

  /** Right-click on the chart: add whichever protective levels aren't set. */
  function handleChartContextMenu(px: number, x: number, y: number) {
    if (!protection || !(px > 0)) return
    setChartMenu({ price: px, x, y })
  }

  function pickMenuItem(item: BotChartMenuItem) {
    setChartMenu(null)
    const next = { ...draft, [item.key]: item.value }
    setDraft(next)
    void applyValues(next)
  }

  // Price-pinned O/C chips for recent fills, backtest-style. Chips (and the
  // focus ring below) must sit on exact bar times, so fills snap to the candle
  // bucket of the current chart interval.
  const intervalMs = candleIntervalMs(interval)
  const markers = React.useMemo<ChartMarker[]>(
    () => buildBotFillMarkers(marketTrades.slice(0, 200), intervalMs),
    [marketTrades, intervalMs]
  )

  // Fills paired into entry → exit round trips, shaped like backtest trades —
  // the Trades tab and the chart focus below both read from this.
  const roundTrips = React.useMemo(
    () => buildBotRoundTrips(marketTrades, markPrice),
    [marketTrades, markPrice]
  )
  const focusedTrip = selectedTradeId
    ? (roundTrips.find((trip) => trip.id === selectedTradeId) ?? null)
    : null

  // Clicking a trade row pulses rings at its entry (and exit, once closed).
  const focusPoints = React.useMemo<ChartFocusPoint[]>(() => {
    if (!focusedTrip) return []
    const long = focusedTrip.side === "long"
    const snap = (ms: number) => Math.floor(ms / intervalMs) * intervalMs
    const points: ChartFocusPoint[] = [
      {
        time: snap(focusedTrip.entryTime),
        side: long ? "buy" : "sell",
        label: "Entry",
        price: focusedTrip.entryPx,
      },
    ]
    if (focusedTrip.exitTime != null && focusedTrip.exitPx != null) {
      points.push({
        time: snap(focusedTrip.exitTime),
        side: long ? "sell" : "buy",
        label: "Exit",
        price: focusedTrip.exitPx,
      })
    }
    return points
  }, [focusedTrip, intervalMs])

  // Result box spanning entry → exit (closed trips only), backtest-style.
  const focusResult = React.useMemo<ChartFocusResult | null>(() => {
    if (!focusedTrip || focusedTrip.exitTime == null) return null
    const spanMs = focusedTrip.exitTime - focusedTrip.entryTime
    return {
      up: focusedTrip.pnl >= 0,
      pctText: pct(focusedTrip.returnPct),
      pnlText: signedUsd(focusedTrip.pnl),
      bars: Math.max(1, Math.round(spanMs / intervalMs)),
      daysText: formatFocusDays(spanMs / 86_400_000),
    }
  }, [focusedTrip, intervalMs])

  const outerLayout = usePersistedLayout("bot-workspace-vertical")
  const innerLayout = usePersistedLayout("bot-workspace-horizontal")

  const chartMenuItems =
    chartMenu && protection
      ? buildBotProtectionMenuItems(protection, state, markPrice, chartMenu.price)
      : []

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 flex-col">
      <BotWorkspaceHeader
        bot={bot}
        stats={stats}
        markPrice={markPrice}
        dayChangePct={dayChangePct}
        selectedMarket={selectedMarket}
        busy={busy}
        marketsOpen={marketsOpen}
        onToggleMarkets={() => setMarketsOpen((open) => !open)}
        controlsOpen={controlsOpen}
        onToggleControls={() => setControlsOpen((open) => !open)}
        onBack={() => void router.navigate({ to: "/bots" })}
        onCommand={(command) => void run(command)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {notice ? (
        <div
          className={cn(
            "border-b px-4 py-1.5 text-xs",
            notice.tone === "ok"
              ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {notice.text}
        </div>
      ) : null}

      <ClientOnly
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading bot workspace…
          </div>
        }
      >
        <ResizablePanelGroup
          orientation="vertical"
          className="min-h-0 flex-1"
          defaultLayout={outerLayout.defaultLayout}
          onLayoutChanged={outerLayout.onLayoutChanged}
        >
          <ResizablePanel id="main" defaultSize="68%" minSize="35%">
            <ResizablePanelGroup
              orientation="horizontal"
              defaultLayout={innerLayout.defaultLayout}
              onLayoutChanged={innerLayout.onLayoutChanged}
            >
              {marketsOpen ? (
                <ResizablePanel id="markets" defaultSize="20%" minSize="14%">
                  <BotMarketsPanel
                    markets={bot.markets}
                    states={states}
                    marketRows={markets}
                    selectedMarket={selectedMarket}
                    onSelect={setSelectedMarket}
                  />
                </ResizablePanel>
              ) : null}
              {marketsOpen ? <ResizableHandle withHandle /> : null}
              <ResizablePanel id="chart" defaultSize="62%" minSize="30%">
                <div className="flex h-full min-h-0 flex-col">
                  <ChartToolbar
                    intervals={CANDLE_INTERVALS}
                    interval={interval}
                    onIntervalChange={setInterval}
                    legend={{ chips: markers.length > 0 }}
                    ohlc={ohlc}
                  />
                  <div className="min-h-0 flex-1">
                    <PriceChart
                      network={network}
                      coin={selectedMarket}
                      interval={interval}
                      priceLines={chart.lines}
                      markers={markers}
                      strategyConfig={automationConfig}
                      focusPoints={focusPoints}
                      focusResult={focusResult}
                      onCrosshairOhlc={setOhlc}
                      onLineDragEnd={handleLineDrag}
                      onChartContextMenu={handleChartContextMenu}
                      registerApi={registerChartApi}
                    />
                  </div>
                </div>
              </ResizablePanel>
              {controlsOpen ? <ResizableHandle withHandle /> : null}
              {controlsOpen ? (
                <ResizablePanel id="controls" defaultSize="20%" minSize="14%">
                  <BotOrderControls
                    market={selectedMarket}
                    mode={bot.mode}
                    draft={draft}
                    dirty={dirty}
                    busy={slTpBusy}
                    error={slTpError}
                    mid={markPrice}
                    state={state}
                    stats={stats}
                    openOrders={openOrders}
                    onDraftChange={(key, value) =>
                      setDraft((current) => ({ ...current, [key]: value }))
                    }
                    onApply={() => void applyValues(draft)}
                  />
                </ResizablePanel>
              ) : null}
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="activity" defaultSize="32%" minSize="15%">
            <BotActivityTabs
              trips={roundTrips}
              openOrders={openOrders}
              events={events}
              stats={stats}
              selectedTradeId={selectedTradeId}
              onSelectTrade={setSelectedTradeId}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ClientOnly>

      <BotChartMenu
        menu={chartMenu}
        market={selectedMarket}
        items={chartMenuItems}
        onPick={pickMenuItem}
        onResetView={() => chartApiRef.current?.resetView()}
        onClose={() => setChartMenu(null)}
      />

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:max-w-md"
          showCloseButton={false}
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <SheetTitle className="text-sm">Edit bot</SheetTitle>
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </SheetClose>
          </div>
          <div className="min-h-0 flex-1">
            {automationConfig ? (
              <AutomationBotSettings bot={bot} config={automationConfig} />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                This bot uses a retired strategy and is archived — its history
                stays readable, but nothing can be edited. Create a new bot from
                a saved Automation instead.
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
