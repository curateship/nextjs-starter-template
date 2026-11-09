import * as React from "react"

import { WidgetCard } from "@/components/shared/widgets/widget-card"
import { WidgetGrid } from "@/components/shared/widgets/widget-grid"
import { WidgetMenu } from "@/components/shared/widgets/widget-menus"
import { RunningBotsWidget } from "@/components/trade/running-bots-widget"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { loadBotsOverviewPage } from "@/lib/api/trade/bots"
import { BOTS_WIDGET_OFFER, findBotsWidget } from "@/lib/bots/bots-widgets"
import type { TradingOverviewBot } from "@/lib/trade/dashboard/overview"

/** The same fifteen seconds the Trade Overview reads at. */
const REFRESH_MS = 15_000

/**
 * The Bots dashboard's Overview (Tyler, 9 Nov 2026: "Overview first"): its
 * widgets in the shell's rows, straight on the dashboard beside the left
 * page, each in the shell's widget card with its ⋮. Running bots is the one
 * widget to start, and a row opens that bot here. The figures are read again
 * every fifteen seconds while the browser tab shows; a failed read keeps the
 * last answer on screen.
 */
export function BotsOverview({
  bots: first,
  layout,
  onChange,
  onOpenBot,
  onOpenRecipes,
}: {
  bots: TradingOverviewBot[]
  layout: WidgetLayout
  onChange: (layout: WidgetLayout) => void
  onOpenBot: (runId: string) => void
  onOpenRecipes: () => void
}) {
  const [bots, setBots] = React.useState(first)
  React.useEffect(() => {
    let stopped = false
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return
      loadBotsOverviewPage()
        .then((read) => {
          if (!stopped) setBots(read.bots)
        })
        .catch(() => undefined)
    }, REFRESH_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [])

  return (
    <WidgetGrid
      offer={BOTS_WIDGET_OFFER}
      layout={layout}
      onChange={onChange}
      drawWidget={(id, menu) => {
        const widget = findBotsWidget(id)
        if (!widget) return null
        const Icon = widget.icon
        return (
          <WidgetCard
            title={widget.label}
            icon={<Icon />}
            count={bots.length}
            menu={<WidgetMenu title={widget.label} {...menu} />}
          >
            <RunningBotsWidget
              bare
              bots={bots}
              className="h-full min-h-0 flex-1"
              onOpen={(bot) => onOpenBot(bot.runId)}
              onOpenRecipes={onOpenRecipes}
            />
          </WidgetCard>
        )
      }}
    />
  )
}
