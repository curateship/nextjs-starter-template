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

/**
 * The right panel's score, as Tyler drew it on 20 Oct 2026: the score large
 * with "/ 100 score", how sure it is in a chip, then each part with its
 * points out of what it is worth and a bar filled to match, and a line on
 * whatever was missing.
 */
export function ViralScoreBlock({ score }: { score: ViralScore }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tabular-nums">{score.score}</span>
          <span className="text-sm text-muted-foreground">/ 100 score</span>
        </p>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium">
          <span aria-hidden className={`size-1.5 rounded-full ${SURE_DOT[score.confidence]}`} />
          Sure: {score.confidence}
        </span>
      </div>
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
