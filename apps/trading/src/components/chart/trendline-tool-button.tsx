import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Toggles the one-shot trendline drawing tool. Shared by every chart that can
 * be drawn on (live, backtest, bot) so the control looks and behaves the same.
 */
export function TrendlineToolButton({
  active,
  onToggle,
}: {
  active: boolean
  onToggle: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon-sm"
          className="text-muted-foreground aria-pressed:text-foreground"
          aria-label="Trendline"
          aria-pressed={active}
          onClick={onToggle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <line
              x1="5"
              y1="18"
              x2="19"
              y2="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            />
            <circle cx="5" cy="18" r="1.75" fill="currentColor" />
            <circle cx="19" cy="6" r="1.75" fill="currentColor" />
          </svg>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Trendline</TooltipContent>
    </Tooltip>
  )
}
