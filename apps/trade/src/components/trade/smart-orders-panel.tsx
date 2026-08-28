import * as React from "react"
import { Link } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  BotIcon,
  EllipsisVerticalIcon,
  Grid2x2Icon,
  PauseIcon,
  PiggyBankIcon,
  PlayIcon,
  SquareIcon,
} from "lucide-react"

import { MarketIcon } from "@/components/trade/market-icon"
import {
  DashboardCardTab,
  DashboardCardTabsHeader,
} from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  getRunningBotsErrorMessage,
  loadRunningBots,
} from "@/lib/api/flow-runs"
import {
  marketSymbol,
  type MarketRow,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import {
  formatClockTime,
  formatDateTime,
  formatRelativeTime,
  formatTimeAgo,
} from "@/lib/format/format-time"
import { formatPrice, formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { keyExpiryNotice } from "@/lib/trade/live"
import { useLiveMarks } from "@/lib/trade/live-market"
import {
  gridRoundTrips,
  type LiveFill,
  type LiveTrade,
} from "@/lib/trade/live-trades"
import type { TradePosition } from "@/lib/trade/paper"
import { LOST_MONEY, moneyTone, WARNING } from "@/lib/trade/money-tone"
import type { RunningBot } from "@/lib/trade/running-bots"
import {
  smartOrdersYouPlaced,
  type SmartOrder,
  type SmartOrderKind,
} from "@/lib/trade/smart-plan"
import type { TradeWallet } from "@/lib/trade/wallets"
import { focusRing } from "@/lib/layout/focus-ring"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import {
  readSmartOrdersCache,
  writeSmartOrdersCache,
} from "@/lib/trade/dashboard-cache"
import { cn } from "@/lib/utils"
import { flowActionProblem, pauseFlow, stopFlow } from "@/lib/api/flow-trading"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Every coin a smart order is working right now, under the wallets.
 *
 * **These coins are deliberately not in the Positions tab.** A position a
 * ladder or a grid is running is not a position somebody is holding — it is
 * one step of something still happening, and mixed in with hand-placed trades
 * it read as a trade nobody was managing. Positions is what you are holding;
 * this is what is being worked.
 *
 * **Only the ones somebody placed by hand.** A flow can have a hundred and
 * fifty ladders working at once, which would bury the two or three you placed
 * yourself and turn this into a second, worse copy of the run's dashboard.
 * What a flow is doing belongs to that run's page.
 *
 * One row per smart order, naming its kind and wallet. Clicking a row charts
 * that coin; the three-dot button opens its progress and sales.
 */

const KIND_LABELS: Record<SmartOrderKind, string> = {
  dca: "DCA ladder",
  grid: "Grid",
  signal: "Signals",
  watch: "Watched price",
}

/** A running bot can stop on its own, so the open tab checks again. */
const BOTS_REFRESH_MS = 6_000

type SmartOrdersViewProps = {
  cacheScope: string
  smartOrders: readonly SmartOrder[]
  /** What each of them is holding, when it has bought anything yet. */
  positions: readonly TradePosition[]
  /** Fills not yet part of a finished trade, where a grid's sells live. */
  fills: readonly LiveFill[]
  /** Finished round trips, for the orders that do go flat. */
  trades: readonly LiveTrade[]
  markets: ReadonlyMap<string, MarketRow>
  wallets: readonly TradeWallet[]
  walletName: (walletId: string) => string
  /** The market on the chart. Its smart-order row keeps the selected shade. */
  selectedMarketKey: string | null
  /** Both the practice and real-money reads have landed. */
  settled: boolean
  /** The first read failed and there is nothing to fall back on. */
  failed: boolean
  onRetry: () => void
  onResumeSmartOrder: (order: SmartOrder) => Promise<boolean>
  onSelectMarket: (marketKey: string) => void
}

type SmartOrdersPanelProps = SmartOrdersViewProps & {
  protocol: ProtocolId
  initialBots: RunningBot[]
  initialBotsError: string | null
}

export function SmartOrdersPanel({
  protocol,
  initialBots,
  initialBotsError,
  ...smartOrdersProps
}: SmartOrdersPanelProps) {
  const [tab, setTab] = React.useState<"smart" | "bots">("smart")
  const [bots, setBots] = React.useState(initialBots)
  const [botsError, setBotsError] = React.useState(initialBotsError)
  const [botsKnown, setBotsKnown] = React.useState(initialBotsError === null)
  const [botsBusy, setBotsBusy] = React.useState(false)
  const botsReading = React.useRef(false)
  const botsKnownRef = React.useRef(initialBotsError === null)

  const refreshBots = React.useCallback(async () => {
    if (document.hidden || botsReading.current) return
    botsReading.current = true
    const wasKnown = botsKnownRef.current
    if (!wasKnown) setBotsBusy(true)
    try {
      setBots(await loadRunningBots(protocol))
      setBotsError(null)
      setBotsKnown(true)
      botsKnownRef.current = true
    } catch (error) {
      setBotsError(getRunningBotsErrorMessage(error))
    } finally {
      botsReading.current = false
      if (!wasKnown) setBotsBusy(false)
    }
  }, [protocol])

  React.useEffect(() => {
    if (tab !== "bots") return
    const refreshWhenVisible = () => void refreshBots()
    const timer = window.setInterval(refreshWhenVisible, BOTS_REFRESH_MS)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [refreshBots, tab])

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next = value as "smart" | "bots"
        setTab(next)
        if (next === "bots") void refreshBots()
      }}
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card"
    >
      <DashboardCardTabsHeader>
        <DashboardCardTab
          value="smart"
          icon={<Grid2x2Icon className="size-4" />}
          label="Smart orders"
        />
        <DashboardCardTab
          value="bots"
          icon={<BotIcon className="size-4" />}
          label="Bots"
        />
      </DashboardCardTabsHeader>

      <TabsContent value="smart" className="flex min-h-0 flex-1 flex-col">
        <SmartOrdersView {...smartOrdersProps} />
      </TabsContent>
      <TabsContent value="bots" className="min-h-0 flex-1">
        <BotsView
          bots={bots}
          error={botsError}
          known={botsKnown}
          busy={botsBusy}
          onRetry={() => void refreshBots()}
          onRefresh={refreshBots}
        />
      </TabsContent>
    </Tabs>
  )
}

function BotsView({
  bots,
  error,
  known,
  busy,
  onRetry,
  onRefresh,
}: {
  bots: readonly RunningBot[]
  error: string | null
  known: boolean
  busy: boolean
  onRetry: () => void
  onRefresh: () => Promise<void>
}) {
  const [stopping, setStopping] = React.useState<RunningBot | null>(null)
  const [actingId, setActingId] = React.useState<string | null>(null)

  const act = async (
    bot: RunningBot,
    action: () => Promise<{ summary: string }>
  ) => {
    if (actingId) return
    setActingId(bot.runId)
    try {
      const answer = await action()
      toast.success(answer.summary)
      setStopping(null)
      await onRefresh()
    } catch (actionError) {
      showErrorToast(flowActionProblem(actionError, bot.walletLabel))
    } finally {
      setActingId(null)
    }
  }

  if (!known && busy) {
    return <LoadingRow label="Reading your running bots" className="h-full" />
  }

  if (!known && error) {
    return (
      <p className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {error}{" "}
        <button type="button" className="underline" onClick={onRetry}>
          Try again
        </button>
      </p>
    )
  }

  const refreshError = error ? (
    <p className="border-b px-3 py-2 text-xs text-muted-foreground">
      The list could not be refreshed. The last answer is still shown.{" "}
      <button type="button" className="underline" onClick={onRetry}>
        Try again
      </button>
    </p>
  ) : null

  if (bots.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {refreshError}
        <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          No bot is running on this exchange. Switch one on from its automation
          canvas and it will appear here.
        </p>
      </div>
    )
  }

  return (
    <>
      <ScrollArea className="h-full">
        {refreshError}
        <ul>
          {bots.map((bot) => (
            <BotRow
              key={bot.runId}
              bot={bot}
              busy={actingId === bot.runId}
              onPause={() =>
                void act(bot, () => pauseFlow(bot.automationId, !bot.paused))
              }
              onStop={() => setStopping(bot)}
            />
          ))}
        </ul>
      </ScrollArea>
      <ConfirmDialog
        open={stopping !== null}
        onOpenChange={(open) => {
          if (!open) setStopping(null)
        }}
        title="Stop this bot?"
        description={
          <>
            The bot stops looking for coins and calls off the orders that have
            not bought anything. Coins already held keep their stops and
            targets. Use Pause to leave every order where it is.
          </>
        }
        confirmLabel="Stop it"
        loading={stopping !== null && actingId === stopping.runId}
        onConfirm={() => {
          if (stopping)
            void act(stopping, () => stopFlow(stopping.automationId))
        }}
      />
    </>
  )
}

function BotRow({
  bot,
  busy,
  onPause,
  onStop,
}: {
  bot: RunningBot
  busy: boolean
  onPause: () => void
  onStop: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const working = bot.stopping
    ? `${bot.workingCount} left`
    : `${bot.workingCount} of ${bot.marketCount}`

  return (
    <li className="border-b last:border-b-0">
      <div className="flex items-center transition-colors hover:bg-muted/40">
        <Link
          to="/flow-runs/$runId"
          params={{ runId: bot.runId }}
          className={cn(
            "flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 px-3 py-1.5 text-left",
            focusRing
          )}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium hover:underline">
              {bot.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {bot.stopping ? "Stopping" : bot.paused ? "Paused" : bot.strategy}
            </span>
          </span>
          <span className="shrink-0 text-right text-xs tabular-nums">
            <span
              className={cn(
                "block font-medium",
                bot.tradesClosed > 0 && moneyTone(bot.netUsd)
              )}
            >
              {bot.tradesClosed > 0 ? formatSignedUsd(bot.netUsd) : "—"}
            </span>
            <span className="block text-muted-foreground">
              {working} working
            </span>
          </span>
        </Link>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="mr-1"
              aria-label={`Open ${bot.name} bot details`}
            >
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 gap-0 p-0">
            <PopoverHeader className="border-b p-3">
              <PopoverTitle>{bot.name}</PopoverTitle>
            </PopoverHeader>
            <div className="grid gap-3 p-3">
              <div className="flex flex-col gap-1 text-sm">
                <BotFigureRow label="Made or lost">
                  <span
                    className={cn(
                      "tabular-nums",
                      bot.tradesClosed > 0 && moneyTone(bot.netUsd)
                    )}
                  >
                    {bot.tradesClosed > 0 ? formatSignedUsd(bot.netUsd) : "—"}
                  </span>
                </BotFigureRow>
                <BotFigureRow label="Closed trades">
                  <span className="tabular-nums">{bot.tradesClosed}</span>
                </BotFigureRow>
                <BotFigureRow label="Coins working">
                  <span className="tabular-nums">{working}</span>
                </BotFigureRow>
                <BotFigureRow label="Coins held">
                  <span className="tabular-nums">{bot.holdingCount}</span>
                </BotFigureRow>
                <BotFigureRow label="Wallet">{bot.walletLabel}</BotFigureRow>
                <BotFigureRow label="Money">
                  {bot.real ? "Real money" : "Practice money"}
                </BotFigureRow>
                <BotFigureRow label="Switched on">
                  <span title={formatDateTime(new Date(bot.startedAt))}>
                    {formatRelativeTime(new Date(bot.startedAt))}
                  </span>
                </BotFigureRow>
              </div>
            </div>
            {bot.stopping ? null : (
              <div className="flex gap-2 border-t p-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => {
                    setOpen(false)
                    onPause()
                  }}
                >
                  {bot.paused ? (
                    <PlayIcon className="size-4" />
                  ) : (
                    <PauseIcon className="size-4" />
                  )}
                  {bot.paused ? "Resume" : "Pause"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => {
                    setOpen(false)
                    onStop()
                  }}
                >
                  <SquareIcon className="size-4" />
                  Stop
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </li>
  )
}

function BotFigureRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">
        {children}
      </span>
    </div>
  )
}

function SmartOrdersView({
  cacheScope,
  smartOrders,
  positions,
  fills,
  trades,
  markets,
  wallets,
  walletName,
  selectedMarketKey,
  settled,
  failed,
  onRetry,
  onResumeSmartOrder,
  onSelectMarket,
}: SmartOrdersViewProps) {
  const [cached, setCached] = React.useState<readonly SmartOrder[] | null>(null)
  useEffectBeforePaint(() => {
    setCached(readSmartOrdersCache(cacheScope))
  }, [cacheScope])
  React.useEffect(() => {
    if (!settled || failed) return
    writeSmartOrdersCache(cacheScope, smartOrders)
  }, [cacheScope, failed, settled, smartOrders])
  const shownOrders =
    !settled && !failed && cached !== null ? cached : smartOrders

  const [readAt, setReadAt] = React.useState(Date.now)
  React.useEffect(() => {
    const timer = window.setInterval(() => setReadAt(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  // Placed by hand. An order carrying a run id was placed by a flow, and one
  // written before that was recorded reads as a hand-placed one — which is
  // what it looks like on screen anyway. The Positions tab leaves out the
  // coins this same list covers, so both come from one function.
  const mine = React.useMemo(
    () => smartOrdersYouPlaced(shownOrders),
    [shownOrders]
  )
  const marks = useLiveMarks(mine.map((one) => one.marketKey))
  const held = React.useMemo(
    () =>
      new Map(
        positions.map((one) => [`${one.walletId}:${one.marketKey}`, one])
      ),
    [positions]
  )
  const expiredWallets = React.useMemo(
    () =>
      new Set(
        wallets
          .filter(
            (wallet) =>
              wallet.status === "active" &&
              keyExpiryNotice(wallet.keyValidUntil, readAt)?.tone === "expired"
          )
          .map((wallet) => wallet.id)
      ),
    [wallets, readAt]
  )

  // Holding first — that is where the money is — then by coin, so the list
  // does not reshuffle every time a rung fills.
  const rows = React.useMemo(
    () =>
      [...mine].sort((left, right) => {
        const holdingFirst = (order: SmartOrder) =>
          held.has(`${order.walletId}:${order.marketKey}`) ? 0 : 1
        return (
          holdingFirst(left) - holdingFirst(right) ||
          marketSymbol(left.marketKey).localeCompare(
            marketSymbol(right.marketKey)
          )
        )
      }),
    [mine, held]
  )

  return (
    <>
      {rows.length === 0 && !settled && cached === null ? (
        <LoadingRow
          label="Reading your smart orders"
          className="flex-1 text-xs"
        />
      ) : rows.length === 0 && failed ? (
        <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          The smart orders could not be read, so it is not known whether a
          ladder or a grid is working.{" "}
          <button type="button" className="underline" onClick={onRetry}>
            Try again
          </button>
        </p>
      ) : rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          No ladder or grid of your own is working. Right-click the chart to
          place one — a flow&rsquo;s orders live on its own dashboard.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col">
            {rows.map((order) => {
              const position = held.get(`${order.walletId}:${order.marketKey}`)
              const mark =
                marks.get(order.marketKey) ??
                markets.get(order.marketKey)?.price ??
                null
              const open =
                position && mark !== null
                  ? (mark - position.entryPx) * position.szi - position.feesPaid
                  : null
              const banked = bankedBy(order, fills, trades)
              const keyExpired = expiredWallets.has(order.walletId)
              const selected = order.marketKey === selectedMarketKey
              return (
                <div key={order.id} className="border-b last:border-b-0">
                  <div
                    className={cn(
                      "flex items-stretch transition-colors",
                      selected
                        ? "bg-muted/60 hover:bg-muted/60"
                        : "hover:bg-muted/40"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectMarket(order.marketKey)}
                      className={cn(
                        // `min-w-0` or nothing below it can truncate: a
                        // no-wrap line's whole width is what a flex item
                        // offers as its smallest size, hidden overflow or not,
                        // so the row grew to fit the longest sentence in the
                        // list and pushed its dollars off the panel's edge.
                        "flex min-h-10 min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 pl-2 text-left",
                        focusRing
                      )}
                    >
                      <MarketIcon
                        symbol={marketSymbol(order.marketKey)}
                        iconUrl={markets.get(order.marketKey)?.iconUrl ?? null}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="truncate text-sm font-semibold">
                            {marketSymbol(order.marketKey)}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {KIND_LABELS[order.kind]} ·{" "}
                            {walletName(order.walletId)}
                          </span>
                        </div>
                        {order.plan.paused ? (
                          <p
                            className={cn(
                              "truncate text-xs leading-4",
                              WARNING
                            )}
                          >
                            Paused.{" "}
                            {order.plan.pauseReason ?? "Check the refusal."}
                          </p>
                        ) : keyExpired ? (
                          <p
                            className={cn(
                              "truncate text-xs leading-4",
                              LOST_MONEY
                            )}
                          >
                            Trading key expired. This{" "}
                            {order.kind === "grid" ? "grid" : "ladder"} will not
                            act.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-baseline gap-2 text-right font-mono text-xs whitespace-nowrap tabular-nums">
                        {open === null ? null : (
                          <span className={cn("font-medium", moneyTone(open))}>
                            {formatSignedUsd(open)}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          {banked.sells.length > 0 &&
                          banked.unpriced === banked.sells.length
                            ? "—"
                            : formatSignedUsd(banked.total)}
                          <PiggyBankIcon className="size-3.5" aria-hidden />
                          <span className="sr-only"> banked</span>
                        </span>
                      </div>
                    </button>
                    <SmartOrderDetailsPopover
                      order={order}
                      position={position ?? null}
                      openProfit={open}
                      banked={banked}
                      keyExpired={keyExpired}
                      walletName={walletName(order.walletId)}
                      onResume={() => onResumeSmartOrder(order)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </>
  )
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

function SmartOrderDetailsPopover({
  order,
  position,
  openProfit,
  banked,
  keyExpired,
  walletName,
  onResume,
}: {
  order: SmartOrder
  position: TradePosition | null
  openProfit: number | null
  banked: ReturnType<typeof bankedBy>
  keyExpired: boolean
  walletName: string
  onResume: () => Promise<boolean>
}) {
  const [resuming, setResuming] = React.useState(false)
  const pausedReason =
    order.plan.pauseReason ?? "The exchange refused this smart order."
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="mr-1 self-center"
          aria-label={`Open ${marketSymbol(order.marketKey)} smart order details`}
        >
          <EllipsisVerticalIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <PopoverHeader className="border-b p-3">
          <PopoverTitle>
            {marketSymbol(order.marketKey)} smart order
          </PopoverTitle>
          <p className="text-xs text-muted-foreground">
            {KIND_LABELS[order.kind]} · {walletName}
          </p>
        </PopoverHeader>
        <div className="grid gap-2 p-3">
          <p className="text-xs font-medium">Progress</p>
          <DetailRow label="Status">
            {order.plan.paused
              ? `Paused. ${pausedReason}`
              : keyExpired
                ? `Trading key expired. This ${order.kind === "grid" ? "grid" : "ladder"} will not act.`
                : whereItHasGot(order, position)}
          </DetailRow>
          {order.kind === "grid" ? (
            <DetailRow
              // A selling grid buys its position back; everything else,
              // including any plan too old to carry a direction, sells.
              label={
                order.plan.direction === "short"
                  ? "Held to buy back"
                  : "Held to sell"
              }
            >
              <span className="tabular-nums">
                {formatUsd(gridHeldToSell(order))}
              </span>
            </DetailRow>
          ) : null}
          {openProfit === null ? null : (
            <DetailRow label="Open profit">
              <span className={cn("tabular-nums", moneyTone(openProfit))}>
                {formatSignedUsd(openProfit)}
              </span>
            </DetailRow>
          )}
        </div>
        <div className="grid gap-2 border-t p-3">
          <p className="text-xs font-medium">Sales</p>
          {banked.sells.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing sold yet.</p>
          ) : (
            <>
              {banked.capped ? (
                <p className="text-xs text-muted-foreground">
                  The {SHOW_AT_MOST} most recent are listed. The total counts
                  them all.
                </p>
              ) : null}
              {banked.sells.map((sell) => (
                <div
                  key={sell.fillId}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span
                    className="truncate text-muted-foreground"
                    title={formatDateTime(new Date(sell.at))}
                  >
                    {formatTimeAgo(new Date(sell.at))} @{" "}
                    {formatClockTime(new Date(sell.at))} ·{" "}
                    {formatUsd(sell.amountUsd)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      sell.money === null
                        ? "text-muted-foreground"
                        : moneyTone(sell.money)
                    )}
                  >
                    {sell.money === null ? "—" : formatSignedUsd(sell.money)}
                  </span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t pt-2 text-sm font-medium">
                <span>
                  {banked.sells.length}{" "}
                  {banked.sells.length === 1 ? "sale" : "sales"}
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    banked.unpriced === banked.sells.length
                      ? "text-muted-foreground"
                      : moneyTone(banked.total)
                  )}
                >
                  {banked.unpriced === banked.sells.length
                    ? "—"
                    : formatSignedUsd(banked.total)}
                </span>
              </div>
              {banked.unpriced > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {banked.unpriced === 1
                    ? "The exchange has not said what that sale banked."
                    : `The exchange has not said what ${banked.unpriced} of these sales banked.`}
                </p>
              ) : null}
            </>
          )}
        </div>
        {order.plan.paused ? (
          <div className="border-t p-3">
            <Button
              type="button"
              className="w-full"
              disabled={resuming}
              onClick={() => {
                setResuming(true)
                void onResume().finally(() => setResuming(false))
              }}
            >
              <PlayIcon className="size-4" />
              {resuming ? "Resuming" : "Resume"}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Where one smart order has got to, shown in its detail popover.
 *
 * Each kind is asked its own question, because the same words would be a lie
 * about the others: a ladder has rungs waiting, a grid has levels recycling,
 * and a signal trade is simply in one of four states.
 */
function whereItHasGot(
  order: SmartOrder,
  position: TradePosition | null
): string {
  if (order.kind === "dca") {
    const waiting = order.plan.rungs.filter(
      (rung) => rung.status === "waiting"
    ).length
    const bought = order.plan.rungs.filter(
      (rung) => rung.status === "filled"
    ).length
    if (bought === 0) {
      return waiting === 0
        ? "Nothing left waiting"
        : `${waiting} ${waiting === 1 ? "rung" : "rungs"} waiting from ${formatPrice(order.plan.anchorPx)}`
    }
    return `${bought} bought, ${waiting} still waiting`
  }
  if (order.kind === "grid") {
    const waiting = order.plan.levels.filter(
      (level) => level.status === "waiting"
    ).length
    const completed =
      order.plan.levels.filter((level) => level.status === "holding").length +
      order.plan.carriedLevels.length
    return `${waiting} waiting · ${completed} completed`
  }
  if (order.kind === "watch") {
    // A watch has its own three states and they mean different things from a
    // signal trade's. Falling through to that one told somebody a price that
    // has not been reached yet was a position being held.
    if (order.plan.phase === "waiting") {
      return `Waiting for ${formatPrice(order.plan.triggerPx)}, nothing sent yet`
    }
    if (order.plan.phase === "stopping") return "Being called off"
    return `Reached ${formatPrice(order.plan.triggerPx)} — buying in`
  }
  const phase = order.plan.phase
  if (phase === "buying") return "Waiting to buy in"
  if (phase === "selling") return "Selling out"
  if (phase === "stopping") return "Getting out"
  return position ? `Holding from ${formatPrice(position.entryPx)}` : "Holding"
}

/**
 * Dollars a grid's open levels put up, and have not closed yet — coins a
 * buying grid still has to sell, or a short a selling grid still has to buy
 * back.
 */
function gridHeldToSell(order: Extract<SmartOrder, { kind: "grid" }>): number {
  return [...order.plan.levels, ...order.plan.carriedLevels].reduce(
    (total, level) => total + level.heldSz * level.buyPx,
    0
  )
}

/** How many sales are listed before the list gets in the way of reading it. */
const SHOW_AT_MOST = 12

type Sale = {
  fillId: string
  at: number
  /** Gross dollars bought or sold by the closing fill. */
  amountUsd: number
  /** Null when the venue sold but never said what the sale banked. */
  money: number | null
}

/**
 * What one smart order has actually banked, and each sale that banked it.
 *
 * **Read off the fills, not off the plan.** A grid's levels say what they were
 * set to do; the fills say what happened, in the exchange's own figures, fee
 * included. Every closing fill on this coin since the order was placed counts
 * — there is one smart order per coin per wallet, so on this coin, over this
 * stretch of time, they are its sales.
 *
 * Finished round trips are counted too, for the kinds that do go flat. A grid
 * rarely does, which is exactly why its sells sit in the open fills instead.
 *
 * **A sell is a sale even when the venue states no profit for it.** This used
 * to count only fills carrying a closed profit, and on KuCoin that is never a
 * grid's fills: KuCoin reports money per POSITION closed, not per fill, and a
 * grid selling a fifth of what it holds never closes a position. So a KuCoin
 * grid recycled all week and the panel still said "Nothing sold yet". A grid
 * and a ladder are both long only, so a sell on their coin is a sale, whoever
 * is keeping the books.
 *
 * What the venue would not state is left NULL rather than counted as zero.
 * Zero is a real answer, meaning the sale broke even, and printing it for a
 * sale that made money is the kind of wrong that gets believed.
 *
 * **A grid's sale is worth what its own level made.** The venue books every
 * partial sell against the position average, and while a grid is working that
 * average is held up by the expensive levels still holding, so a level that
 * did its job reads as a loss. The panel said "$1.15 banked" on a CHIP level
 * that put $4.28 in the account. `gridRoundTrips` has the arithmetic. It also
 * answers where KuCoin says nothing at all, because it is worked out from the
 * fills rather than asked for.
 */
export function bankedBy(
  order: SmartOrder,
  fills: readonly LiveFill[],
  trades: readonly LiveTrade[]
): {
  sells: Sale[]
  total: number
  capped: boolean
  /** Sales the venue never put a figure on, so the total is short of them. */
  unpriced: number
} {
  const mine = (walletId: string, marketKey: string, at: number) =>
    walletId === order.walletId &&
    marketKey === order.marketKey &&
    at >= order.createdAt

  // Over every fill, not only this order's: a level's round trip is paid out
  // of the trade that level opened with, and that trade has to still be in the
  // list for the closing one to be worth anything.
  const levels = gridRoundTrips(
    fills,
    order.kind === "grid" ? order.plan.direction : "long"
  )

  const sales: Sale[] = []
  for (const fill of fills) {
    if (!mine(fill.walletId, fill.marketKey, fill.at)) continue
    const level = levels.get(fill.fillId)
    // A stated profit, or a sell out of a long-only order. The first also
    // catches a short being bought back, which the second cannot see.
    const stated = fill.closedPnl !== 0
    if (!level && !stated && fill.side !== "sell") continue
    sales.push({
      fillId: fill.fillId,
      at: fill.at,
      amountUsd: Math.abs(fill.px * fill.sz),
      money: level ? level.money : stated ? fill.closedPnl - fill.fee : null,
    })
  }
  for (const trade of trades) {
    if (!mine(trade.walletId, trade.marketKey, trade.closedAt)) continue
    sales.push({
      fillId: trade.id,
      at: trade.closedAt,
      amountUsd: Math.abs(trade.exitPx * trade.sz),
      money: trade.pnl,
    })
  }

  sales.sort((left, right) => right.at - left.at)
  const total = sales.reduce((sum, sale) => sum + (sale.money ?? 0), 0)
  return {
    sells: sales.slice(0, SHOW_AT_MOST),
    total,
    capped: sales.length > SHOW_AT_MOST,
    /** Sales the venue never put a figure on, so the total is short of them. */
    unpriced: sales.filter((sale) => sale.money === null).length,
  }
}
