import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CandlestickChartIcon,
  ListIcon,
  WalletIcon,
} from "lucide-react"

import { SampleValue } from "@/components/shared/sample-figure"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { SampleMarket } from "@/lib/trade/sample-market"

/**
 * Which market you are looking at, and what it is doing.
 *
 * This lives in the middle panel rather than in a bar across the whole page.
 * The old app put it up top, which meant the market's figures and the account's
 * figures sat side by side in one strip and could be read as each other's. Here
 * the market's identity is attached to the thing it describes — the chart
 * underneath it — and the account keeps its own panel.
 *
 * The exchange and network are always on show for the same reason: once there
 * is more than one of either, a market name alone does not say which market.
 */
export function MarketHeader({
  market,
  onOpenMarkets,
  onOpenAccount,
}: {
  market: SampleMarket
  /**
   * Narrow screens only. The side panels are not on screen there, so the
   * header is what opens them; passing neither leaves the buttons off.
   */
  onOpenMarkets?: () => void
  onOpenAccount?: () => void
}) {
  return (
    <div className="shrink-0">
      <WorkspacePanelHeader
        icon={<CandlestickChartIcon className="size-4" />}
        title={market.symbol}
        meta={
          <span className="flex items-center gap-1.5">
            <Badge variant="outline">{market.protocol}</Badge>
            <Badge variant="outline">{market.network}</Badge>
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            {/* In words, because the dashed underline on each figure below is
                invisible to a screen reader and to anyone in greyscale. */}
            <Badge variant="secondary">Sample</Badge>
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
        }
      />
      {/* Scrolls sideways rather than truncating: a figure that is half there
          is worse than one you have to reach for, and this row is the only
          place these numbers appear. */}
      <div className="flex items-center gap-6 overflow-x-auto border-b border-foreground/10 px-4 py-2 sm:px-5">
        {market.figures.map((figure) => (
          <div key={figure.label} className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{figure.label}</span>
            {/* The arrow sits beside the figure rather than inside it. An
                inline-flex box inside `SampleValue` stops that component's
                dashed underline from painting at all, and that underline is
                half of how a stand-in figure says it is one. */}
            <span className="flex items-center gap-0.5 text-muted-foreground">
              {figure.direction === "up" ? (
                <ArrowUpRightIcon className="size-3.5" aria-hidden />
              ) : null}
              {figure.direction === "down" ? (
                <ArrowDownRightIcon className="size-3.5" aria-hidden />
              ) : null}
              <SampleValue className="text-sm font-medium tabular-nums">
                {figure.value}
              </SampleValue>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
