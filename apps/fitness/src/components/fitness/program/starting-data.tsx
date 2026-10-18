import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { ExercisePicker } from "@/components/fitness/exercise-picker"
import { DecimalInput } from "@/components/fitness/program/decimal-input"
import { saveStateLabel, useAutoSave, type ProgramPageData } from "@/components/fitness/program/program-data"
import { WeightInput } from "@/components/fitness/weight-input"
import { PanelCard } from "@/components/fitness/panel-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { changeBaselineLift, saveProgramBaseline, type Baseline } from "@/lib/api/fitness/programs"
import { EQUIPMENT, EQUIPMENT_LABELS, type Equipment } from "@/lib/fitness/exercise-catalog"
import { EXPERIENCE, GOALS, MEASUREMENTS, type ExperienceId, type GoalId } from "@/lib/fitness/templates"
import { estimateOneRepMax, formatWeight, type WeightUnit } from "@/lib/fitness/weights"

type BaselineChange = Parameters<typeof saveProgramBaseline>[0]["change"]

/**
 * The program's starting data, as one card in the right panel: what the
 * person brought on day one. It saves as it is typed, with no Save button.
 * The best lifts feed the templates' and the AI's starting weights, and the
 * measurements are the "before" the photos compare against. Fields stack one
 * under another so they fit a narrow panel.
 */
export function StartingData({ data }: { data: ProgramPageData }) {
  const programId = data.program.id
  const unit = data.preferences.unit
  const autoSave = useAutoSave()
  const [baseline, setBaseline] = React.useState<Baseline>(data.baseline)
  const [shownBaseline, setShownBaseline] = React.useState(data.baseline)
  if (shownBaseline !== data.baseline) {
    // Another program, or a reload, replaces what was edited here.
    setShownBaseline(data.baseline)
    setBaseline(data.baseline)
  }
  const [pending, setPending] = React.useState<string[]>([])
  const [picking, setPicking] = React.useState(false)
  const names = React.useMemo(() => new Map(data.exercises.map((exercise) => [exercise.id, exercise])), [data.exercises])
  const base = `baseline-${programId}`

  function save(key: string, change: BaselineChange, at: "soon" | "now") {
    autoSave[at](`baseline-${key}`, () => saveProgramBaseline({ programId, change }))
  }

  function saveLift(exerciseId: string, weightKg: number, reps: number, at: "soon" | "now") {
    autoSave[at](`lift-${exerciseId}`, async () => {
      const next = await changeBaselineLift({ action: "save", programId, exerciseId, weightKg, reps })
      setBaseline((current) => ({ ...current, lifts: next.lifts }))
      setPending((current) => current.filter((id) => id !== exerciseId))
    })
  }

  const liftIds = [...baseline.lifts.map((lift) => lift.exerciseId), ...pending]

  return (
    <PanelCard
      storageId="fitness-program-starting-data"
      title="Starting data"
      meta={saveStateLabel(autoSave.state) || undefined}
    >
      <section className="grid gap-4" aria-label="Body">
        <div className="grid grid-cols-2 items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`${base}-bodyweight`}>Bodyweight ({unit})</Label>
            <WeightInput
              id={`${base}-bodyweight`}
              valueKg={baseline.bodyweightKg}
              unit={unit}
              onCommit={(kg) => {
                setBaseline((current) => ({ ...current, bodyweightKg: kg }))
                save("bodyweight", { bodyweightKg: kg }, "now")
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${base}-height`}>Height (cm)</Label>
            <DecimalInput
              id={`${base}-height`}
              value={baseline.heightCm}
              min={50}
              max={260}
              what="your height"
              onValue={(value) => save("height", { heightCm: value }, "soon")}
              onCommit={(value) => save("height", { heightCm: value }, "now")}
            />
          </div>
          {MEASUREMENTS.map((measurement) => (
            <div key={measurement.key} className="grid gap-2">
              <Label htmlFor={`${base}-${measurement.key}`}>{measurement.label} (cm)</Label>
              <DecimalInput
                id={`${base}-${measurement.key}`}
                value={baseline[measurement.key]}
                min={10}
                max={250}
                what={`your ${measurement.label.toLowerCase()}`}
                onValue={(value) => save(measurement.key, { [measurement.key]: value }, "soon")}
                onCommit={(value) => save(measurement.key, { [measurement.key]: value }, "now")}
              />
            </div>
          ))}
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${base}-goal`}>What you want most</Label>
          <Select
            value={baseline.goal ?? undefined}
            onValueChange={(value) => {
              setBaseline((current) => ({ ...current, goal: value as GoalId }))
              save("goal", { goal: value }, "now")
            }}
          >
            <SelectTrigger id={`${base}-goal`} className="w-full">
              <SelectValue placeholder="Pick a goal" />
            </SelectTrigger>
            <SelectContent>
              {GOALS.map((goal) => (
                <SelectItem key={goal.id} value={goal.id}>
                  {goal.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${base}-experience`}>How long you have lifted</Label>
          <Select
            value={baseline.experience ?? undefined}
            onValueChange={(value) => {
              setBaseline((current) => ({ ...current, experience: value as ExperienceId }))
              save("experience", { experience: value }, "now")
            }}
          >
            <SelectTrigger id={`${base}-experience`} className="w-full">
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
      </section>

      <section className="grid gap-2" aria-label="Equipment you have">
        <FieldLabel hint="Exercise swaps and the AI plan only offer lifts you can do with these. Tick none and every lift is offered.">
          Equipment you have
        </FieldLabel>
        <div className="grid gap-2">
          {EQUIPMENT.filter((item) => item !== "bodyweight").map((item) => {
            const id = `${base}-equipment-${item}`
            return (
              <div key={item} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={baseline.equipment.includes(item)}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...baseline.equipment, item]
                      : baseline.equipment.filter((entry) => entry !== item)
                    setBaseline((current) => ({ ...current, equipment: next }))
                    save("equipment", { equipment: next as Equipment[] }, "now")
                  }}
                />
                <Label htmlFor={id} className="font-normal">
                  {EQUIPMENT_LABELS[item]}
                </Label>
              </div>
            )
          })}
        </div>
      </section>

      <section className="grid gap-2" aria-label="Best lifts">
        <div className="flex items-center justify-between gap-2">
          <FieldLabel hint="Templates and the AI start each lift at 75 out of 100 of the best you can lift once.">
            Best lifts
          </FieldLabel>
          <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
            <PlusIcon />
            Add lift
          </Button>
        </div>
        {liftIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add your best squat, bench or deadlift. &quot;100 kg once&quot; or &quot;80 kg for 5&quot; both work.
          </p>
        ) : (
          <ul className="grid gap-3">
            {liftIds.map((exerciseId) => {
              const saved = baseline.lifts.find((lift) => lift.exerciseId === exerciseId)
              return (
                <BestLiftRow
                  key={exerciseId}
                  exerciseId={exerciseId}
                  name={names.get(exerciseId)?.name ?? "Exercise"}
                  unit={unit}
                  savedWeightKg={saved?.weightKg ?? null}
                  savedReps={saved?.reps ?? 1}
                  onSave={(weightKg, reps, at) => saveLift(exerciseId, weightKg, reps, at)}
                  onRemove={() => {
                    if (!saved) {
                      setPending((current) => current.filter((id) => id !== exerciseId))
                      return
                    }
                    autoSave.now(`lift-${exerciseId}`, async () => {
                      const next = await changeBaselineLift({ action: "remove", programId, exerciseId })
                      setBaseline((current) => ({ ...current, lifts: next.lifts }))
                    })
                  }}
                />
              )
            })}
          </ul>
        )}
      </section>

      <ExercisePicker
        open={picking}
        onOpenChange={setPicking}
        exercises={data.exercises.filter((exercise) => !liftIds.includes(exercise.id))}
        title="Add a best lift"
        onPick={(exercise) => setPending((current) => [...current, exercise.id])}
      />
    </PanelCard>
  )
}

function BestLiftRow({
  exerciseId,
  name,
  unit,
  savedWeightKg,
  savedReps,
  onSave,
  onRemove,
}: {
  exerciseId: string
  name: string
  unit: WeightUnit
  savedWeightKg: number | null
  savedReps: number
  onSave: (weightKg: number, reps: number, at: "soon" | "now") => void
  onRemove: () => void
}) {
  const [weightKg, setWeightKg] = React.useState(savedWeightKg)
  const [reps, setReps] = React.useState(savedReps)
  const estimate = weightKg ? estimateOneRepMax(weightKg, reps) : 0
  const base = `best-${exerciseId}`

  return (
    <li className="grid gap-2 rounded-md border bg-background p-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} onClick={onRemove}>
              <Trash2Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove</TooltipContent>
        </Tooltip>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label htmlFor={`${base}-weight`} className="text-xs">
            Weight ({unit})
          </Label>
          <WeightInput
            id={`${base}-weight`}
            valueKg={weightKg}
            unit={unit}
            placeholder="Type it"
            onCommit={(kg) => {
              setWeightKg(kg)
              if (kg && kg > 0) onSave(kg, reps, "now")
            }}
          />
        </div>
        <NumberField
          id={`${base}-reps`}
          label="Reps"
          value={reps}
          min={1}
          max={50}
          labelClassName="text-xs"
          onChange={(value) => {
            setReps(value)
            if (weightKg && weightKg > 0) onSave(weightKg, value, "soon")
          }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {estimate > 0 ? (reps === 1 ? "Your one-rep max" : `About ${formatWeight(estimate, unit)} once`) : "Type the weight"}
      </span>
    </li>
  )
}
