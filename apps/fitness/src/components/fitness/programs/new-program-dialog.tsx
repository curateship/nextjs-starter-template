import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import { WeightInput } from "@/components/fitness/weight-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { loadExercises, type Exercise } from "@/lib/api/fitness/exercises"
import { saveNewProgram } from "@/lib/api/fitness/programs"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { EQUIPMENT, EQUIPMENT_LABELS, type Equipment } from "@/lib/fitness/exercise-catalog"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { ROUTINE_TYPES, type RoutineTypeId } from "@/lib/fitness/routine-types"
import { EXPERIENCE, GOALS, MEASUREMENTS, type ExperienceId, type GoalId, type MeasurementKey } from "@/lib/fitness/templates"
import { estimateOneRepMax, formatWeight, type WeightUnit } from "@/lib/fitness/weights"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Lift = { exerciseId: string; name: string; weightKg: number | null; reps: string }

const EMPTY_MEASUREMENTS: Record<MeasurementKey, string> = {
  chestCm: "",
  waistCm: "",
  hipsCm: "",
  armCm: "",
  thighCm: "",
}

/** The last list read, shown straight away while each opening reads it again. */
let heldExercises: Exercise[] | null = null

/**
 * Makes a program in one go: its name, its routine type and the starting data
 * the person brings on day one. Tyler, 18 Oct 2026: "I create a program via
 * modal, choose a routine, input my starting data then create. Only then I get
 * to the 3 panel dashboard." Strength training and Calisthenics can be picked
 * today; the other types are shown so people know they are coming. Best lifts
 * are picked from the chosen routine type's exercises only, and a Calisthenics
 * program has none, because its moves count no weight. A coach looking at a client
 * passes `personId`, and the program is the client's.
 */
export function NewProgramDialog({
  open,
  onOpenChange,
  personId,
  unit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId?: string
  unit: WeightUnit
}) {
  const navigate = useNavigate()
  const ids = {
    name: React.useId(),
    weeks: React.useId(),
    bodyweight: React.useId(),
    height: React.useId(),
    goal: React.useId(),
    experience: React.useId(),
  }
  const [name, setName] = React.useState("")
  const [routineType, setRoutineType] = React.useState<RoutineTypeId>("strength")
  const [weeks, setWeeks] = React.useState("")
  const [bodyweightKg, setBodyweightKg] = React.useState<number | null>(null)
  const [height, setHeight] = React.useState("")
  const [measurements, setMeasurements] = React.useState(EMPTY_MEASUREMENTS)
  const [goal, setGoal] = React.useState<GoalId | null>(null)
  const [experience, setExperience] = React.useState<ExperienceId | null>(null)
  const [equipment, setEquipment] = React.useState<Equipment[]>([])
  const [lifts, setLifts] = React.useState<Lift[]>([])
  const [invalid, setInvalid] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [exercises, setExercises] = React.useState<Exercise[] | null>(() => heldExercises)

  // The library is read from the server, an outside system, each time the
  // window opens, so a lift made on Exercises a minute ago is offered.
  React.useEffect(() => {
    if (!open) return
    let live = true
    loadExercises().then(
      (list) => {
        heldExercises = list
        if (live) setExercises(list)
      },
      (error) => reportFitnessError(error)
    )
    return () => {
      live = false
    }
  }, [open])

  const typeExercises = (exercises ?? []).filter(
    (exercise) => exercise.routineType === routineType && !lifts.some((lift) => lift.exerciseId === exercise.id)
  )
  const dirty =
    name.trim() !== "" ||
    weeks !== "" ||
    bodyweightKg !== null ||
    height !== "" ||
    Object.values(measurements).some(Boolean) ||
    goal !== null ||
    experience !== null ||
    equipment.length > 0 ||
    lifts.length > 0

  function reset() {
    setName("")
    setRoutineType("strength")
    setWeeks("")
    setBodyweightKg(null)
    setHeight("")
    setMeasurements(EMPTY_MEASUREMENTS)
    setGoal(null)
    setExperience(null)
    setEquipment([])
    setLifts([])
    setInvalid(new Set())
  }

  function close() {
    onOpenChange(false)
    reset()
  }

  /** A centimetre field as a number, null when empty, undefined when it isn't a number. */
  function centimetres(text: string): number | null | undefined {
    const trimmed = text.trim().replace(",", ".")
    if (trimmed === "") return null
    const value = Number(trimmed)
    return Number.isFinite(value) && value > 0 && value <= 400 ? value : undefined
  }

  async function create() {
    const problems = new Set<string>()
    let message: string | null = null
    if (!name.trim()) {
      problems.add("name")
      message = FITNESS_ERRORS.nameNeeded
    }
    const weekCount = weeks.trim() === "" ? null : Number(weeks.trim())
    if (weekCount !== null && (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 104)) {
      problems.add("weeks")
      message ??= "Type between 1 and 104 weeks, or leave it empty so the program runs for good."
    }
    const heightCm = centimetres(height)
    if (heightCm === undefined) {
      problems.add("height")
      message ??= "Type a height in centimetres, such as 180."
    }
    const measured: Partial<Record<MeasurementKey, number | null>> = {}
    for (const { key, label } of MEASUREMENTS) {
      const value = centimetres(measurements[key])
      if (value === undefined) {
        problems.add(key)
        message ??= `Type the ${label.toLowerCase()} in centimetres.`
      } else measured[key] = value
    }
    const savedLifts: { exerciseId: string; weightKg: number; reps: number }[] = []
    for (const lift of lifts) {
      const reps = Number(lift.reps)
      if (lift.weightKg === null || lift.weightKg <= 0 || !Number.isInteger(reps) || reps < 1 || reps > 50) {
        problems.add(`lift-${lift.exerciseId}`)
        message ??= `Give ${lift.name} a weight and between 1 and 50 reps, or remove it.`
        continue
      }
      savedLifts.push({ exerciseId: lift.exerciseId, weightKg: lift.weightKg, reps })
    }
    setInvalid(problems)
    if (message) {
      showErrorToast(message)
      return
    }
    setBusy(true)
    try {
      const { id } = await saveNewProgram({
        name,
        routineType,
        weeks: weekCount,
        personId,
        baseline: {
          bodyweightKg,
          heightCm: heightCm ?? null,
          ...measured,
          goal,
          experience,
          equipment,
        },
        lifts: savedLifts,
      })
      onOpenChange(false)
      reset()
      await navigate({ to: "/programs/$programId", params: { programId: id } })
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <DialogHeader>
              <DialogTitle>New program</DialogTitle>
              <DialogDescription>
                A program is one week of training, Monday to Sunday. Name it, pick its routine type and say where
                you're starting from. You plan the week next.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-6">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Program</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor={ids.name}>Name</Label>
                    <Input
                      id={ids.name}
                      value={name}
                      maxLength={80}
                      placeholder="Summer strength"
                      aria-invalid={invalid.has("name") || undefined}
                      autoFocus
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor={ids.weeks}
                      hint="Counted from today. After the last week nothing more is planned, and you pick between running it again and ending it. Leave it empty to run for good."
                    >
                      Weeks it runs
                    </FieldLabel>
                    <Input
                      id={ids.weeks}
                      inputMode="numeric"
                      value={weeks}
                      placeholder="No end"
                      aria-invalid={invalid.has("weeks") || undefined}
                      onChange={(event) => setWeeks(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2" role="radiogroup" aria-label="Routine type">
                    <span className="text-sm font-medium">Routine type</span>
                    {ROUTINE_TYPES.map((type) => {
                      const picked = routineType === type.id
                      return (
                        <button
                          key={type.id}
                          type="button"
                          role="radio"
                          aria-checked={picked}
                          aria-disabled={!type.live || undefined}
                          className={cn(
                            "flex items-start justify-between gap-3 rounded-lg border p-3 text-left",
                            picked && "ring-2 ring-primary",
                            type.live ? "hover:bg-muted" : "cursor-not-allowed opacity-60"
                          )}
                          onClick={() => {
                            if (!type.live) return
                            if (type.id !== routineType) setLifts([])
                            setRoutineType(type.id)
                          }}
                        >
                          <span>
                            <span className="block font-medium">{type.label}</span>
                            <span className="block text-xs text-muted-foreground">{type.description}</span>
                          </span>
                          {type.live ? null : <Badge variant="outline">Coming soon</Badge>}
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Starting data</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <p className="text-sm text-muted-foreground">
                    Everything here can be left empty and filled in later. Progress compares against it.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={ids.bodyweight}>{`Bodyweight (${unit})`}</Label>
                      <WeightInput id={ids.bodyweight} valueKg={bodyweightKg} unit={unit} onCommit={setBodyweightKg} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={ids.height}>Height (cm)</Label>
                      <Input
                        id={ids.height}
                        inputMode="decimal"
                        value={height}
                        aria-invalid={invalid.has("height") || undefined}
                        onChange={(event) => setHeight(event.target.value)}
                      />
                    </div>
                    {MEASUREMENTS.map(({ key, label }) => (
                      <MeasurementField
                        key={key}
                        label={`${label} (cm)`}
                        value={measurements[key]}
                        invalid={invalid.has(key)}
                        onChange={(value) => setMeasurements((current) => ({ ...current, [key]: value }))}
                      />
                    ))}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={ids.goal}>What you want most</Label>
                      <Select value={goal ?? ""} onValueChange={(value) => setGoal(value as GoalId)}>
                        <SelectTrigger id={ids.goal}>
                          <SelectValue placeholder="Pick a goal" />
                        </SelectTrigger>
                        <SelectContent>
                          {GOALS.map((entry) => (
                            <SelectItem key={entry.id} value={entry.id}>
                              {entry.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={ids.experience}>How long you've lifted</Label>
                      <Select value={experience ?? ""} onValueChange={(value) => setExperience(value as ExperienceId)}>
                        <SelectTrigger id={ids.experience}>
                          <SelectValue placeholder="Pick one" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPERIENCE.map((entry) => (
                            <SelectItem key={entry.id} value={entry.id}>
                              {entry.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Equipment you have</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <p className="text-sm text-muted-foreground">
                    Swaps and the AI plan only offer lifts you can do with these. Leave all empty to allow everything.
                  </p>
                  {EQUIPMENT.map((item) => {
                    const checkboxId = `new-program-equipment-${item}`
                    return (
                      <div key={item} className="flex items-center gap-2">
                        <Checkbox
                          id={checkboxId}
                          checked={equipment.includes(item)}
                          onCheckedChange={(checked) =>
                            setEquipment((current) =>
                              checked === true ? [...current, item] : current.filter((entry) => entry !== item)
                            )
                          }
                        />
                        <Label htmlFor={checkboxId} className="font-normal">
                          {EQUIPMENT_LABELS[item]}
                        </Label>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              {/* A Calisthenics move counts no weight, so there are no best lifts to start from. */}
              {routineType === "calisthenics" ? null : (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Best lifts</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <p className="text-sm text-muted-foreground">
                      Your best recent set of a lift, such as 80 {unit === "kg" ? "kg" : "lb"} for 5. Only this routine
                      type's exercises are listed, and templates start each lift from it.
                    </p>
                    {lifts.map((lift) => (
                      <LiftRow
                        key={lift.exerciseId}
                        lift={lift}
                        unit={unit}
                        invalid={invalid.has(`lift-${lift.exerciseId}`)}
                        onChange={(next) =>
                          setLifts((current) => current.map((entry) => (entry.exerciseId === lift.exerciseId ? next : entry)))
                        }
                        onRemove={() => setLifts((current) => current.filter((entry) => entry.exerciseId !== lift.exerciseId))}
                      />
                    ))}
                    {/* A dropdown rather than the exercise picker's own window: a window never opens over another. */}
                    <Select
                      value=""
                      onValueChange={(exerciseId) => {
                        const exercise = typeExercises.find((entry) => entry.id === exerciseId)
                        if (!exercise) return
                        setLifts((current) => [
                          ...current,
                          { exerciseId: exercise.id, name: exercise.name, weightKg: null, reps: "1" },
                        ])
                      }}
                    >
                      <SelectTrigger aria-label="Add a best lift" className="w-fit">
                        <PlusIcon className="size-4" />
                        <SelectValue placeholder={exercises ? "Add a best lift" : "Loading exercises…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {typeExercises.map((exercise) => (
                          <SelectItem key={exercise.id} value={exercise.id}>
                            {exercise.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create program
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function MeasurementField({
  label,
  value,
  invalid,
  onChange,
}: {
  label: string
  value: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  const id = React.useId()
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

/** One best lift: weight and reps, with the one-rep max it works out to as it is typed. */
function LiftRow({
  lift,
  unit,
  invalid,
  onChange,
  onRemove,
}: {
  lift: Lift
  unit: WeightUnit
  invalid: boolean
  onChange: (lift: Lift) => void
  onRemove: () => void
}) {
  const ids = { weight: React.useId(), reps: React.useId() }
  const reps = Number(lift.reps)
  const estimate =
    lift.weightKg && Number.isInteger(reps) && reps >= 1 ? estimateOneRepMax(lift.weightKg, reps) : null
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{lift.name}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${lift.name}`} onClick={onRemove}>
              <Trash2Icon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove</TooltipContent>
        </Tooltip>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor={ids.weight}>{`Weight (${unit})`}</Label>
          <WeightInput
            id={ids.weight}
            valueKg={lift.weightKg}
            unit={unit}
            onCommit={(weightKg) => onChange({ ...lift, weightKg })}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor={ids.reps}>Reps</FieldLabel>
          <Input
            id={ids.reps}
            inputMode="numeric"
            value={lift.reps}
            aria-invalid={invalid || undefined}
            onChange={(event) => onChange({ ...lift, reps: event.target.value })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {estimate ? `About ${formatWeight(estimate, unit)} once.` : "Type a weight and reps to see your one-rep max."}
      </p>
    </div>
  )
}
