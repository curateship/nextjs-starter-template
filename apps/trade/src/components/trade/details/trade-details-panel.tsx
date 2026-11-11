import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeftRightIcon,
  BadgeDollarSignIcon,
  ChartCandlestickIcon,
  ChartLineIcon,
  HistoryIcon,
  LayersIcon,
  ListXIcon,
  ShieldAlertIcon,
  ImageDownIcon,
  PlusIcon,
  ReceiptTextIcon,
  SettingsIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { Area, AreaChart, ReferenceLine, YAxis } from "recharts"

import { OpenRunPanel, RecordMenu, type RecordAction } from "@/components/bots/bots-record"
import { PanelCard } from "@/components/shared/panel-card"
import { useCoinFills } from "@/components/trade/details/use-coin-fills"
import { downloadTradePicture } from "@/components/trade/details/share-trade-picture"
import { FigureGroup, FigureLine, FigureStat } from "@/components/trade/figure-rows"
import { PnlAmount } from "@/components/trade/pnl-amount"
import { PositionSideBadge } from "@/components/trade/position-side-badge"
import { TradeBadge } from "@/components/trade/trade-badge"
import { Button } from "@/components/ui/button"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { ErrorRow } from "@/components/ui/error-row"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { botsRecordHref } from "@/lib/bots/bots-search"
import { formatDateTime, formatDuration } from "@/lib/format/format-time"
import { marketSymbol, type MarketRow } from "@/lib/protocols/contracts"
import { formatFeeUsd, formatPrice, formatSignedUsd, formatSize, formatUsd } from "@/lib/trade/format"
import { GRID_SPACING_LABELS } from "@/lib/trade/grid"
import { useHidePnl, useHiddenPnlClass } from "@/lib/trade/hide-pnl"
import { useLiveMarks } from "@/lib/trade/live-market"
import {
  gridRoundTrips,
  tradeEndingLabel,
  type LiveFill,
  type LiveTrade,
  type RemovableTradeHistory,
  type UnmatchedTradeHistory,
} from "@/lib/trade/live-trades"
import { moneyTone } from "@/lib/trade/money-tone"
import { positionProfit, positionValue, type TradePosition } from "@/lib/trade/paper"
import { positionFees } from "@/lib/trade/position-fees"
import { fillSlippage, fillsSlippage } from "@/lib/trade/slippage"
import { smartOrderSales } from "@/lib/trade/smart-order-sales"
import type { SmartGrid, SmartLadder, SmartOrder } from "@/lib/trade/smart-plan"
import { TRADE_MAKER_LABELS, tradeFlowRunId, tradeMaker, type TradeMaker } from "@/lib/trade/trade-maker"
import { cn } from "@/lib/utils"

/**
 * What the Trade dashboard's right panel has open (Tyler, 10 Nov 2026: "I
 * want to add a right panel in the positions and journal tab. Clicking on the
 * trade open the right panel to show more details", and "Any chart should
 * have a right panel to show its previous trade history").
 *
 * - `position`: a Positions row, or a Journal row still open.
 * - `trade`: a finished Journal row.
 * - `history`: a Journal row whose fills never pair into a whole trade.
 * - `coin`: the charted coin, on the chart and Open orders tabs: its current
 *   trade on top, then its earlier ones.
 */
export type DetailsSubject =
  | { kind: "position"; position: TradePosition }
  | { kind: "trade"; trade: LiveTrade }
  | { kind: "history"; history: UnmatchedTradeHistory }
  | { kind: "coin"; marketKey: string }

export type DetailsActions = {
  onClose: (position: TradePosition) => void
  /** The Close all list, opened from the trigger handed in. */
  closeAll: (trigger: React.ReactElement) => React.ReactNode
  onAdd: (position: TradePosition) => void
  onEdit: (position: TradePosition) => void
  /** Draws the trade on the chart and goes to the chart tab. */
  onShowOnChart: (trade: LiveTrade) => void
  onRemove: (trade: RemovableTradeHistory) => void
  /** Opens one of the coin's earlier trades in the Journal. */
  onOpenTrade: (trade: LiveTrade) => void
}

type Data = {
  /** Every market on offer, for each coin's name and its last price. */
  markets: ReadonlyMap<string, MarketRow>
  positions: readonly TradePosition[]
  trades: readonly LiveTrade[]
  /** Every fill the page holds, the Journal's older pages included. */
  fills: readonly LiveFill[]
  /** The fills the Positions table adds a position's fees up from, so both say the same. */
  positionFills: readonly LiveFill[]
  smartOrders: readonly SmartOrder[]
  walletName: (walletId: string) => string
  busy: boolean
}

/** A coin's name as the tables write it: the market's own symbol. */
function symbolOf(data: Pick<Data, "markets">, marketKey: string): string {
  return data.markets.get(marketKey)?.symbol ?? marketSymbol(marketKey)
}

/** How many buys and sells show before "Show all", so a long grid stays quick. */
const FIRST_FILLS = 100

/** The grid or ladder working one wallet's coin, if there is one. */
function smartOrderOn(
  smartOrders: readonly SmartOrder[],
  walletId: string,
  marketKey: string
): SmartGrid | SmartLadder | null {
  for (const order of smartOrders) {
    if (
      order.walletId === walletId &&
      order.marketKey === marketKey &&
      order.status === "active" &&
      (order.kind === "grid" || order.kind === "dca")
    ) {
      return order
    }
  }
  return null
}

/** Who placed a held position: its grid or ladder, else what its fills say. */
function positionMaker(order: SmartOrder | null, fills: readonly LiveFill[]): TradeMaker {
  if (order) return order.flowRunId ? "bot" : order.kind === "dca" ? "dca" : "grid"
  return tradeMaker(fills)
}

export function TradeDetailsPanel({
  subject,
  data,
  actions,
}: {
  /** Null only while there is nothing at all to open. */
  subject: DetailsSubject | null
  data: Data
  actions: DetailsActions
}) {
  if (!subject) {
    return (
      <OpenRunPanel title="Trade" icon={ReceiptTextIcon} menu={null} hideLabel="Hide the trade">
        <p className="py-6 text-center text-sm text-muted-foreground">
          Click a trade to see its buys, sells and money here.
        </p>
      </OpenRunPanel>
    )
  }
  if (subject.kind === "position") {
    return <PositionDetails position={subject.position} data={data} actions={actions} />
  }
  if (subject.kind === "trade") {
    return <TradeDetails trade={subject.trade} data={data} actions={actions} />
  }
  if (subject.kind === "history") {
    return <HistoryDetails history={subject.history} data={data} actions={actions} />
  }
  return <CoinDetails marketKey={subject.marketKey} data={data} actions={actions} />
}

/** The charted coin: its open positions first, else its earlier trades. */
function CoinDetails({ marketKey, data, actions }: { marketKey: string; data: Data; actions: DetailsActions }) {
  const held = data.positions.find((position) => position.marketKey === marketKey)
  if (held) return <PositionDetails position={held} data={data} actions={actions} />
  const symbol = symbolOf(data, marketKey)
  return (
    <OpenRunPanel
      title={symbol}
      icon={ReceiptTextIcon}
      menu={null}
      hideLabel="Hide the trade"
      // Said in the footer, where a held trade's buttons sit (Tyler, 11 Nov
      // 2026: "this goes into the footer").
      footer={<p className="text-sm text-muted-foreground">Nothing is held on {symbol} right now.</p>}
    >
      <EarlierTrades marketKey={marketKey} except={null} data={data} actions={actions} />
    </OpenRunPanel>
  )
}

function PositionDetails({
  position,
  data,
  actions,
}: {
  position: TradePosition
  data: Data
  actions: DetailsActions
}) {
  const hiddenPnl = useHiddenPnlClass()
  const hideMoney = useHidePnl()
  const marks = useLiveMarks([position.marketKey])
  // Today's price as the Positions table reads it: the live feed, else the
  // market list's last price, else the entry.
  const mark =
    marks.get(position.marketKey) ??
    data.markets.get(position.marketKey)?.price ??
    position.entryPx
  const symbol = symbolOf(data, position.marketKey)
  const order = smartOrderOn(data.smartOrders, position.walletId, position.marketKey)
  // The position's own fills: everything on this coin the page holds that is
  // not yet a finished trade, and for a grid or ladder every fill since it
  // was placed, read for the purpose.
  const openFills = React.useMemo(
    () =>
      data.fills.filter(
        (fill) => fill.walletId === position.walletId && fill.marketKey === position.marketKey
      ),
    [data.fills, position.walletId, position.marketKey]
  )
  const coin = useCoinFills(
    order ? position.walletId : null,
    order ? position.marketKey : null,
    order ? order.createdAt : null,
    data.fills
  )
  const fills = order ? coin.fills : openFills
  const profit = positionProfit(position, mark)
  const fees = position.live ? positionFees(data.positionFills, position) : null
  const maker = positionMaker(order, fills)
  const flowRunId = order?.flowRunId ?? tradeFlowRunId(fills)

  const menuActions: RecordAction[] = [
    { label: "Add to position", icon: <PlusIcon className="size-4" />, onClick: () => actions.onAdd(position), disabled: data.busy },
    ...(position.owned
      ? []
      : [{ label: "Stop and target", icon: <SettingsIcon className="size-4" />, onClick: () => actions.onEdit(position), disabled: data.busy }]),
    {
      label: "Share as a picture",
      icon: <ImageDownIcon className="size-4" />,
      onClick: () => sharePosition(symbol, position, profit, fills, hideMoney),
    },
    {
      label: position.owned ? "Sell all" : "Close position",
      icon: <XIcon className="size-4" />,
      onClick: () => actions.onClose(position),
      disabled: data.busy,
      destructive: true,
    },
  ]

  return (
    <OpenRunPanel
      title={symbol}
      icon={ReceiptTextIcon}
      hideLabel="Hide the trade"
      menu={<RecordMenu label={`${symbol} position menu`} actions={menuActions} />}
      footer={
        <>
          {/* Two buttons and nothing else (Tyler, 11 Nov 2026: "The footer
              should only have 2 buttons with icon [Close trade] [Close all
              trades]"); Add and Stop and target are in the ⋮. Side by side
              with room, one under the other without. */}
          <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2">
            <Button type="button" disabled={data.busy} onClick={() => actions.onClose(position)}>
              <XIcon className="size-4" />
              {position.owned ? "Sell all" : "Close trade"}
            </Button>
            {actions.closeAll(
              <Button type="button" variant="outline" disabled={data.busy}>
                <ListXIcon className="size-4" />
                Close all trades
              </Button>
            )}
          </div>
        </>
      }
    >
      <PanelCard storageId="trade-details-summary" icon={<ChartLineIcon />} title="Summary">
        <FigureGroup title="Now">
          <FigureStat
            label="Made or lost"
            value={position.owned?.entryKnown === false ? "—" : formatSignedUsd(profit)}
            tone={profit}
            valueClassName={hiddenPnl}
          />
          <FigureLine label="Value" value={formatUsd(positionValue(position, mark))} />
          <FigureLine label="Price now" value={formatPrice(mark)} />
        </FigureGroup>
        <FigureGroup title="The trade" small>
          <div className="flex items-baseline gap-3">
            <dt className="min-w-0 flex-1 text-foreground/75">Side</dt>
            <dd><PositionSideBadge position={position} /></dd>
          </div>
          <FigureLine label="Size" value={`${formatSize(Math.abs(position.szi))} ${symbol}`} />
          <FigureLine label="Entry" value={position.owned?.entryKnown === false ? "—" : formatPrice(position.entryPx)} />
          <FigureLine
            label="Fees"
            value={position.live ? (fees ? formatFeeUsd(fees.paid) : "—") : formatFeeUsd(position.feesPaid)}
          />
          <FigureLine label="Slippage" value={fees?.slippage == null ? "—" : formatSignedUsd(fees.slippage)} />
          <FigureLine label="Wallet" value={data.walletName(position.walletId)} />
          <MakerLine maker={maker} flowRunId={flowRunId} copiedFrom={undefined} />
        </FigureGroup>
        {order?.kind === "grid" ? <GridSetup grid={order} /> : null}
      </PanelCard>

      {order ? <SalesCard order={order} fills={coin.fills} trades={data.trades} whole={coin.whole} capped={coin.capped} failed={coin.failed} onRetry={coin.retry} /> : null}
      <EarlierTrades marketKey={position.marketKey} except={null} data={data} actions={actions} />
      {order?.kind === "dca" ? <LadderSteps ladder={order} /> : null}
      <FillsCard fills={fills} />
    </OpenRunPanel>
  )
}

function sharePosition(
  symbol: string,
  position: TradePosition,
  profit: number,
  fills: readonly LiveFill[],
  hideMoney: boolean
) {
  downloadTradePicture({
    symbol,
    direction: position.szi > 0 ? "long" : "short",
    money: position.owned?.entryKnown === false ? null : profit,
    returnPct: null,
    from: fills[0]?.at ?? position.updatedAt,
    to: null,
    hideMoney,
  })
}

function TradeDetails({ trade, data, actions }: { trade: LiveTrade; data: Data; actions: DetailsActions }) {
  const hiddenPnl = useHiddenPnlClass()
  const hideMoney = useHidePnl()
  const symbol = symbolOf(data, trade.marketKey)
  const fees = trade.fills.reduce((sum, fill) => sum + fill.fee, 0)
  const slippage = fillsSlippage(trade.fills)
  const maker = tradeMaker(trade.fills, trade.copiedFrom)
  const flowRunId = tradeFlowRunId(trade.fills)
  const share = () =>
    downloadTradePicture({
      symbol,
      direction: trade.direction,
      money: trade.pnl,
      returnPct: trade.returnPct,
      from: trade.openedAt,
      to: trade.closedAt,
      hideMoney,
    })
  const menuActions: RecordAction[] = [
    { label: "Show on chart", icon: <ChartCandlestickIcon className="size-4" />, onClick: () => actions.onShowOnChart(trade) },
    { label: "Share as a picture", icon: <ImageDownIcon className="size-4" />, onClick: share },
    { label: "Remove", icon: <Trash2Icon className="size-4" />, onClick: () => actions.onRemove(trade), disabled: data.busy, destructive: true },
  ]
  const gridSales = trade.fills.some((fill) => fill.grid)
  return (
    <OpenRunPanel
      title={symbol}
      icon={ReceiptTextIcon}
      hideLabel="Hide the trade"
      menu={<RecordMenu label={`${symbol} trade menu`} actions={menuActions} />}
      footer={
        <>
          <span className="mr-auto text-xs text-muted-foreground">{tradeEndingLabel(trade)}</span>
          <IconAction label="Remove from the Journal" disabled={data.busy} onClick={() => actions.onRemove(trade)}>
            <Trash2Icon className="size-4" />
          </IconAction>
          <Button type="button" size="sm" onClick={() => actions.onShowOnChart(trade)}>
            Show on chart
          </Button>
        </>
      }
    >
      <PanelCard storageId="trade-details-summary" icon={<ChartLineIcon />} title="Summary">
        <FigureGroup title="Result">
          <FigureStat label="Made or lost" value={formatSignedUsd(trade.pnl)} tone={trade.pnl} valueClassName={hiddenPnl} />
          <FigureLine label="Return" value={`${trade.returnPct >= 0 ? "+" : ""}${trade.returnPct.toFixed(1)}%`} />
          <FigureLine
            label="Ended"
            value={`${tradeEndingLabel(trade)}${trade.stopPx !== null ? ` at ${formatPrice(trade.stopPx)}` : ""}`}
          />
        </FigureGroup>
        <FigureGroup title="The trade" small>
          <FigureLine label="Side" value={trade.direction === "long" ? "Long" : "Short"} />
          <FigureLine label="Opened" value={formatDateTime(new Date(trade.openedAt))} />
          <FigureLine label="Closed" value={formatDateTime(new Date(trade.closedAt))} />
          <FigureLine label="Held" value={formatDuration(trade.heldMs)} />
          <FigureLine label="Entry" value={formatPrice(trade.entryPx)} />
          <FigureLine label="Exit" value={formatPrice(trade.exitPx)} />
          <FigureLine label="Size" value={`${formatSize(trade.sz)} ${symbol}`} />
          <FigureLine label="Put in" value={formatUsd(trade.amountUsd)} />
          <FigureLine label="Fees" value={formatFeeUsd(fees)} />
          <FigureLine label="Slippage" value={slippage === null ? "—" : formatSignedUsd(slippage)} />
          <FigureLine label="Wallet" value={data.walletName(trade.walletId)} />
          <MakerLine maker={maker} flowRunId={flowRunId} copiedFrom={trade.copiedFrom} />
        </FigureGroup>
      </PanelCard>

      {gridSales ? <FinishedGridSales trade={trade} /> : null}
      <EarlierTrades marketKey={trade.marketKey} except={trade.id} data={data} actions={actions} />
      {trade.overrode && trade.overrode.length > 0 ? (
        <PanelCard storageId="trade-details-rules" icon={<ShieldAlertIcon />} title="Rules you skipped" meta={trade.overrode.length}>
          <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-sm">
            {trade.overrode.map((name) => (
              <li key={name} className="text-foreground/75">{name}</li>
            ))}
          </ul>
        </PanelCard>
      ) : null}

      <FillsCard fills={trade.fills} />
    </OpenRunPanel>
  )
}

function HistoryDetails({
  history,
  data,
  actions,
}: {
  history: UnmatchedTradeHistory
  data: Data
  actions: DetailsActions
}) {
  // Still open: the position itself is the record, with its grid or ladder.
  const held = history.open
    ? data.positions.find((one) => one.walletId === history.walletId && one.marketKey === history.marketKey)
    : undefined
  if (held) return <PositionDetails position={held} data={data} actions={actions} />
  const symbol = symbolOf(data, history.marketKey)
  return (
    <OpenRunPanel
      title={symbol}
      icon={ReceiptTextIcon}
      hideLabel="Hide the trade"
      menu={
        history.open ? null : (
          <RecordMenu
            label={`${symbol} history menu`}
            actions={[
              { label: "Remove", icon: <Trash2Icon className="size-4" />, onClick: () => actions.onRemove(history), disabled: data.busy, destructive: true },
            ]}
          />
        )
      }
    >
      <PanelCard storageId="trade-details-summary" icon={<ChartLineIcon />} title="Summary">
        <p className="text-sm text-muted-foreground">
          {history.fills.length.toLocaleString()} saved {history.fills.length === 1 ? "fill" : "fills"} whose
          matching entry or exit is missing, so they do not make a whole trade.
        </p>
        <FigureGroup title="The fills" small>
          <FigureLine label="First" value={formatDateTime(new Date(history.firstAt))} />
          <FigureLine label="Last" value={formatDateTime(new Date(history.lastAt))} />
          <FigureLine label="Wallet" value={data.walletName(history.walletId)} />
          <MakerLine maker={tradeMaker(history.fills)} flowRunId={tradeFlowRunId(history.fills)} copiedFrom={undefined} />
        </FigureGroup>
      </PanelCard>
      <EarlierTrades marketKey={history.marketKey} except={null} data={data} actions={actions} />
      <FillsCard fills={history.fills} />
    </OpenRunPanel>
  )
}

/** A footer button drawn as its icon, named on its tooltip. */
function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** "Who placed it", with a link to the bot's run or the copied trader's page. */
function MakerLine({
  maker,
  flowRunId,
  copiedFrom,
}: {
  maker: TradeMaker
  flowRunId: string | null
  copiedFrom: string | undefined
}) {
  const link =
    maker === "bot" && flowRunId ? (
      <a href={botsRecordHref("bots", flowRunId)} className="underline underline-offset-4 hover:text-foreground">
        Bot
      </a>
    ) : maker === "copied" && copiedFrom ? (
      <Link to="/t/$handle" params={{ handle: copiedFrom }} className="underline underline-offset-4 hover:text-foreground">
        @{copiedFrom}
      </Link>
    ) : null
  return (
    <div className="flex items-baseline gap-3">
      <dt className="min-w-0 flex-1 text-foreground/75">Placed by</dt>
      <dd className="shrink-0 text-right">{link ?? TRADE_MAKER_LABELS[maker]}</dd>
    </div>
  )
}

/** A grid's settings, as a group inside the Summary card. */
function GridSetup({ grid }: { grid: SmartGrid }) {
  const plan = grid.plan
  return (
    <FigureGroup title="Grid" small>
      <FigureLine label="Direction" value={plan.direction === "short" ? "Sells first" : "Buys first"} />
      <FigureLine label="Range" value={`${formatPrice(plan.bottomPx)} to ${formatPrice(plan.topPx)}`} />
      <FigureLine label="Levels" value={String(plan.levels.length)} />
      <FigureLine label="Spacing" value={GRID_SPACING_LABELS[plan.spacing]} />
      <FigureLine label="Share of the wallet" value={`${plan.potPct}%`} />
      <FigureLine label="Leverage" value={`${plan.leverage}x`} />
      <FigureLine label="Take profit" value={plan.takeProfitPx === null ? "None" : formatPrice(plan.takeProfitPx)} />
      <FigureLine label="Started" value={formatDateTime(new Date(grid.createdAt))} />
      <FigureLine label="Times the whole grid sold" value={String(plan.cycles)} />
    </FigureGroup>
  )
}

/** A DCA ladder's steps, top to bottom, with whether each has bought. */
function LadderSteps({ ladder }: { ladder: SmartLadder }) {
  const plan = ladder.plan
  const status: Record<string, string> = {
    waiting: "Waiting",
    filled: "Bought",
    sold: "Sold",
    skipped: "Skipped",
    cancelled: "Off",
  }
  return (
    <PanelCard storageId="trade-details-dca-steps" icon={<LayersIcon />} title="DCA steps" meta={plan.rungs.length}>
      <FigureGroup title="Setup" small>
        <FigureLine label="Leverage" value={`${plan.leverage}x`} />
        <FigureLine
          label="Take profit"
          value={plan.takeProfit?.pct ? `${plan.takeProfit.pct}%` : "None"}
        />
        <FigureLine label="Started" value={formatDateTime(new Date(ladder.createdAt))} />
      </FigureGroup>
      <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 text-[13px]">
        {plan.rungs.map((rung, index) => (
          <li key={index} className={cn("flex items-baseline gap-2", rung.dead && "opacity-60")}>
            <span className="min-w-0 flex-1 truncate text-foreground/75">
              Step {index + 1} at {formatPrice(rung.px)}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatUsd(rung.px * rung.sz)}</span>
            <TradeBadge tone={rung.status === "filled" ? "made" : undefined}>{status[rung.status] ?? rung.status}</TradeBadge>
          </li>
        ))}
      </ul>
    </PanelCard>
  )
}

/** Every sale a working grid or ladder has made, from the fills read for it. */
function SalesCard({
  order,
  fills,
  trades,
  whole,
  capped,
  failed,
  onRetry,
}: {
  order: SmartGrid | SmartLadder
  fills: readonly LiveFill[]
  /** The page's finished trades, counted until the full read lands. */
  trades: readonly LiveTrade[]
  whole: boolean
  capped: boolean
  failed: boolean
  onRetry: () => void
}) {
  const hiddenPnl = useHiddenPnlClass()
  // Until the server's full read lands, the finished trades the page already
  // holds on this coin count too (rules/instant-first.md). Once it lands, its
  // fills hold those trades' fills as well, so they are not counted twice.
  const sales = React.useMemo(
    () => smartOrderSales(order, fills, whole ? [] : trades),
    [order, fills, whole, trades]
  )
  return (
    <PanelCard storageId="trade-details-sales" icon={<BadgeDollarSignIcon />} title="Sales" meta={sales.sells.length.toLocaleString()}>
      <FigureGroup title="Total">
        <FigureStat
          label={whole ? "Made by every sale" : "Made by the sales so far"}
          value={formatSignedUsd(sales.total)}
          tone={sales.total}
          valueClassName={hiddenPnl}
          note={
            sales.unpriced > 0
              ? `${sales.unpriced} ${sales.unpriced === 1 ? "sale" : "sales"} the exchange gave no figure for are not in this total.`
              : null
          }
        />
      </FigureGroup>
      {failed ? (
        <ErrorRow message="The older sales could not be read. These are only the newest." onRetry={onRetry} className="py-2 text-xs" />
      ) : null}
      {capped ? (
        <p className="text-xs text-muted-foreground">Only the newest 20,000 fills were read, so the oldest sales are not here.</p>
      ) : null}
      {sales.sells.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing sold yet.</p>
      ) : (
        <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 text-[13px]">
          {sales.sells.map((sale) => (
            <li key={sale.fillId} className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-foreground/75">
                {formatDateTime(new Date(sale.at))}
                {sale.level ? <span className="text-muted-foreground"> · {sale.level}</span> : null}
              </span>
              <PnlAmount className={cn("shrink-0 font-medium tabular-nums", sale.money === null ? "text-muted-foreground" : moneyTone(sale.money))}>
                {sale.money === null ? "—" : formatSignedUsd(sale.money)}
              </PnlAmount>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  )
}

/** A finished trade's own grid sales, read straight off its fills. */
function FinishedGridSales({ trade }: { trade: LiveTrade }) {
  const hiddenPnl = useHiddenPnlClass()
  const sales = React.useMemo(() => {
    const trips = gridRoundTrips(trade.fills, trade.direction)
    return trade.fills
      .flatMap((fill) => {
        const trip = trips.get(fill.fillId)
        return trip ? [{ fill, trip }] : []
      })
      .reverse()
  }, [trade])
  const total = sales.reduce((sum, sale) => sum + sale.trip.money, 0)
  return (
    <PanelCard storageId="trade-details-sales" icon={<BadgeDollarSignIcon />} title="Grid sales" meta={sales.length.toLocaleString()}>
      <FigureGroup title="Total">
        <FigureStat label="Made by every sale" value={formatSignedUsd(total)} tone={total} valueClassName={hiddenPnl} />
      </FigureGroup>
      <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 text-[13px]">
        {sales.map(({ fill, trip }) => (
          <li key={fill.fillId} className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-foreground/75">
              {formatDateTime(new Date(fill.at))}
              {trip.name ? <span className="text-muted-foreground"> · {trip.name}</span> : null}
            </span>
            <PnlAmount className={cn("shrink-0 font-medium tabular-nums", moneyTone(trip.money))}>
              {formatSignedUsd(trip.money)}
            </PnlAmount>
          </li>
        ))}
      </ul>
    </PanelCard>
  )
}

/** Every buy and sell, newest first, the first hundred until asked for all. */
function FillsCard({ fills }: { fills: readonly LiveFill[] }) {
  const [all, setAll] = React.useState(false)
  const newestFirst = React.useMemo(() => [...fills].reverse(), [fills])
  const shown = all ? newestFirst : newestFirst.slice(0, FIRST_FILLS)
  return (
    <PanelCard storageId="trade-details-fills" icon={<ArrowLeftRightIcon />} title="Buys and sells" meta={fills.length.toLocaleString()}>
      {fills.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fills on hand for this trade.</p>
      ) : (
        <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 text-[13px]">
          {shown.map((fill) => {
            const slip = fillSlippage(fill, fill.sz)
            return (
              <li key={fill.fillId} className="grid gap-0.5">
                <span className="flex items-baseline gap-2">
                  <TradeBadge tone={fill.side === "buy" ? "made" : "lost"}>{fill.side === "buy" ? "Buy" : "Sell"}</TradeBadge>
                  <span className="min-w-0 flex-1 truncate tabular-nums">
                    {formatSize(fill.sz)} at {formatPrice(fill.px)}
                  </span>
                </span>
                <span className="flex gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">{formatDateTime(new Date(fill.at))}</span>
                  <span className="shrink-0">Fee {formatFeeUsd(fill.fee)}</span>
                  {slip === null ? null : <span className="shrink-0">Slip {formatSignedUsd(slip)}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {!all && fills.length > FIRST_FILLS ? (
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setAll(true)}>
          Show all {fills.length.toLocaleString()}
        </Button>
      ) : null}
    </PanelCard>
  )
}

const MONEY_CHART: ChartConfig = { total: { label: "Total", color: "var(--foreground)" } }

/** The coin's other finished trades, newest first, and what they add up to over time. */
function EarlierTrades({
  marketKey,
  except,
  data,
  actions,
}: {
  marketKey: string
  except: string | null
  data: Data
  actions: DetailsActions
}) {
  const hiddenPnl = useHiddenPnlClass()
  const earlier = React.useMemo(
    () =>
      data.trades
        .filter((trade) => trade.marketKey === marketKey && trade.id !== except)
        .sort((left, right) => right.closedAt - left.closedAt),
    [data.trades, marketKey, except]
  )
  const total = earlier.reduce((sum, trade) => sum + trade.pnl, 0)
  const line = React.useMemo(
    () =>
      [...earlier].reverse().reduce<{ at: number; total: number }[]>(
        (points, trade) => {
          points.push({ at: trade.closedAt, total: (points.at(-1)?.total ?? 0) + trade.pnl })
          return points
        },
        []
      ),
    [earlier]
  )
  return (
    <PanelCard storageId="trade-details-earlier" icon={<HistoryIcon />} title={`Earlier ${symbolOf(data, marketKey)} trades`} meta={earlier.length}>
      {earlier.length === 0 ? (
        <p className="text-sm text-muted-foreground">No earlier trades on this coin.</p>
      ) : (
        <>
          <FigureGroup title="All of them">
            <FigureStat label="Made or lost" value={formatSignedUsd(total)} tone={total} valueClassName={hiddenPnl} />
            <FigureLine
              label="Made money"
              value={`${earlier.filter((trade) => trade.pnl > 0).length} of ${earlier.length}`}
            />
          </FigureGroup>
          {line.length > 1 ? (
            <ChartContainer config={MONEY_CHART} className={cn("aspect-auto h-20 w-full", hiddenPnl)} aria-label="Money from these trades added up, oldest to newest">
              <AreaChart data={line} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="4 4" />
                <Area
                  type="linear"
                  dataKey="total"
                  isAnimationActive={false}
                  stroke="var(--color-total)"
                  strokeWidth={1.5}
                  fill="var(--color-total)"
                  fillOpacity={0.06}
                />
              </AreaChart>
            </ChartContainer>
          ) : null}
          <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5 text-[13px]">
            {earlier.slice(0, 50).map((trade) => (
              <li key={trade.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline gap-2 rounded-md px-1 py-1 text-left hover:bg-muted"
                  onClick={() => actions.onOpenTrade(trade)}
                >
                  <span className="min-w-0 flex-1 truncate text-foreground/75">
                    {formatDateTime(new Date(trade.closedAt))}
                    <span className="text-muted-foreground"> · {trade.direction === "long" ? "Long" : "Short"}</span>
                  </span>
                  <PnlAmount className={cn("shrink-0 font-medium tabular-nums", moneyTone(trade.pnl))}>
                    {formatSignedUsd(trade.pnl)}
                  </PnlAmount>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </PanelCard>
  )
}
