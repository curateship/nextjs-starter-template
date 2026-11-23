import * as React from "react"
import { Loader2Icon, TrophyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { FinishSummary, PersonalRecord } from "@/lib/api/fitness/workouts"
import { plural } from "@/lib/format/plural"
import { countWords } from "@/lib/fitness/calisthenics"
import { formatWeight, type WeightUnit } from "@/lib/fitness/weights"

/**
 * Ten buttons for how hard the workout felt, 1 easy to 10 everything you had,
 * or five for a weekly check-in's scores. Pressing the picked one again
 * clears it, because the score is optional.
 */
export function EffortPicker({
  value,
  onChange,
  labelId,
  max = 10,
}: {
  value: number | null
  onChange: (effort: number | null) => void
  labelId: string
  max?: 5 | 10
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className={max === 10 ? "grid grid-cols-5 gap-2 sm:grid-cols-10" : "grid grid-cols-5 gap-2"}
    >
      {Array.from({ length: max }, (_, index) => index + 1).map((score) => (
        <Button
          key={score}
          type="button"
          role="radio"
          aria-checked={value === score}
          variant={value === score ? "default" : "outline"}
          onClick={() => onChange(value === score ? null : score)}
        >
          {score}
        </Button>
      ))}
    </div>
  )
}

/** Asks how hard it was and for a note, then finishes the workout. */
export function FinishDialog({
  open,
  initialNote,
  openSets,
  busy,
  onClose,
  onFinish,
}: {
  open: boolean
  initialNote: string
  /** Working sets not ticked, which won't count. */
  openSets: number
  busy: boolean
  onClose: () => void
  onFinish: (input: { effort: number | null; note: string }) => void
}) {
  const [effort, setEffort] = React.useState<number | null>(null)
  const [note, setNote] = React.useState(initialNote)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setEffort(null)
      setNote(initialNote)
    }
  }
  const effortLabelId = React.useId()
  const noteId = React.useId()

  return (
    <FormDialog open={open} dirty={effort !== null || note !== initialNote} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Finish workout</DialogTitle>
            <DialogDescription>
              {openSets > 0
                ? `${openSets} ${plural(openSets, "set")} ${openSets === 1 ? "isn't" : "aren't"} ticked. They won't count toward records or next time's weights.`
                : "Every set is ticked."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-6">
            <Card size="sm">
              <CardHeader>
                <CardTitle id={effortLabelId}>How hard was it?</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <EffortPicker value={effort} onChange={setEffort} labelId={effortLabelId} />
                <p className="text-xs text-muted-foreground">1 is easy, 10 is everything you had. You can skip it.</p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Note</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor={noteId}>Anything to remember</Label>
                  <Textarea
                    id={noteId}
                    rows={1}
                    maxLength={2000}
                    placeholder="Slept badly, still hit every rep"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={requestClose}>
              Keep going
            </Button>
            <Button type="button" size="lg" disabled={busy} onClick={() => onFinish({ effort, note })}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Finish workout
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function recordSentence(record: PersonalRecord, unit: WeightUnit) {
  if (record.kind === "mostReps" && record.measure !== "load") {
    const most = record.measure === "seconds" ? "Longest hold" : "Most reps"
    return `${most} on ${record.exerciseName}: ${countWords(record.reps, record.measure)}, up from ${record.previousReps ?? 0}.`
  }
  if (record.kind === "mostReps") {
    return `Most reps on ${record.exerciseName}: ${record.reps} at ${formatWeight(record.weightKg, unit)}, up from ${record.previousReps ?? 0}.`
  }
  const what = record.kind === "heaviest" ? "Heaviest" : "Best estimated one-rep max on"
  const name = record.kind === "heaviest" ? record.exerciseName.toLowerCase() : record.exerciseName
  return `${what} ${name}: ${formatWeight(record.weightKg, unit)}, up from ${formatWeight(record.previousKg ?? 0, unit)}.`
}

/** What the workout came to: time, sets, the total lifted, records and next time's weights. */
export function SummaryDialog({
  summary,
  unit,
  onDone,
}: {
  summary: FinishSummary | null
  unit: WeightUnit
  /** Done opens History with this workout picked; "Back to the week" returns to the day. */
  onDone: (to: "history" | "week") => void
}) {
  return (
    <Dialog open={Boolean(summary)} onOpenChange={(open) => (open ? undefined : onDone("history"))}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Workout done</DialogTitle>
          <DialogDescription>
            {summary
              ? summary.totalKg > 0
                ? `${summary.minutes} ${plural(summary.minutes, "minute")}, ${summary.setsDone} ${plural(summary.setsDone, "set")}, ${formatWeight(summary.totalKg, unit)} lifted in total.`
                : `${summary.minutes} ${plural(summary.minutes, "minute")}, ${summary.setsDone} ${plural(summary.setsDone, "set")}.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Records</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {summary && summary.records.length > 0 ? (
                <ul className="grid gap-2">
                  {summary.records.map((record) => (
                    <li key={`${record.exerciseId}-${record.kind}`} className="flex items-start gap-2">
                      <TrophyIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                      <span>{recordSentence(record, unit)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No new records this time.</p>
              )}
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Next time</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {summary && summary.weightChanges.length + summary.stepChanges.length > 0 ? (
                <ul className="grid gap-1">
                  {summary.weightChanges.map((change) => (
                    <li key={change.exerciseName}>
                      {change.exerciseName} {change.toKg > change.fromKg ? "goes up" : "comes down"} to{" "}
                      {formatWeight(change.toKg, unit)}, from {formatWeight(change.fromKg, unit)}.
                    </li>
                  ))}
                  {summary.stepChanges.map((change) => (
                    <li key={change.exerciseName}>
                      {change.toName
                        ? `${change.exerciseName} steps up to ${change.toName}, starting at ${countWords(change.reps, change.measure)}.`
                        : `${change.exerciseName} aims for ${countWords(change.reps, change.measure)} a set.`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  {summary && summary.totalKg === 0 ? "Everything stays the same next time." : "The weights stay the same next time."}
                </p>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={() => onDone("week")}>
            Back to the week
          </Button>
          <Button type="button" size="lg" onClick={() => onDone("history")}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
