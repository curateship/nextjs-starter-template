import * as React from "react"
import {
  CandlestickChartIcon,
  InfoIcon,
  ListIcon,
  WalletIcon,
} from "lucide-react"

import { MarketPicker } from "@/components/trade/market-picker"
import { MarketFolderStar } from "@/components/trade/market-folder-star"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
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
import { minimumOrderLabel } from "@/lib/trade/market-info"

/**
 * What the middle panel is showing.
 *
 * Four honest states: nothing picked, a real market, a market hidden by the
 * account's volume setting, or a market the exchange no longer lists. It never
 * quietly swaps in another market, and it never blames an account setting on
 * the exchange.
 */
export type MarketSelection =
  | { kind: "none" }
  | {
      kind: "market"
      row: MarketRow
      protocolLabel: string
      networkLabel: string
      picker: MarketPickerCapabilities
    }
  | { kind: "volume-hidden"; marketId: string }
  | { kind: "missing"; marketId: string }

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
  onOpenMarkets,
  onOpenAccount,
}: {
  selection: MarketSelection
  markets: MarketRow[]
  folders: readonly MarketFolder[]
  folderActions: MarketFolderActions
  onSelectMarket: (key: string) => void
  /** The chart's controls — the interval picker — shown only with a market. */
  toolbar?: React.ReactNode
  /**
   * Narrow screens only. The side panels are not on screen there, so the
   * header is what opens them; passing neither leaves the buttons off.
   */
  onOpenMarkets?: () => void
  onOpenAccount?: () => void
}) {
  const sheetButtons =
    onOpenMarkets || onOpenAccount ? (
      <>
        {onOpenMarkets ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Show markets"
            title="Show markets"
            className="bg-muted/60 dark:bg-muted/60"
            onClick={onOpenMarkets}
          >
            <ListIcon className="size-4" />
          </Button>
        ) : null}
        {onOpenAccount ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Show account"
            title="Show account"
            className="bg-muted/60 dark:bg-muted/60"
            onClick={onOpenAccount}
          >
            <WalletIcon className="size-4" />
          </Button>
        ) : null}
      </>
    ) : null

  const action =
    toolbar || sheetButtons ? (
      <div className="flex items-center gap-2">
        {toolbar}
        {sheetButtons}
      </div>
    ) : undefined

  if (selection.kind === "none") {
    return (
      <WorkspacePanelHeader
        icon={<CandlestickChartIcon className="size-4" />}
        title="Pick a market"
        meta="Choose one from the market list to chart it."
        action={action}
      />
    )
  }

  if (selection.kind === "missing") {
    return (
      <WorkspacePanelHeader
        icon={<CandlestickChartIcon className="size-4" />}
        title={selection.marketId}
        meta="The exchange is not listing this market right now."
        action={action}
      />
    )
  }

  if (selection.kind === "volume-hidden") {
    return (
      <WorkspacePanelHeader
        icon={<CandlestickChartIcon className="size-4" />}
        title={selection.marketId}
        meta="Hidden by your daily volume setting."
        action={action}
      />
    )
  }

  return (
    <div
      data-slot="workspace-panel-header"
      // px-3, not the px-4/px-5 the title headers use: every control in this
      // row is a 28px pill in a 50.4px row, ~11px of air above it, and Tyler
      // asked for the side gaps to read even with that (23 Aug 2026). 12px is
      // also what the tab headers keep beside their first pill.
      className="flex h-[3.15rem] shrink-0 items-center gap-2 border-b px-3"
    >
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
      <div className="flex h-7 min-w-0 items-center rounded-lg border bg-muted/60">
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
    </div>
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
        {minimumOrderLabel(selection.row) ? (
          <span>{minimumOrderLabel(selection.row)}</span>
        ) : null}
        <span>Top leverage: {leverage}</span>
      </TooltipContent>
    </Tooltip>
  )
}
