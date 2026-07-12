import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import type { StrategyTemplateListItem } from "@/lib/api/strategies"
import {
  strategySummary,
  strategyTypeLabel,
  strategyTypeOf,
} from "@/lib/strategies/strategy-config"
import { cn } from "@/lib/utils"

/**
 * Saved-template card list shared by the New Bot and New Run dialogs.
 * `templates` is null while loading.
 */
export function StrategyTemplatePicker({
  templates,
  selectedId,
  onSelect,
  hideLabel = false,
}: {
  templates: StrategyTemplateListItem[] | null
  selectedId: string | null
  onSelect: (id: string) => void
  /** Hide the built-in "Strategy" label when a surrounding card titles it. */
  hideLabel?: boolean
}) {
  return (
    <div className="grid gap-2">
      {hideLabel ? null : <Label>Template</Label>}
      {templates === null ? (
        <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          No saved templates yet. Create one from a strategy's settings.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {templates.map((item) => (
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
