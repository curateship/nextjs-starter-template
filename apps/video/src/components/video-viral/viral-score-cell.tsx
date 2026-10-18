import * as React from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import type { ViralScore } from "@/lib/video/viral-score"
import { ViralScoreParts } from "@/components/video-viral/viral-score-parts"

/**
 * The Score column: the score out of 100, how sure it is beside it, and each
 * part's points on hover, keyboard focus or a tap (a phone has no hover).
 * The trigger is a button so the row's click, which plays the video, leaves
 * it alone.
 */
export function ViralScoreCell({ score }: { score: ViralScore }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen((shown) => !shown)}
          aria-label={`Score ${score.score} out of 100, sure: ${score.confidence}. Show how it adds up`}
          className={cn(
            "flex items-baseline gap-1.5 rounded-sm text-left whitespace-nowrap",
            focusRing
          )}
        >
          <span className="font-medium tabular-nums">{score.score}</span>
          <span className="text-xs text-muted-foreground">
            sure: {score.confidence}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="grid gap-1.5 p-3">
        <ViralScoreParts score={score} />
      </TooltipContent>
    </Tooltip>
  )
}
