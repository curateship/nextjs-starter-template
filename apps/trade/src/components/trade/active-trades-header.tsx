import * as React from "react"
import { CandlestickChartIcon, Loader2Icon } from "lucide-react"

import { ActiveTradesPanelBody } from "@/components/trade/active-trades-panel"
import {
  useActiveTrades,
  useHiddenTradeColumns,
} from "@/components/trade/use-active-trades"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { AppHeaderActionProps } from "@/lib/app-options"
import { useHiddenPnlClass } from "@/lib/trade/hide-pnl"
import { moneyTone } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

function ActiveTradesHeaderContent() {
  // One read shared with the bottom bar's Positions panel under 1280px.
  const { snapshot, figures, failed } = useActiveTrades()
  // Read when the header loads, not when the panel first opens, so the
  // columns somebody hid are already hidden the first time it opens.
  useHiddenTradeColumns()
  const hiddenPnl = useHiddenPnlClass()
  // Click to open, click or Escape to close. It used to open on hover and shut
  // itself on a timer a fifth of a second after the pointer left, which meant
  // crossing the header on the way somewhere else threw a panel of trades over
  // the page. Tyler, 4 October 2026.
  const [open, setOpen] = React.useState(false)

  const label = figures
    ? `Active trades, ${figures.value} in trades, ${figures.profit} profit and loss`
    : failed
      ? "Active trades could not be read"
      : "Reading active trades"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-icon="inline-start"
          data-nav-shape="text"
          data-active-trades-header-trigger
          aria-label={label}
        >
          {snapshot ? (
            <CandlestickChartIcon className="size-3.5" />
          ) : (
            <Loader2Icon className="size-3.5 animate-spin" />
          )}
          <span className="font-mono text-xs tabular-nums">
            {figures?.value ?? "—"}
          </span>
          <span
            className={cn(
              "font-mono text-xs font-medium tabular-nums",
              figures ? moneyTone(figures.profitValue) : "text-muted-foreground",
              hiddenPnl
            )}
          >
            {figures?.profit ?? "—"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        // As wide as the table showing needs, never wider than the window
        // (Tyler, 13 Nov 2026: "make the width of the trades dropdown auto
        // adjust"). It grows and shrinks as columns are hidden or the tab
        // changes. The floor keeps the tabs, Filter and ⋮ on one line when
        // the table is narrow or empty.
        className="flex max-h-[var(--radix-popover-content-available-height)] w-max max-w-[calc(100vw-1rem)] min-w-[min(24rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <ActiveTradesPanelBody onTradeOpen={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

export default function ActiveTradesHeader(_props: AppHeaderActionProps) {
  return <ActiveTradesHeaderContent />
}
