import * as React from "react"
import { BotIcon, InfoIcon, ListIcon } from "lucide-react"

import { TestnetStrip } from "@/components/trade/market-list-panel"
import { PinnedMarketButton } from "@/components/trade/pinned-market-button"
import { MarketPicker } from "@/components/trade/market-picker"
import { MarketFolderStar } from "@/components/trade/market-folder-star"
import { PhoneMenuRow } from "@/components/trade/market-phone-menu"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  parseMarketKey,
  type MarketPickerCapabilities,
  type MarketRow,
} from "@/lib/protocols/contracts"
import type {
  MarketFolder,
  MarketFolderActions,
} from "@/lib/trade/market-folders"
import { formatCompactUsd } from "@/lib/trade/format"
import { minimumOrderLabel } from "@/lib/trade/market-info"

/**
 * What the middle panel is showing.
 *
 * A real market selected for the middle panel. Empty and unavailable charts do
 * not draw substitute headers.
 */
export type MarketSelection = {
  kind: "market"
  row: MarketRow
  protocolLabel: string
  networkLabel: string
  picker: MarketPickerCapabilities
}

/**
 * One row: the chosen market opens the full market picker, its star and its
 * leverage sit beside it, and the chart's own controls stay on the right.
 */
export function MarketHeader({
  selection,
  markets,
  folders,
  folderActions,
  onSelectMarket,
  marketAction,
  toolbar,
  note,
  onOpenMarkets,
  onOpenSmartOrders,
  onSearchBeyond,
  phoneToolbar,
  phoneMenu,
}: {
  selection: MarketSelection
  markets: MarketRow[]
  folders: readonly MarketFolder[]
  folderActions: MarketFolderActions
  onSelectMarket: (key: string) => void
  /** One control immediately beside the market group, before right-side tools. */
  marketAction?: React.ReactNode
  /** The chart's controls — the interval picker — shown only with a market. */
  toolbar?: React.ReactNode
  /** One short line before the controls: where the chart's older bars came from. */
  note?: React.ReactNode
  /**
   * Narrow screens only. The side panels are not on screen there, so the
   * header opens Markets and Smart orders; passing neither leaves the buttons
   * off.
   */
  onOpenMarkets?: () => void
  onOpenSmartOrders?: () => void
  /** The venue's lookup for a market outside the list, where it has one. */
  onSearchBeyond?: (query: string) => Promise<MarketRow[]>
  /**
   * Phone only. The one chart control that stays on the row — the timeframe —
   * and the three dots holding everything else. Both are built by the
   * workspace, because the controls inside them are the workspace's.
   */
  phoneToolbar?: React.ReactNode
  phoneMenu?: React.ReactNode
}) {
  const phone = useIsMobile()
  const star = (
    <MarketFolderStar
      symbol={selection.row.symbol}
      marketKey={selection.row.key}
      folders={folders}
      busy={folderActions.busy}
      compact={phone}
      onQuickAdd={() => folderActions.quickAdd(selection.row.key)}
      onToggle={(folderId, saved) =>
        folderActions.toggle(selection.row.key, folderId, saved)
      }
      onCreate={(name) => folderActions.create(selection.row.key, name)}
    />
  )
  const picker = (
    <MarketPicker
      key={parseMarketKey(selection.row.key)?.protocol}
      rows={markets}
      selected={selection.row}
      capabilities={selection.picker}
      folders={folders}
      folderActions={folderActions}
      onSelect={onSelectMarket}
      venueLabel={selection.protocolLabel}
      onSearchBeyond={onSearchBeyond}
      phone={phone}
    />
  )
  const testnetStrip =
    parseMarketKey(selection.row.key)?.network === "testnet" ? (
      <TestnetStrip />
    ) : null

  // One row on a phone, and every control that is not the market itself, the
  // timeframe or the two panels has moved into the three dots at the end. The
  // row used to wrap onto a second line of nine buttons, which took a third of
  // the screen before the chart began.
  if (phone) {
    return (
      <>
        <DashboardCardHeader className="flex-nowrap">
          {onOpenMarkets ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Show markets"
              className="bg-muted/60 dark:bg-muted/60"
              onClick={onOpenMarkets}
            >
              <ListIcon className="size-4" />
            </Button>
          ) : null}
          <div className="flex h-8 min-w-0 flex-1 items-center rounded-lg border bg-muted/60">
            <span className="flex h-full shrink-0 items-center pl-2">
              {star}
            </span>
            {picker}
          </div>
          {phoneToolbar}
          {onOpenSmartOrders ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Show smart orders"
              className="bg-muted/60 dark:bg-muted/60"
              onClick={onOpenSmartOrders}
            >
              <BotIcon className="size-4" />
            </Button>
          ) : null}
          {phoneMenu}
        </DashboardCardHeader>
        {testnetStrip}
      </>
    )
  }

  const sheetButtons =
    onOpenMarkets || onOpenSmartOrders ? (
      <>
        {onOpenMarkets ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Show markets"
                className="bg-muted/60 dark:bg-muted/60"
                onClick={onOpenMarkets}
              >
                <ListIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show markets</TooltipContent>
          </Tooltip>
        ) : null}
        {onOpenSmartOrders ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Show smart orders"
                className="bg-muted/60 dark:bg-muted/60"
                onClick={onOpenSmartOrders}
              >
                <BotIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show smart orders</TooltipContent>
          </Tooltip>
        ) : null}
      </>
    ) : null

  const action =
    toolbar || sheetButtons ? (
      <div className="flex items-center gap-2">
        {note}
        {toolbar}
        {sheetButtons}
      </div>
    ) : undefined

  return (
    <>
      <DashboardCardHeader className="flex-wrap sm:flex-nowrap">
        {star}
        <PinnedMarketButton marketKey={selection.row.key} />
        <div className="flex h-8 min-w-0 items-center rounded-lg border bg-muted/60">
          {picker}
          <span className="flex h-full shrink-0 items-center border-l">
            <MarketInfo selection={selection} />
          </span>
        </div>
        {marketAction}
        {action ? <div className="ml-auto shrink-0">{action}</div> : null}
      </DashboardCardHeader>
      {testnetStrip}
    </>
  )
}

/** What the exchange says about this market, one fact to a line. */
function marketInfoLines(
  selection: Extract<MarketSelection, { kind: "market" }>
) {
  const leverage =
    selection.row.maxLeverage === null
      ? "Not stated publicly"
      : `${selection.row.maxLeverage}×`
  return [
    selection.protocolLabel,
    selection.networkLabel,
    `Price tick: ${selection.row.priceTick ?? "Exchange rounding rule"}`,
    "List price: mark price",
    "Chart bars: traded prices",
    `Daily volume: ${formatCompactUsd(selection.row.volume24hUsd)}`,
    selection.row.liquidityUsd != null
      ? `Pool liquidity: ${formatCompactUsd(selection.row.liquidityUsd)}`
      : null,
    minimumOrderLabel(selection.row),
    `Top leverage: ${leverage}`,
  ].filter((line): line is string => Boolean(line))
}

function marketInfoLabel(
  selection: Extract<MarketSelection, { kind: "market" }>
) {
  return `About ${selection.row.symbol} market, ${selection.protocolLabel}, ${selection.networkLabel}`
}

function MarketInfo({
  selection,
}: {
  selection: Extract<MarketSelection, { kind: "market" }>
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={marketInfoLabel(selection)}
          className="h-full rounded-l-none"
        >
          <InfoIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="grid gap-1">
        {marketInfoLines(selection).map((line) => (
          <span key={line}>{line}</span>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The same facts as a line in the phone's market menu.
 *
 * A tooltip needs a pointer to hover, which a phone has not got, so the facts
 * open in a panel of their own instead.
 */
export function MarketInfoRow({
  selection,
}: {
  selection: Extract<MarketSelection, { kind: "market" }>
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <PhoneMenuRow icon={<InfoIcon />} label="Contract info" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        aria-label={marketInfoLabel(selection)}
        className="grid w-[calc(100vw-2rem)] max-w-80 gap-1"
      >
        {marketInfoLines(selection).map((line) => (
          <span key={line}>{line}</span>
        ))}
      </PopoverContent>
    </Popover>
  )
}
