import * as React from "react"
import { ClientOnly, useRouter } from "@tanstack/react-router"
import { XIcon } from "lucide-react"

import { price as fmtPrice } from "@/components/backtest/backtest-format"
import { BotActivityTabs } from "@/components/bots/bot-activity-tabs"
import {
  buildBotChartMenuItems,
  buildBotOverlays,
  type BotChartMenuItem,
} from "@/components/bots/bot-chart-overlays"
import { BotEditPanel } from "@/components/bots/bot-edit-panel"
import { BotMarketsPanel } from "@/components/bots/bot-markets-panel"
import { BotOrderControls } from "@/components/bots/bot-order-controls"
import {
  BotWorkspaceHeader,
  type BotCommand,
} from "@/components/bots/bot-workspace-header"
import {
  buildParams,
  paramsToValues,
  PROTECTIVE_KEYS,
  type ParamValues,
} from "@/components/bots/strategy-params-form"
import {
  PriceChart,
  type ChartMarker,
  type PriceChartHandle,
} from "@/components/trading/price-chart"
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
import { useMarketRows } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import { CANDLE_INTERVALS, type CandleInterval } from "@/lib/hl/ws"
import { STRATEGY_LABELS, strategyParamsSchema } from "@/lib/strategies/params"
import { useIntervalLoader } from "@/lib/use-interval-loader"
import { usePersistedLayout } from "@/lib/use-persisted-layout"
import { cn } from "@/lib/utils"

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
  const [interval, setInterval] = React.useState<CandleInterval>("15m")
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
  const registerChartApi = React.useCallback(
    (api: PriceChartHandle | null) => {
      chartApiRef.current = api
    },
    []
  )

  // Full param values, for the left rail's read-only display.
  const seed = React.useMemo(() => paramsToValues(bot.params), [bot.params])
  // The SL/TP draft holds ONLY the protective keys the right rail edits; every
  // other param is read fresh from the bot at save time (see applyValues). So a
  // params change from elsewhere — the Settings sheet, or a status change that
  // bumps updated_at — can never be clobbered by a stale draft.
  const protectiveKeys = PROTECTIVE_KEYS[bot.strategy_type]
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
    const merged = { ...paramsToValues(bot.params), ...protective }
    const parsed = strategyParamsSchema.safeParse(
      buildParams(bot.strategy_type, merged)
    )
    if (!parsed.success) {
      setSlTpError(
        parsed.error.issues
          .map((issue) =>
            issue.path.length
              ? `${issue.path.join(".")}: ${issue.message}`
              : issue.message
          )
          .join(" · ")
      )
      return
    }
    setSlTpBusy(true)
    try {
      await updateBot({
        botId,
        name: bot.name,
        params: parsed.data,
        riskParams: bot.risk_params,
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

  // Chart lines + the drag-targets that map SL/TP lines back to params.
  const chart = React.useMemo(
    () => buildBotOverlays(bot.params, state, openOrders, markPrice),
    [bot.params, state, openOrders, markPrice]
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
    if (!(px > 0)) return
    setChartMenu({ price: px, x, y })
  }

  function pickMenuItem(item: BotChartMenuItem) {
    setChartMenu(null)
    const next = { ...draft, [item.key]: item.value }
    setDraft(next)
    void applyValues(next)
  }

  const markers = React.useMemo<ChartMarker[]>(
    () =>
      marketTrades.slice(0, 200).map((trade) => ({
        time: new Date(trade.fill_time).getTime(),
        side: trade.side === "buy" ? "buy" : "sell",
      })),
    [marketTrades]
  )

  const outerLayout = usePersistedLayout("bot-workspace-vertical")
  const innerLayout = usePersistedLayout("bot-workspace-horizontal")

  const chartMenuItems = chartMenu
    ? buildBotChartMenuItems(bot.params, state, markPrice, chartMenu.price)
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
                  <div className="flex items-center gap-3 border-b px-3 py-1.5">
                    <div className="flex gap-0.5">
                      {CANDLE_INTERVALS.map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          onClick={() => setInterval(tf)}
                          className={cn(
                            "rounded px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground",
                            interval === tf && "bg-muted text-foreground"
                          )}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1" />
                    {bot.strategy_type !== "copy" ? (
                      <span className="text-[10px] text-muted-foreground">
                        Drag TP / SL to re-price · right-click to add — saves
                        instantly
                      </span>
                    ) : null}
                  </div>
                  <div className="min-h-0 flex-1">
                    <PriceChart
                      network={network}
                      coin={selectedMarket}
                      interval={interval}
                      priceLines={chart.lines}
                      markers={markers}
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
                    strategy={bot.strategy_type}
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
              trades={marketTrades}
              openOrders={openOrders}
              events={events}
              stats={stats}
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
            <SheetTitle className="text-sm">
              Edit {STRATEGY_LABELS[bot.strategy_type]} bot
            </SheetTitle>
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
            <BotEditPanel
              bot={bot}
              mid={markPrice}
              running={bot.status === "running"}
              onSaved={(message, tone) => {
                setSettingsOpen(false)
                notify(message, tone)
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

    </div>
  )
}
