import { FlipVertical2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Turn the chart upside down.
 *
 * The price scale is flipped, so the highest price sits at the bottom and a
 * fall looks like a rise. It is how a short trade reads: the shape you are
 * hoping for is the one going up. Nothing about the market or the orders
 * changes, only which way the picture points.
 */
export function ChartInvertButton({
  active,
  onToggle,
}: {
  active: boolean
  onToggle: () => void
}) {
  const label = active ? "Turn the chart back up" : "Turn the chart upside down"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          className="bg-muted/60 dark:bg-muted/60"
          onClick={onToggle}
        >
          <FlipVertical2Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
