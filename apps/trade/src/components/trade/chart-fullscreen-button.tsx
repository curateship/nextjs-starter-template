import { Maximize2Icon, Minimize2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function ChartFullscreenButton({
  active,
  onToggle,
}: {
  active: boolean
  onToggle: () => void
}) {
  const label = active ? "Exit full screen" : "Show chart full screen"
  const Icon = active ? Minimize2Icon : Maximize2Icon
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
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {active ? "Exit full screen, Esc" : "Show chart full screen, F"}
      </TooltipContent>
    </Tooltip>
  )
}
