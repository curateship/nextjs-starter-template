import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { ExerciseList } from "@/components/fitness/exercise-picker"
import { WeightInput } from "@/components/fitness/weight-input"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Exercise } from "@/lib/api/fitness/exercises"
import { changeWeek, type WeekDay } from "@/lib/api/fitness/programs"
import { BODY_PART_LABELS, bodyPartOf, musclesOfBodyPart, type BodyPart } from "@/lib/fitness/exercise-catalog"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { showErrorToast } from "@/lib/toast/error-toast"

/** The middle header's "New …" button and its dropdown, opening on the right. */
export function NewButton({ label, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button type="button" variant="outline" className="@max-3xl:size-8 @max-3xl:px-0" aria-label={label} {...props}>
      <PlusIcon />
      <span className="@max-3xl:hidden">{label}</span>
    </Button>
  )
}

/**
 * New exercise: the lift first, then sets and reps, weight and rest, with
 * Create exercise at the bottom. A lift picked fills in the usual reps and
 * rest for its kind, 5 and 3 min for a compound lift, 10 and 1:30 for an
 * isolation one. Clicking away keeps what was chosen for the next opening.
 *
 * The same dropdown opens from the "+" on a body part's heading in the Day
 * view, already set to that body part: only its lifts are listed (UI
 * standard: a "+" on a group heading opens the same dropdown set to that
 * group). The server files the new lift at the end of its body part
 * (`settleDayOrder`), in the same request that adds it.
 */
export function NewExercise({
  page,
  go,
  day,
  bodyPart,
  trigger,
}: Pick<ProgramViewProps, "page" | "go"> & {
  day: WeekDay
  bodyPart?: BodyPart
  /** The button that opens it; the header's "New exercise" when left out. */
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const unit = page.preferences.unit
  const [open, setOpen] = React.useState(false)
  const [exercise, setExercise] = React.useState<Exercise | null>(null)
  const [sets, setSets] = React.useState(3)
  const [reps, setReps] = React.useState(5)
  const [weightKg, setWeightKg] = React.useState<number | null>(null)
  const [rest, setRest] = React.useState("180")
  const [busy, setBusy] = React.useState(false)
  const base = React.useId()
  const choices = bodyPart ? page.exercises.filter((entry) => bodyPartOf(entry.muscles) === bodyPart) : page.exercises
  const label = bodyPart ? `New ${BODY_PART_LABELS[bodyPart].toLowerCase()} exercise` : "New exercise"

  function pick(next: Exercise) {
    setExercise(next)
    setReps(next.movement === "isolation" ? 10 : 5)
    setRest(next.movement === "isolation" ? "90" : "180")
  }

  async function create() {
    if (!exercise) {
      showErrorToast("Pick the exercise first.")
      return
    }
    setBusy(true)
    try {
      const { id } = await changeWeek({
        action: "addExercise",
        dayId: day.id,
        exerciseId: exercise.id,
        sets,
        reps,
        weightKg: weightKg ?? 0,
        restSeconds: Number(rest),
      })
      await router.invalidate()
      toast.success(`${exercise.name} added to ${day.name}.`)
      setOpen(false)
      setExercise(null)
      setSets(3)
      setReps(5)
      setWeightKg(null)
      setRest("180")
      if (id) go({ open: id })
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <NewRecordDropdown
      label={label}
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create exercise"
      busy={busy}
      onSubmit={() => void create()}
      trigger={trigger ?? <NewButton label="New exercise" />}
    >
      <div className="grid gap-2">
        <Label>Exercise{exercise ? `: ${exercise.name}` : ""}</Label>
        <ExerciseList
          compact
          exercises={choices}
          muscles={bodyPart ? musclesOfBodyPart(bodyPart) : undefined}
          picked={exercise?.id}
          onPick={pick}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <NumberField id={`${base}-sets`} label="Sets" value={sets} min={1} max={20} onChange={setSets} />
        <NumberField id={`${base}-reps`} label="Reps" value={reps} min={1} max={100} onChange={setReps} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={`${base}-weight`}>Weight</Label>
          <WeightInput id={`${base}-weight`} valueKg={weightKg} unit={unit} showUnit placeholder="0" onCommit={setWeightKg} />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={`${base}-rest`}>Rest</Label>
          <Select value={rest} onValueChange={setRest}>
            <SelectTrigger id={`${base}-rest`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REST_CHOICES.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </NewRecordDropdown>
  )
}

const REST_CHOICES = [
  { value: "60", label: "1 min" },
  { value: "90", label: "1:30" },
  { value: "120", label: "2 min" },
  { value: "180", label: "3 min" },
]
