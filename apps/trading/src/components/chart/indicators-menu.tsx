import * as React from "react"

import { OverlaySettingsDialog } from "@/components/indicators/indicator-settings-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  indicatorDisplayName,
  type IndicatorConfig,
} from "@/lib/trading/indicators-config"

/**
 * The trade terminal's Indicators toggle menu: pinned indicators with enable
 * checkboxes, click a name for its settings dialog. (The backtest run chart
 * deliberately does NOT use this — its indicator set is fixed to what the
 * automation draws; see RunPaintMenu in backtest-run-chart.tsx.)
 */
export function IndicatorsMenu({
  indicators,
  onUpdate,
}: {
  indicators: IndicatorConfig[]
  onUpdate: (id: string, patch: Partial<IndicatorConfig>) => void
}) {
  const activeCount = indicators.filter((ind) => ind.enabled).length
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const editing = indicators.find((ind) => ind.id === editingId) ?? null

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
          >
            Indicators{activeCount ? ` (${activeCount})` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 gap-1 p-2">
          {indicators.length === 0 ? (
            <div className="px-1 py-1 text-xs text-muted-foreground">
              No pinned indicators — pin them on the{" "}
              <a href="/indicators" className="underline underline-offset-2">
                Indicators
              </a>{" "}
              page.
            </div>
          ) : null}
          {indicators.map((ind) => (
            <div
              key={ind.id}
              className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50"
            >
              <Checkbox
                id={`ind-${ind.id}`}
                checked={ind.enabled}
                onCheckedChange={(checked) =>
                  onUpdate(ind.id, { enabled: checked === true })
                }
              />
              <button
                type="button"
                className="flex-1 cursor-pointer text-left text-xs font-medium"
                title="Indicator settings"
                onClick={() => setEditingId(ind.id)}
              >
                {indicatorDisplayName(ind)}
              </button>
            </div>
          ))}
        </PopoverContent>
      </Popover>
      {editing ? (
        <OverlaySettingsDialog
          indicator={editing}
          open={editingId !== null}
          draggable
          onOpenChange={(open) => {
            if (!open) setEditingId(null)
          }}
          onSave={(next) => {
            // Local flip is instant; persistence is the same fire-and-forget
            // path the checkboxes use (failures surface via the caller).
            onUpdate(next.id, next)
            return Promise.resolve()
          }}
        />
      ) : null}
    </>
  )
}
