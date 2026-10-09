import * as React from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import {
  VIRAL_SCORE_PART_LABELS,
  VIRAL_SCORE_WEIGHTS,
  type ViralScore,
  type ViralScoreParts,
} from "@/lib/video/viral-score"

const PART_ORDER: (keyof ViralScoreParts)[] = [
  "velocity",
  "audienceLift",
  "engagement",
  "freshness",
  "structure",
]

/**
 * The Score column: the score out of 100, how sure it is beside it, and each
 * part's points on hover, keyboard focus or a tap (a phone has no hover).
 * The trigger is a button so the row's click, which opens YouTube, leaves it
 * alone.
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
        {PART_ORDER.map((part) => (
          <div key={part} className="flex justify-between gap-4">
            <span>{VIRAL_SCORE_PART_LABELS[part]}</span>
            <span className="tabular-nums">
              {`${score.points[part]} of ${Math.round(VIRAL_SCORE_WEIGHTS[part] * 100)}`}
            </span>
          </div>
        ))}
        {score.missing.length ? (
          <p className="border-t pt-1.5">{score.missing.join(", ")}</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}
