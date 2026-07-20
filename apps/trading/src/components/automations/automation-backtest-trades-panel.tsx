import { ChevronsDownIcon } from "lucide-react"

import { BacktestTradesTable } from "@/components/backtest/backtest-trades-table"
import { Button } from "@/components/ui/button"
import { BOTTOM_PANEL_HEADER } from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { STICKY_SCROLL_OVERRIDES } from "@/components/ui/table"
import type { BacktestResult, BacktestTrade } from "@/lib/backtest/types"
import { cn } from "@/lib/utils"

import { AutomationPanelToggles } from "./automation-panel-toggles"

/**
 * The editor's bottom panel while a backtest market is selected: that run's
 * trades, in the activity log's slot and header anatomy. Clicking a row
 * focuses the chart on the trade.
 */
export function AutomationBacktestTradesPanel({
  market,
  result,
  markPrice,
  focusedTradeN,
  onSelectTrade,
  onCollapse,
  showPanelToggles = false,
  paletteCollapsed = false,
  inspectorCollapsed = false,
  onTogglePalette,
  onToggleInspector,
}: {
  market: string
  result: BacktestResult
  markPrice: number
  focusedTradeN: number | null
  onSelectTrade: (trade: BacktestTrade | null) => void
  onCollapse: () => void
  showPanelToggles?: boolean
  paletteCollapsed?: boolean
  inspectorCollapsed?: boolean
  onTogglePalette: () => void
  onToggleInspector: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className={BOTTOM_PANEL_HEADER}>
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          Trades — {market}
        </h2>
        <span className="text-xs text-muted-foreground">
          {result.trades.length} closed
        </span>
        <div className="ml-auto flex items-center gap-1">
          {showPanelToggles ? (
            <AutomationPanelToggles
              paletteCollapsed={paletteCollapsed}
              inspectorCollapsed={inspectorCollapsed}
              onTogglePalette={onTogglePalette}
              onToggleInspector={onToggleInspector}
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Collapse trades panel"
            onClick={onCollapse}
          >
            <ChevronsDownIcon className="size-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className={cn("min-h-0 flex-1", STICKY_SCROLL_OVERRIDES)}>
        <BacktestTradesTable
          result={result}
          markPrice={markPrice}
          selectedTradeN={focusedTradeN}
          onSelectTrade={onSelectTrade}
        />
      </ScrollArea>
    </div>
  )
}
