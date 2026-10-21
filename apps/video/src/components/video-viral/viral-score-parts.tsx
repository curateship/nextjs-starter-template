import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/format/format-time"
import { useRememberedCollapse } from "@/lib/remembered-choice"
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
 * How a score adds up: each of the five parts with the points it gave out of
 * what it is worth, then what was missing. Shown on hover in the list's Score
 * column and written out under the player.
 */
export function ViralScoreParts({ score }: { score: ViralScore }) {
  return (
    <>
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
    </>
  )
}

const SURE_DOT: Record<ViralScore["confidence"], string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-muted-foreground",
}

/** Whether this browser left the score's parts open. Shut until opened. */
const PARTS_OPEN_KEY = "video-viral-score-parts"

/**
 * The right panel's score, as Tyler drew it on 20 Oct 2026: the score large
 * with "/ 100 score" and how sure it is. The "Sure" chip is a button that
 * opens each part with its points out of what it is worth and a bar filled to
 * match, the date it was posted under How recent, and a line on whatever was
 * missing (Tyler, 20 Oct 2026: "make this a toggle and hide the graph bar.
 * Move the posted date in there too"). This browser remembers it left open.
 */
export function ViralScoreBlock({
  score,
  postedAt,
}: {
  score: ViralScore
  postedAt: string | null
}) {
  const [open, setOpen] = useRememberedCollapse(PARTS_OPEN_KEY, false)
  const partsId = React.useId()
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tabular-nums">{score.score}</span>
          <span className="text-sm whitespace-nowrap text-muted-foreground">/ 100 score</span>
        </p>
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-expanded={open}
          // Only while the parts are on the page, since shut they are not drawn.
          aria-controls={open ? partsId : undefined}
          onClick={() => setOpen(!open)}
          className="shrink-0 rounded-full"
        >
          <span aria-hidden className={`size-1.5 rounded-full ${SURE_DOT[score.confidence]}`} />
          Sure: {score.confidence}
          <ChevronDownIcon data-icon="inline-end" className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>
      {open ? <ScoreParts id={partsId} score={score} postedAt={postedAt} /> : null}
    </div>
  )
}

/** The opened half of the score block: the parts, the posted date and what was missing. */
function ScoreParts({
  id,
  score,
  postedAt,
}: {
  id: string
  score: ViralScore
  postedAt: string | null
}) {
  return (
    <div id={id} className="grid gap-3">
      <dl className="grid gap-2.5">
        {PART_ORDER.map((part) => {
          const max = Math.round(VIRAL_SCORE_WEIGHTS[part] * 100)
          const points = score.points[part]
          return (
            <div key={part} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="font-medium">{VIRAL_SCORE_PART_LABELS[part]}</dt>
                <dd className="tabular-nums">
                  <span className="font-semibold">{points}</span>
                  <span className="text-muted-foreground"> of {max}</span>
                </dd>
              </div>
              <div aria-hidden className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground"
                  style={{ width: `${Math.min(100, (points / max) * 100)}%` }}
                />
              </div>
              {/* How recent is worked out from the posted date, so it sits here. */}
              {part === "freshness" ? (
                <dd className="text-xs text-muted-foreground">
                  {postedAt ? `Posted ${formatDate(postedAt)}` : "Posted date not known"}
                </dd>
              ) : null}
            </div>
          )
        })}
      </dl>
      {score.missing.length ? (
        <p className="text-xs text-muted-foreground">{missingSentence(score)}</p>
      ) : null}
    </div>
  )
}

/** "Breakdown is missing, so it scores 0 of 10. Break this video down to fill it in." */
function missingSentence(score: ViralScore) {
  const others = score.missing
    .filter((item) => item !== "Missing breakdown")
    .map((item) => item.replace(/^Missing /, "").toLowerCase())
  const parts: string[] = []
  if (score.missing.includes("Missing breakdown")) {
    parts.push(
      `Breakdown is missing, so it scores ${score.points.structure} of ${Math.round(VIRAL_SCORE_WEIGHTS.structure * 100)}. Break this video down to fill it in.`
    )
  }
  if (others.length) parts.push(`${parts.length ? "Also missing" : "Missing"}: ${others.join(", ")}.`)
  return parts.join(" ")
}
