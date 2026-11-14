import { AlertTriangleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * The browser program not running, as a small amber warning in the header:
 * the triangle and how many jobs wait, the whole sentence on hover, and the
 * Jobs window on a press.
 */
export function StalledJobs({ queued, onOpen }: { queued: number; onOpen: (() => void) | null }) {
  const words = `The browser program is not running, so ${queued} ${queued === 1 ? "job is" : "jobs are"} waiting and nothing is searched.${onOpen ? " Press to see the jobs." : ""}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={words}
          aria-disabled={onOpen ? undefined : true}
          className="shrink-0 gap-1 px-2 text-amber-700 hover:text-amber-800 dark:text-amber-400"
          onClick={onOpen ?? undefined}
        >
          <AlertTriangleIcon className="size-4" aria-hidden />
          <span className="tabular-nums">{queued}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{words}</TooltipContent>
    </Tooltip>
  )
}
