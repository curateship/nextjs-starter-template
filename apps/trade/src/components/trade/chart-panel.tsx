import { CandlestickChartIcon } from "lucide-react"

import { PanelPlaceholder } from "@/components/trade/panel-placeholder"

/** The middle panel below the market header: where the price chart goes. */
export function ChartPanel() {
  return (
    <PanelPlaceholder
      icon={<CandlestickChartIcon className="size-4" />}
      title="The chart goes here"
    >
      Candles, intervals and drawing tools arrive once the market list does.
    </PanelPlaceholder>
  )
}
