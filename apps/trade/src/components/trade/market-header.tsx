import * as React from "react"
import {
  CandlestickChartIcon,
  ListIcon,
  StarIcon,
  WalletIcon,
} from "lucide-react"

import { MarketIcon } from "@/components/trade/market-icon"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { parseMarketKey, type MarketRow } from "@/lib/protocols/contracts"
import {
  formatChange,
  formatCompactUsd,
  formatFunding,
  formatPrice,
} from "@/lib/trade/format"
import { useLiveFigures } from "@/lib/trade/live-market"
import { cn } from "@/lib/utils"

/**
 * What the middle panel is showing.
 *
 * Three honest states and no fourth: nothing picked yet, a real market, or a
 * saved market the exchange no longer lists — which says so plainly. It never
 * quietly swaps in a different market; a link that pointed at something
 * delisted should read as exactly that.
 */
export type MarketSelection =
  | { kind: "none" }
  | {
      kind: "market"
      row: MarketRow
      protocolLabel: string
      networkLabel: string
    }
  | { kind: "missing"; marketId: string }

/**
 * One row: the market's name with its figures folded behind it, the star
 * that puts it in Fav, and the chart's own controls on the right. The figures
 * used to be a second row and the exchange a pair of chips; both are details
 * you look up, not things to spend header height on — the tooltip holds them,
 * and the search box already names the exchange.
 *
 * The star lives here rather than on every row of the list: you star the market
 * you are looking at, and one always-visible star beats hundreds that only
 * appear under the pointer.
 */
export function MarketHeader({
  selection,
  favorite,
  onToggleFavorite,
  toolbar,
  onOpenMarkets,
  onOpenAccount,
}: {
  selection: MarketSelection
  /** Whether the picked market is starred. Ignored without one. */
  favorite: boolean
  onToggleFavorite: () => void
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
        meta="Choose one from the Markets list to chart it."
        action={action}
      />
    )
  }

  if (selection.kind === "missing") {
    return (
      <WorkspacePanelHeader
        icon={<CandlestickChartIcon className="size-4" />}
        title={selection.marketId}
        meta="This market is not available on the connected exchange right now."
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
      // The ticker itself carries the figures. It used to be an "i" beside it,
      // which was a second thing to aim at for something the name was already
      // the obvious place to ask about.
      title={<MarketInfo selection={selection} />}
      meta={
        <span className="flex items-center gap-2">
          <FavoriteStar
            symbol={selection.row.symbol}
            favorite={favorite}
            onToggle={onToggleFavorite}
          />
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

/**
 * The star that puts this market in the list's Fav tab. Filled amber when it is
 * in; a hollow outline when it is not, so the state reads without colour alone.
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
        <button
          type="button"
          aria-label={favorite ? `Unstar ${symbol}` : `Star ${symbol}`}
          aria-pressed={favorite}
          onClick={onToggle}
          className={cn(
            "flex items-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            favorite
              ? "text-amber-500"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <StarIcon
            className="size-3.5"
            fill={favorite ? "currentColor" : "none"}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {favorite ? "Remove from Fav" : "Keep in Fav"}
      </TooltipContent>
    </Tooltip>
  )
}

/** The coin's own name, without a venue prefix — sizes are in coins. */
function bareSymbol(symbol: string): string {
  return symbol.includes(":")
    ? symbol.slice(symbol.indexOf(":") + 1)
    : symbol
}

/**
 * The market's figures, behind the ticker itself — click or hover. The exchange
 * and network live in here too now that their chips are gone, so the answer
 * to "which BTC is this?" is one hover away, not gone.
 */
function MarketInfo({
  selection,
}: {
  selection: Extract<MarketSelection, { kind: "market" }>
}) {
  const [open, setOpen] = React.useState(false)
  const { row, protocolLabel, networkLabel } = selection

  // The tooltip reads the live feed over the loaded snapshot, so hovering a
  // minute after opening the page still tells the truth.
  const live = useLiveFigures(row.key)
  const price = live?.price ?? row.price
  const change24h = live?.change24h ?? row.change24h
  const volume24hUsd = live?.volume24hUsd ?? row.volume24hUsd
  const fundingHourly = live?.fundingHourly ?? row.fundingHourly
  const openInterestUsd = live?.openInterestUsd ?? row.openInterestUsd

  const figures: Array<[string, string]> = [
    ["Price", formatPrice(price)],
    ...(change24h !== null
      ? ([["24h", formatChange(change24h)]] as Array<[string, string]>)
      : []),
    ["24h volume", formatCompactUsd(volume24hUsd)],
    ...(fundingHourly !== null
      ? ([["Funding", formatFunding(fundingHourly)]] as Array<
          [string, string]
        >)
      : []),
    ...(openInterestUsd !== null
      ? ([["Open interest", formatCompactUsd(openInterestUsd)]] as Array<
          [string, string]
        >)
      : []),
    ["Exchange", `${protocolLabel} · ${networkLabel}`],
    // Which of the exchange's venues this market trades on — the label that
    // says which "BTC" this is once sub-exchanges are in the list.
    ...(row.subExchange !== null
      ? ([["Sub-exchange", row.subExchange]] as Array<[string, string]>)
      : []),
    // The market's ground rules — the same numbers the order form will
    // enforce, surfaced where "why was my order refused?" gets asked. A rule
    // the exchange does not state shows nothing rather than a guess.
    ...(row.sizeDecimals !== null
      ? ([
          [
            "Smallest size",
            `${(10 ** -row.sizeDecimals).toFixed(row.sizeDecimals)} ${bareSymbol(row.symbol)}`,
          ],
        ] as Array<[string, string]>)
      : []),
    ...(row.maxLeverage !== null
      ? ([["Max leverage", `${row.maxLeverage}×`]] as Array<[string, string]>)
      : []),
    ...(row.isolatedOnly
      ? ([
          ["Margin", "Isolated only — a trade's stake is all it can lose"],
        ] as Array<[string, string]>)
      : []),
  ]

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen((shown) => !shown)}
          // Inherits the heading's own type — this is the title, not a control
          // sitting in it. The underline on hover is what says there is
          // something behind it.
          className="max-w-full truncate rounded-sm text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {row.symbol}
        </button>
      </TooltipTrigger>
      <TooltipContent className="flex-col items-stretch gap-1 py-2">
        {figures.map(([label, value]) => (
          <span key={label} className="flex items-baseline justify-between gap-6">
            <span className="opacity-70">{label}</span>
            {/* Right-aligned so the one long value — the isolated-only
                explainer — wraps tidily under itself. */}
            <span className="text-right tabular-nums">{value}</span>
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}
