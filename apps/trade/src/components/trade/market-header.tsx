import * as React from "react"
import { CandlestickChartIcon, InfoIcon, ListIcon, WalletIcon } from "lucide-react"

import { MarketIcon } from "@/components/trade/market-icon"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { MarketRow } from "@/lib/protocols/contracts"
import {
  formatChange,
  formatCompactUsd,
  formatFunding,
  formatPrice,
} from "@/lib/trade/format"

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
 * One row: the market's name, its figures folded behind an info icon, and the
 * chart's own controls on the right. The figures used to be a second row and
 * the exchange a pair of chips; both are details you look up, not things to
 * spend header height on — the tooltip holds them, and the search box already
 * names the exchange.
 */
export function MarketHeader({
  selection,
  toolbar,
  onOpenMarkets,
  onOpenAccount,
}: {
  selection: MarketSelection
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
      title={selection.row.symbol}
      meta={<MarketInfo selection={selection} />}
      action={action}
    />
  )
}

/**
 * The market's figures, behind an info icon — click or hover. The exchange
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

  const figures: Array<[string, string]> = [
    ["Price", formatPrice(row.price)],
    ...(row.change24h !== null
      ? ([["24h", formatChange(row.change24h)]] as Array<[string, string]>)
      : []),
    ["24h volume", formatCompactUsd(row.volume24hUsd)],
    ...(row.fundingHourly !== null
      ? ([["Funding", formatFunding(row.fundingHourly)]] as Array<
          [string, string]
        >)
      : []),
    ...(row.openInterestUsd !== null
      ? ([["Open interest", formatCompactUsd(row.openInterestUsd)]] as Array<
          [string, string]
        >)
      : []),
    ["Exchange", `${protocolLabel} · ${networkLabel}`],
  ]

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`About ${row.symbol}`}
          onClick={() => setOpen((shown) => !shown)}
          className="flex items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="flex-col items-stretch gap-1 py-2">
        {figures.map(([label, value]) => (
          <span key={label} className="flex items-baseline justify-between gap-6">
            <span className="opacity-70">{label}</span>
            <span className="tabular-nums">{value}</span>
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}
