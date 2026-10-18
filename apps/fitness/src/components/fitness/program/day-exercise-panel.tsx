import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ArrowLeftRightIcon, Loader2Icon, Trash2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { PanelBody, PanelHeader } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { ExercisePicker } from "@/components/fitness/exercise-picker"
import { PanelCard } from "@/components/fitness/panel-card"
import { saveStateLabel, useAutoSave } from "@/components/fitness/program/program-data"
import { WeightInput } from "@/components/fitness/weight-input"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { NumberField } from "@/components/ui/number-field"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { changeWeek, type DayExercise, type WeekDay } from "@/lib/api/fitness/programs"
import { WEEKDAY_NAMES } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { formatWeight, roundToStep } from "@/lib/fitness/weights"

/** "3 min", "90 s", "1 min 30 s". */
function restLabel(seconds: number) {
  if (seconds <= 0) return "No rest"
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const left = seconds % 60
  return left ? `${minutes} min ${left} s` : `${minutes} min`
}

/**
 * The right panel on the Day view with an exercise picked: its sets, reps,
 * weight and rest, saving as they change; whether it joins the one above as
 * a superset; what happens to its weight next time, in numbers; and Swap and
 * Remove.
 */
export function DayExercisePanel({
  page,
  day,
  row,
  first,
  onClose,
}: {
  page: ProgramViewProps["page"]
  day: WeekDay
  row: DayExercise
  first: boolean
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
  const status = saveStateLabel(autoSave.state) || undefined
  const joined = row.groupKey !== null && day.exercises[day.exercises.findIndex((entry) => entry.id === row.id) - 1]?.groupKey === row.groupKey

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

  return (
    <>
      <PanelHeader>
        <div className="grid min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{name}</h2>
          <span className="truncate text-xs text-muted-foreground">
            {WEEKDAY_NAMES[day.weekday]} · {day.name}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close this exercise" onClick={onClose}>
              <XIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close this exercise</TooltipContent>
        </Tooltip>
      </PanelHeader>
      <PanelBody>
        <PanelCard storageId="fitness-right-exercise-sets" title="Sets and weight" meta={status}>
          <div className="grid grid-cols-2 gap-4">
            <NumberField
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
              onCommit={() => save("sets", sets, "now")}
            />
            <NumberField
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
              onCommit={() => save("reps", reps, "now")}
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel
              htmlFor={`${base}-weight`}
              hint={
                exercise?.isBodyweight
                  ? "Only what hangs from a belt or sits in a vest. Your bodyweight is added on top when you log it."
                  : "The weight the next workout starts with. The weight rules move it after each session."
              }
            >
              {exercise?.isBodyweight ? `Added weight (${unit})` : `Weight (${unit})`}
            </FieldLabel>
            <WeightInput
              id={`${base}-weight`}
              valueKg={weightKg}
              unit={unit}
              placeholder="0"
              onCommit={(kg) => {
                setWeightKg(kg ?? 0)
                save("weightKg", kg ?? 0, "now")
              }}
            />
          </div>
          <NumberField
            id={`${base}-rest`}
            label="Rest between sets (seconds)"
            hint={`The rest timer counts this down after each set. ${restLabel(rest)} now.`}
            value={rest}
            min={0}
            max={900}
            disabled={!canChange}
            onChange={(value) => {
              setRest(value)
              save("restSeconds", value, "soon")
            }}
            onCommit={() => save("restSeconds", rest, "now")}
          />
          {!first && canChange ? (
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

        <PanelCard storageId="fitness-right-exercise-next" title="Next time">
          {strength.autoIncrease ? (
            <ul className="grid gap-2 text-sm">
              <li>
                Hit all {sets} sets of {reps} and {weightWord} goes to{" "}
                <span className="font-medium">{formatWeight(up, unit)}</span>.
              </li>
              <li>
                Miss reps {missesLeft === 1 ? "once more" : `${missesLeft} sessions in a row`} and {weightWord} drops to{" "}
                <span className="font-medium">{formatWeight(down, unit)}</span>.
              </li>
              {row.missStreak > 0 ? (
                <li className="text-muted-foreground">
                  Reps were missed {row.missStreak} {row.missStreak === 1 ? "session" : "sessions"} in a row so far.
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Automatic changes are off for this program, so {weightWord} stays at {formatWeight(weightKg, unit)} until
              you change it.
            </p>
          )}
        </PanelCard>

        {canChange ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setSwapping(true)}>
              <ArrowLeftRightIcon />
              Swap exercise
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRemoving(true)}>
              {busy ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
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
