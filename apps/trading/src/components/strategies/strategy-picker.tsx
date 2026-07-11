import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import type { StrategyListItem } from "@/lib/api/strategies"
import {
  strategySummary,
  strategyTypeLabel,
  strategyTypeOf,
} from "@/lib/strategies/strategy-config"
import { cn } from "@/lib/utils"

/**
 * Saved-strategy card list shared by the New Bot and New Run dialogs: one
 * card per strategy with its indicator, timeframe, and settings one-liner.
 * `strategies` is null while loading.
 */
export function StrategyPicker({
  strategies,
  selectedId,
  onSelect,
  hideLabel = false,
}: {
  strategies: StrategyListItem[] | null
  selectedId: string | null
  onSelect: (id: string) => void
  /** Hide the built-in "Strategy" label when a surrounding card titles it. */
  hideLabel?: boolean
}) {
  return (
    <div className="grid gap-2">
      {hideLabel ? null : <Label>Strategy</Label>}
      {strategies === null ? (
        <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          Loading strategies…
        </div>
      ) : strategies.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          No saved strategies yet. Create one on the Strategies page first — a
          strategy is an indicator plus one settings block.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {strategies.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "rounded-md border p-3 text-left text-sm hover:bg-muted/50",
                selectedId === item.id && "border-primary bg-muted"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{item.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {strategyTypeLabel(strategyTypeOf(item.config))}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {item.config.interval}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {strategySummary(item.config)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
