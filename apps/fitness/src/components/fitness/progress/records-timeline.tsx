import * as React from "react"
import { TrophyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { RecordBroken } from "@/lib/api/fitness/progress"
import { countWords } from "@/lib/fitness/calisthenics"
import { formatDay } from "@/lib/fitness/dates"
import { formatWeight, type WeightUnit } from "@/lib/fitness/weights"

/** How many rows show before "Show more", and how many each press adds. */
const PAGE = 20

/** "82 kg once (was 80 kg)": the new mark and the one it beat. */
function markWords(record: RecordBroken, unit: WeightUnit) {
  switch (record.kind) {
    case "heaviest":
      return `heaviest ${formatWeight(record.weightKg, unit)} (was ${formatWeight(record.previousKg ?? 0, unit)})`
    case "oneRepMax":
      return `${formatWeight(record.weightKg, unit)} once (was ${formatWeight(record.previousKg ?? 0, unit)})`
    case "mostReps":
      return record.measure === "load"
        ? `${record.reps} reps at ${formatWeight(record.weightKg, unit)} (was ${record.previousReps ?? 0})`
        : `${countWords(record.reps, record.measure)} (was ${record.previousReps ?? 0})`
  }
}

/**
 * Every record broken in this program's routine type, newest first (Tyler,
 * 21 Oct 2026): "Oct 18, Bench press, 82 kg once (was 80 kg)". "Once" is the
 * estimated one-rep max, the heaviest weight the person could likely lift
 * once. Clicking a row puts that lift on the chart and opens it on the right,
 * the same as clicking it in Records.
 */
export function RecordsTimeline({
  records,
  unit,
  onShow,
}: {
  records: readonly RecordBroken[]
  unit: WeightUnit
  onShow: (exerciseId: string) => void
}) {
  const [shown, setShown] = React.useState(PAGE)
  if (records.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No records broken yet. Each time you beat a lift&apos;s best, it shows here.
      </p>
    )
  }
  return (
    <div className="grid">
      <ul className="divide-y">
        {records.slice(0, shown).map((record, index) => (
          <li key={`${record.day}-${record.exerciseId}-${record.kind}-${index}`}>
            <button
              type="button"
              className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
              onClick={() => onShow(record.exerciseId)}
            >
              <TrophyIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="text-muted-foreground">{formatDay(record.day)}, </span>
                <span className="font-medium">{record.name}</span>, {markWords(record, unit)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {records.length > shown ? (
        <div className="border-t p-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setShown(shown + PAGE)}>
            Show more
          </Button>
        </div>
      ) : null}
    </div>
  )
}
