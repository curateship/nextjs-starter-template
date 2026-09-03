import * as React from "react"
import { BotIcon, InfoIcon, ListIcon } from "lucide-react"

import { MarketPicker } from "@/components/trade/market-picker"
import { MarketFolderStar } from "@/components/trade/market-folder-star"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  toolbar,
  note,
  onOpenMarkets,
  onOpenSmartOrders,
}: {
  selection: MarketSelection
  markets: MarketRow[]
  folders: readonly MarketFolder[]
  folderActions: MarketFolderActions
  onSelectMarket: (key: string) => void
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
}) {
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
    <DashboardCardHeader>
      <MarketFolderStar
        symbol={selection.row.symbol}
        marketKey={selection.row.key}
        folders={folders}
        busy={folderActions.busy}
        onQuickAdd={() => folderActions.quickAdd(selection.row.key)}
        onToggle={(folderId, saved) =>
          folderActions.toggle(selection.row.key, folderId, saved)
        }
        onCreate={(name) => folderActions.create(selection.row.key, name)}
      />
      <div className="flex h-8 min-w-0 items-center rounded-lg border bg-muted/60">
        <MarketPicker
          key={parseMarketKey(selection.row.key)?.protocol}
          rows={markets}
          selected={selection.row}
          capabilities={selection.picker}
          folders={folders}
          folderActions={folderActions}
          onSelect={onSelectMarket}
        />
        <span className="flex h-full shrink-0 items-center border-l">
          <MarketInfo selection={selection} />
        </span>
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </DashboardCardHeader>
  )
}

function MarketInfo({
  selection,
}: {
  selection: Extract<MarketSelection, { kind: "market" }>
}) {
  const leverage =
    selection.row.maxLeverage === null
      ? "Not stated publicly"
      : `${selection.row.maxLeverage}×`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`About ${selection.row.symbol} market, ${selection.protocolLabel}, ${selection.networkLabel}`}
          className="h-full rounded-l-none"
        >
          <InfoIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="grid gap-1">
        <span>{selection.protocolLabel}</span>
        <span>{selection.networkLabel}</span>
        <span>
          Price tick: {selection.row.priceTick ?? "Exchange rounding rule"}
        </span>
        <span>List price: mark price</span>
        <span>Chart bars: traded prices</span>
        <span>
          Daily volume: {formatCompactUsd(selection.row.volume24hUsd)}
        </span>
        {minimumOrderLabel(selection.row) ? (
          <span>{minimumOrderLabel(selection.row)}</span>
        ) : null}
        <span>Top leverage: {leverage}</span>
      </TooltipContent>
    </Tooltip>
  )
}
