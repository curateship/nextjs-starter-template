import * as React from "react"
import { CandlestickChartIcon, ListIcon, WalletIcon } from "lucide-react"

import { MarketIcon } from "@/components/trade/market-icon"
import { MarketPicker } from "@/components/trade/market-picker"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { Button } from "@/components/ui/button"
import { parseMarketKey, type MarketRow } from "@/lib/protocols/contracts"

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
    }
  | { kind: "volume-hidden"; marketId: string }
  | { kind: "missing"; marketId: string }

/**
 * One row: the chosen market opens the full market picker, its leverage sits
 * beside it, and the chart's own controls stay on the right.
 */
export function MarketHeader({
  selection,
  markets,
  favorites,
  onToggleFavorite,
  onSelectMarket,
  toolbar,
  onOpenMarkets,
  onOpenAccount,
}: {
  selection: MarketSelection
  markets: MarketRow[]
  favorites: ReadonlySet<string>
  onToggleFavorite: (key: string) => void
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
            onClick={onOpenAccount}
          >
            <WalletIcon className="size-4" />
          </Button>
        ) : null}
      </>
    ) : null

  const action =
    toolbar || sheetButtons ? (
      <div className="flex items-center gap-0.5 sm:gap-2">
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
    <WorkspacePanelHeader
      // The market's own art, not a generic chart glyph — the row carries the
      // URL, so this header still has no idea which exchange it came from.
      icon={
        <MarketIcon
          symbol={selection.row.symbol}
          iconUrl={selection.row.iconUrl}
        />
      }
      title={
        <MarketPicker
          rows={markets}
          selected={selection.row}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          onSelect={onSelectMarket}
        />
      }
      meta={
        <span className="flex items-center gap-2">
          {selection.row.maxLeverage !== null ? (
            <span>{selection.row.maxLeverage}x</span>
          ) : null}
          {/* Always on screen for a practice-network market, never behind the
              hover — a pretend dollar must not be readable as a real one. */}
          {parseMarketKey(selection.row.key)?.network === "testnet" ? (
            <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              Testnet
            </span>
          ) : null}
        </span>
      }
      action={action}
    />
  )
}
