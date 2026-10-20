import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ArrowDownIcon, ArrowLeftRightIcon, ArrowUpIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { PanelBody, RightHeader } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { ExercisePicker } from "@/components/fitness/exercise-picker"
import { PanelCard } from "@/components/fitness/panel-card"
import { groupByBodyPart } from "@/components/fitness/program/day-groups"
import { useAutoSave } from "@/components/fitness/program/program-data"
import { SegmentedChoice } from "@/components/fitness/segmented-choice"
import { TONE } from "@/components/fitness/status-tones"
import { StepperField } from "@/components/fitness/stepper-field"
import { WeightInput } from "@/components/fitness/weight-input"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { changeWeek, type DayExercise, type WeekDay } from "@/lib/api/fitness/programs"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { formatWeight, roundToStep } from "@/lib/fitness/weights"
import { cn } from "@/lib/utils"

/** "3 min", "90 s", "1 min 30 s". */
function restLabel(seconds: number) {
  if (seconds <= 0) return "No rest"
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const left = seconds % 60
  return left ? `${minutes} min ${left} s` : `${minutes} min`
}

const REST_CHOICES = [
  { value: "60", label: "1 min" },
  { value: "90", label: "1:30" },
  { value: "120", label: "2 min" },
  { value: "180", label: "3 min" },
]

/** One line of Next time: an arrow in its tone, what has to happen, and the weight it leads to. */
function NextTimeRow({ tone, text, value }: { tone: keyof typeof TONE; text: string; value: string }) {
  const Icon = tone === "positive" ? ArrowUpIcon : ArrowDownIcon
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", TONE[tone])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">{text}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
    </li>
  )
}

/**
 * The right panel on the Day view with an exercise picked, laid out as Tyler
 * drew it on 18 Oct 2026: its sets, reps,
 * weight and rest, saving as they change; whether it joins the one above as
 * a superset; what happens to its weight next time, in numbers; and Swap and
 * Remove.
 */
export function DayExercisePanel({
  page,
  day,
  row,
  onClose,
}: {
  page: ProgramViewProps["page"]
  day: WeekDay
  row: DayExercise
  onClose: () => void
}) {
  const router = useRouter()
  const autoSave = useAutoSave()
  const exercise = page.exercises.find((entry) => entry.id === row.exerciseId)
  const name = exercise?.name ?? "Exercise"
  const unit = page.preferences.unit
  const canChange = !page.program.archived
  const [sets, setSets] = React.useState(row.sets)
  const [reps, setReps] = React.useState(row.reps)
  const [rest, setRest] = React.useState(row.restSeconds)
  const [weightKg, setWeightKg] = React.useState(row.weightKg)
  const [swapping, setSwapping] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const base = `day-exercise-${row.id}`
  // Counted as the Day view shows the day, body part by body part, which is the order the server keeps.
  const shownOrder = groupByBodyPart(day.exercises, new Map(page.exercises.map((entry) => [entry.id, entry]))).flatMap(
    (group) => group.rows
  )
  const shownIndex = shownOrder.findIndex((entry) => entry.id === row.id)
  const joined = row.groupKey !== null && shownOrder[shownIndex - 1]?.groupKey === row.groupKey

  function save(field: "sets" | "reps" | "restSeconds" | "weightKg", value: number, at: "soon" | "now") {
    autoSave[at](`${base}-${field}`, async () => {
      await changeWeek({ action: "updateExercise", dayExerciseId: row.id, change: { [field]: value } })
      await router.invalidate()
    })
  }

  async function act(action: () => Promise<unknown>, success?: string) {
    setBusy(true)
    try {
      await action()
      if (success) toast.success(success)
      await router.invalidate()
      return true
    } catch (error) {
      reportFitnessError(error)
      return false
    } finally {
      setBusy(false)
    }
  }

  const { strength } = page
  const step = page.preferences.stepKg
  const up = weightKg + strength.increaseKg
  const down = Math.max(0, roundToStep(weightKg * (1 - strength.dropPercent / 100), step))
  const missesLeft = Math.max(strength.missesBeforeDrop - row.missStreak, 1)
  const weightWord = exercise?.isBodyweight ? "the added weight" : "it"

  const position = shownIndex + 1
  const restChoice = REST_CHOICES.some((choice) => choice.value === String(rest)) ? String(rest) : null

  return (
    <>
      <RightHeader
        title={name}
        meta={`Exercise ${position} of ${day.exercises.length} · ${day.name}`}
        closeLabel="Close this exercise"
        onClose={onClose}
      />
      <PanelBody>
        <PanelCard storageId="fitness-right-exercise-sets" title="Sets and weight">
          <div className="grid grid-cols-2 gap-3">
            <StepperField
              id={`${base}-sets`}
              label="Sets"
              value={sets}
              min={1}
              max={20}
              disabled={!canChange}
              onChange={(value) => {
                setSets(value)
                save("sets", value, "soon")
              }}
            />
            <StepperField
              id={`${base}-reps`}
              label="Reps"
              value={reps}
              min={1}
              max={100}
              disabled={!canChange}
              onChange={(value) => {
                setReps(value)
                save("reps", value, "soon")
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${base}-weight`}>{exercise?.isBodyweight ? "Added weight" : "Weight"}</Label>
            <WeightInput
              id={`${base}-weight`}
              valueKg={weightKg}
              unit={unit}
              showUnit
              placeholder="0"
              onCommit={(kg) => {
                setWeightKg(kg ?? 0)
                save("weightKg", kg ?? 0, "now")
              }}
            />
            <p className="text-[13px] text-muted-foreground">
              {exercise?.isBodyweight
                ? "Only what hangs from a belt or sits in a vest. Leave at 0 for bodyweight alone."
                : "Leave at 0 for bodyweight or assisted."}
            </p>
          </div>
          <div className="grid gap-2">
            <Label id={`${base}-rest`}>Rest between sets</Label>
            <SegmentedChoice
              label="Rest between sets"
              value={restChoice}
              options={REST_CHOICES}
              disabled={!canChange}
              onChange={(value) => {
                setRest(Number(value))
                save("restSeconds", Number(value), "now")
              }}
            />
            {restChoice === null ? (
              <p className="text-[13px] text-muted-foreground">{restLabel(rest)} now. Pick one to change it.</p>
            ) : null}
          </div>
          {shownIndex > 0 && canChange ? (
            <div className="flex items-center gap-2">
              <Switch
                id={`${base}-superset`}
                checked={joined}
                disabled={busy}
                onCheckedChange={(checked) =>
                  void act(() => changeWeek({ action: "superset", dayExerciseId: row.id, joined: checked }))
                }
              />
              <FieldLabel
                htmlFor={`${base}-superset`}
                hint="Done back to back with the exercise above, with one rest after the last of them."
              >
                Join with the one above
              </FieldLabel>
            </div>
          ) : null}
        </PanelCard>

        <PanelCard storageId="fitness-right-exercise-next" title="Next time" flush>
          {strength.autoIncrease ? (
            <ul className="divide-y">
              <NextTimeRow tone="positive" text={`Hit all ${sets} sets of ${reps}`} value={formatWeight(up, unit)} />
              <NextTimeRow
                tone="warning"
                text={missesLeft === 1 ? "Miss reps once more" : `Miss reps ${missesLeft} sessions in a row`}
                value={formatWeight(down, unit)}
              />
              {row.missStreak > 0 ? (
                <li className="px-4 py-3 text-[13px] text-muted-foreground">
                  Reps were missed {row.missStreak} {row.missStreak === 1 ? "session" : "sessions"} in a row so far.
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              Automatic changes are off for this program, so {weightWord} stays at {formatWeight(weightKg, unit)} until
              you change it.
            </p>
          )}
        </PanelCard>

        {canChange ? (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setSwapping(true)}>
              <ArrowLeftRightIcon />
              Swap exercise
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => setRemoving(true)}
            >
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Remove
            </Button>
          </div>
        ) : null}
      </PanelBody>

      <ExercisePicker
        open={swapping}
        onOpenChange={setSwapping}
        exercises={page.exercises.filter((entry) => entry.id !== row.exerciseId)}
        title={`Swap ${name} for`}
        description="The sets, reps, weight and rest stay as they are."
        onPick={(picked) =>
          void act(
            () => changeWeek({ action: "updateExercise", dayExerciseId: row.id, change: { exerciseId: picked.id } }),
            `${name} swapped for ${picked.name}.`
          )
        }
      />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${name} from ${day.name}?`}
        description="It comes off this day. Sets you already logged stay in History."
        confirmLabel="Remove"
        destructive
        loading={busy}
        onConfirm={() =>
          void act(() => changeWeek({ action: "removeExercise", dayExerciseId: row.id }), `${name} removed.`).then(
            (done) => {
              if (done) {
                setRemoving(false)
                onClose()
              }
            }
          )
        }
      />
    </>
  )
}
