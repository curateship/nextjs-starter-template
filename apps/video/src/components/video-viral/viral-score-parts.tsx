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
