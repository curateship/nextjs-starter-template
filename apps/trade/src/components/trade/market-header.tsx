import * as React from "react"
import {
  CandlestickChartIcon,
  ListIcon,
  StarIcon,
  WalletIcon,
} from "lucide-react"

import { MarketIcon } from "@/components/trade/market-icon"
import { MarketPicker } from "@/components/trade/market-picker"
import { TradeBadge } from "@/components/trade/trade-badge"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { parseMarketKey, type MarketRow } from "@/lib/protocols/contracts"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

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
 * One row: the chosen market opens the full market picker, its star and its
 * leverage sit beside it, and the chart's own controls stay on the right.
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
      /* The star comes first, before the market's own art, and the header's
         leading slot cannot hold it: that slot is hidden from screen readers,
         which is right for a decorative glyph and wrong for a button. So the
         slot is folded away and the title carries all three — star, art, then
         name — in that order. */
      className="[&>span:first-child]:hidden"
      icon={null}
      title={
        <span className="flex min-w-0 items-center gap-0.5">
          <FavoriteStar
            symbol={selection.row.symbol}
            favorite={favorites.has(selection.row.key)}
            onToggle={() => onToggleFavorite(selection.row.key)}
          />
          {/* The star and the name both give way to nothing: the star keeps
              its size, and the name is what truncates as the panel narrows.
              On a phone the timeframe row leaves the name no width at all,
              and anything behind the name would never be on screen. */}
          <span className="flex min-w-0 items-center gap-2.5">
            {/* The market's own art, not a generic chart glyph — the row
                carries the URL, so this header still has no idea which
                exchange it came from. */}
            <MarketIcon
              symbol={selection.row.symbol}
              iconUrl={selection.row.iconUrl}
            />
            <span className="min-w-0">
              <MarketPicker
                rows={markets}
                selected={selection.row}
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
                onSelect={onSelectMarket}
              />
            </span>
          </span>
        </span>
      }
      meta={
        <span className="flex items-center gap-2">
          {selection.row.maxLeverage !== null ? (
            <span>{selection.row.maxLeverage}×</span>
          ) : null}
          {/* Always on screen for a practice-network market, never behind the
              hover — a pretend dollar must not be readable as a real one. */}
          {parseMarketKey(selection.row.key)?.network === "testnet" ? (
            <TradeBadge tone="testnet">Testnet</TradeBadge>
          ) : null}
        </span>
      }
      action={action}
    />
  )
}

/**
 * The star for the market on screen, at the head of the header row.
 *
 * An empty Fav tab says to press "the star beside its name", so there has to
 * be one. The picker's per-row stars are the other way in — behind a popover
 * and a search, and no use for the market you are already looking at.
 *
 * Filled amber when the market is starred, a hollow outline when it is not, so
 * the state is not carried by colour alone.
 *
 * Its focus mark is drawn inside the button rather than around it. The
 * header's title box hides what overflows it — that is what truncates a long
 * symbol — and a ring painted outside a child of that box is cut off, which
 * would leave the keyboard with no mark at all.
 */
function FavoriteStar({
  symbol,
  favorite,
  onToggle,
}: {
  symbol: string
  favorite: boolean
  onToggle: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={
            favorite ? `Remove ${symbol} from Fav` : `Add ${symbol} to Fav`
          }
          aria-pressed={favorite}
          onClick={onToggle}
          className={cn(
            // `Button` carries `outline-none`, which sets the outline *style*
            // to none for the whole element — the inset ring is then a 2px
            // outline of no style, that is, nothing. `outline-solid` gives it
            // back. Its own ring is turned off so only one mark is drawn.
            "text-muted-foreground hover:text-amber-500 focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-solid",
            focusRingInset,
            favorite && "text-amber-500 dark:text-amber-400"
          )}
        >
          <StarIcon className={cn("size-4", favorite && "fill-current")} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {favorite ? "Remove from Fav" : "Add to Fav"}
      </TooltipContent>
    </Tooltip>
  )
}
