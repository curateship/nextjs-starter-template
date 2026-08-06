import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CandlestickChartIcon,
  ListIcon,
  WalletIcon,
} from "lucide-react"

import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { MarketRow } from "@/lib/protocols/contracts"
import {
  formatChange,
  formatCompactUsd,
  formatFunding,
  formatPrice,
} from "@/lib/trade/format"
import { cn } from "@/lib/utils"

/**
 * What the middle panel is showing.
 *
 * Three honest states and no fourth: nothing picked yet, a real market with
 * its live figures, or a saved market the exchange no longer lists — which
 * says so plainly. It never quietly swaps in a different market; a link that
 * pointed at something delisted should read as exactly that.
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
 * Which market you are looking at, and what it is doing — attached to the
 * chart it describes rather than floating in a bar over the whole page, so
 * the market's figures and the account's can never be read as each other's.
 */
export function MarketHeader({
  selection,
  onOpenMarkets,
  onOpenAccount,
}: {
  selection: MarketSelection
  /**
   * Narrow screens only. The side panels are not on screen there, so the
   * header is what opens them; passing neither leaves the buttons off.
   */
  onOpenMarkets?: () => void
  onOpenAccount?: () => void
}) {
  const sheetButtons =
    onOpenMarkets || onOpenAccount ? (
      <div className="flex items-center gap-2">
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
      </div>
    ) : undefined

  if (selection.kind === "none") {
    return (
      <WorkspacePanelHeader
        icon={<CandlestickChartIcon className="size-4" />}
        title="Pick a market"
        meta="Choose one from the Markets list to chart it."
        action={sheetButtons}
      />
    )
  }

  if (selection.kind === "missing") {
    return (
      <WorkspacePanelHeader
        icon={<CandlestickChartIcon className="size-4" />}
        title={selection.marketId}
        meta="This market is not available on the connected exchange right now."
        action={sheetButtons}
      />
    )
  }

  const { row, protocolLabel, networkLabel } = selection
  const figures: Array<{ label: string; value: string; tone?: "up" | "down" }> =
    [
      { label: "Price", value: formatPrice(row.price) },
      ...(row.change24h !== null
        ? [
            {
              label: "24h",
              value: formatChange(row.change24h),
              tone: (row.change24h >= 0 ? "up" : "down") as "up" | "down",
            },
          ]
        : []),
      { label: "24h volume", value: formatCompactUsd(row.volume24hUsd) },
      ...(row.fundingHourly !== null
        ? [{ label: "Funding", value: formatFunding(row.fundingHourly) }]
        : []),
      ...(row.openInterestUsd !== null
        ? [
            {
              label: "Open interest",
              value: formatCompactUsd(row.openInterestUsd),
            },
          ]
        : []),
    ]

  return (
    <div className="shrink-0">
      <WorkspacePanelHeader
        icon={<CandlestickChartIcon className="size-4" />}
        title={row.symbol}
        meta={
          <span className="flex items-center gap-1.5">
            <Badge variant="outline">{protocolLabel}</Badge>
            <Badge variant="outline">{networkLabel}</Badge>
          </span>
        }
        action={sheetButtons}
      />
      {/* Scrolls sideways rather than truncating: a figure that is half there
          is worse than one you have to reach for, and this row is the only
          place these numbers appear. */}
      <div className="flex items-center gap-6 overflow-x-auto border-b border-foreground/10 px-4 py-2 sm:px-5">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="flex shrink-0 items-center gap-1.5"
          >
            <span className="text-xs text-muted-foreground">
              {figure.label}
            </span>
            <span
              className={cn(
                "flex items-center gap-0.5 text-sm font-medium tabular-nums",
                figure.tone === "up" &&
                  "text-emerald-600 dark:text-emerald-400",
                figure.tone === "down" && "text-destructive"
              )}
            >
              {figure.tone === "up" ? (
                <ArrowUpRightIcon className="size-3.5" aria-hidden />
              ) : null}
              {figure.tone === "down" ? (
                <ArrowDownRightIcon className="size-3.5" aria-hidden />
              ) : null}
              {figure.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
