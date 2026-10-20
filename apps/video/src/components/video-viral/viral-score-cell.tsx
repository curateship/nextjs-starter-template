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
 * The Score column as Tyler drew it on 20 Oct 2026: a short bar filled to the
 * score, then the score out of 100 in bold. How sure it is, and each part's
 * points, open on hover, keyboard focus or a tap (a phone has no hover).
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
            "flex items-center gap-2 rounded-sm text-left whitespace-nowrap",
            focusRing
          )}
        >
          <span aria-hidden className="h-[3px] w-8 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-foreground" style={{ width: `${score.score}%` }} />
          </span>
          <span className="w-6 text-right font-semibold tabular-nums">{score.score}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="grid gap-1.5 p-3">
        <p className="border-b pb-1.5">Out of 100, sure: {score.confidence}.</p>
        <ViralScoreParts score={score} />
      </TooltipContent>
    </Tooltip>
  )
}
