import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { ExerciseList } from "@/components/fitness/exercise-picker"
import { DecimalInput } from "@/components/fitness/program/decimal-input"
import { useAutoSave, type ProgramPageData } from "@/components/fitness/program/program-data"
import { WeightInput } from "@/components/fitness/weight-input"
import { SegmentedChoice } from "@/components/fitness/segmented-choice"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { changeBaselineLift, saveProgramBaseline, type Baseline } from "@/lib/api/fitness/programs"
import { EQUIPMENT, EQUIPMENT_LABELS, type Equipment } from "@/lib/fitness/exercise-catalog"
import { GOALS, MEASUREMENTS, type ExperienceId } from "@/lib/fitness/templates"
import { estimateOneRepMax, formatWeight, type WeightUnit } from "@/lib/fitness/weights"

type BaselineChange = Parameters<typeof saveProgramBaseline>[0]["change"]

/**
 * The program's starting data, as a card in the program's settings window,
 * laid out the way Tyler drew it on 18 Oct 2026: a summary line under
 * the heading, then Body and Training, each field with its unit inside the
 * box and each choice as a segmented row. It saves as it is typed, with no
 * Save button.
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

  const summary = [
    baseline.bodyweightKg ? formatWeight(baseline.bodyweightKg, unit) : null,
    baseline.heightCm ? `${Math.round(baseline.heightCm)} cm` : null,
    GOALS.find((goal) => goal.id === baseline.goal)?.label ?? null,
  ].filter(Boolean)

  return (
    <CollapsibleSettingsCard
      storageId="fitness-program-starting-data"
      title="Starting data"
      description={summary.join(" · ") || "Nothing filled in yet"}
      size="sm"
      contentClassName="grid gap-4"
    >
      {/* An archived program can't change, so its fields only show what it holds; the card still folds. */}
      <fieldset disabled={data.program.archived} className="contents">
      <section className="grid gap-3" aria-labelledby={`${base}-body`}>
        <SectionLabel id={`${base}-body`}>Body</SectionLabel>
        <div className="grid grid-cols-2 items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`${base}-bodyweight`}>Bodyweight</Label>
            <WeightInput
              id={`${base}-bodyweight`}
              valueKg={baseline.bodyweightKg}
              unit={unit}
              showUnit
              placeholder={"\u2013"}
              onCommit={(kg) => {
                setBaseline((current) => ({ ...current, bodyweightKg: kg }))
                save("bodyweight", { bodyweightKg: kg }, "now")
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${base}-height`}>Height</Label>
            <DecimalInput
              id={`${base}-height`}
              value={baseline.heightCm}
              min={50}
              max={260}
              unit="cm"
              what="your height"
              onValue={(value) => {
                setBaseline((current) => ({ ...current, heightCm: value }))
                save("height", { heightCm: value }, "soon")
              }}
              onCommit={(value) => save("height", { heightCm: value }, "now")}
            />
          </div>
          {MEASUREMENTS.map((measurement) => (
            <div key={measurement.key} className="grid gap-2">
              <Label htmlFor={`${base}-${measurement.key}`}>{measurement.label}</Label>
              <DecimalInput
                id={`${base}-${measurement.key}`}
                value={baseline[measurement.key]}
                min={10}
                max={250}
                unit="cm"
                what={`your ${measurement.label.toLowerCase()}`}
                onValue={(value) => save(measurement.key, { [measurement.key]: value }, "soon")}
                onCommit={(value) => save(measurement.key, { [measurement.key]: value }, "now")}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby={`${base}-training`}>
        <SectionLabel id={`${base}-training`}>Training</SectionLabel>
        <div className="grid gap-2">
          <Label id={`${base}-goal`}>What you want most</Label>
          <SegmentedChoice
            label="What you want most"
            value={baseline.goal}
            options={GOAL_CHOICES}
            className="grid h-auto grid-cols-2 gap-0.5"
            onChange={(goal) => {
              setBaseline((current) => ({ ...current, goal }))
              save("goal", { goal }, "now")
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label id={`${base}-experience`}>How long you have lifted</Label>
          <SegmentedChoice
            label="How long you have lifted"
            value={baseline.experience}
            options={EXPERIENCE_CHOICES}
            onChange={(experience) => {
              setBaseline((current) => ({ ...current, experience }))
              save("experience", { experience }, "now")
            }}
          />
        </div>
      </section>

      <section className="grid gap-2" aria-labelledby={`${base}-equipment`}>
        <SectionLabel
          id={`${base}-equipment`}
          hint="Exercise swaps and the AI plan only offer lifts you can do with these. Tick none and every lift is offered."
        >
          Equipment you have
        </SectionLabel>
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

      {/* A Calisthenics move counts no weight, so there are no best lifts to start from. */}
      {data.program.routineType === "calisthenics" ? null : (
        <section className="grid gap-2" aria-labelledby={`${base}-lifts`}>
          <div className="flex items-center justify-between gap-2">
            <SectionLabel
              id={`${base}-lifts`}
              hint="Templates and the AI start each lift at 75 out of 100 of the best you can lift once."
            >
              Best lifts
            </SectionLabel>
            {/* A dropdown, not a window: this sits inside the settings window already. */}
            <Popover open={picking} onOpenChange={setPicking}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <PlusIcon />
                  Add lift
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3" aria-label="Add a best lift">
                <ExerciseList
                  compact
                  exercises={data.exercises.filter((exercise) => !liftIds.includes(exercise.id))}
                  onPick={(exercise) => {
                    setPending((current) => [...current, exercise.id])
                    setPicking(false)
                  }}
                />
              </PopoverContent>
            </Popover>
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
      )}
      </fieldset>
    </CollapsibleSettingsCard>
  )
}

/** The goals in the order Tyler drew them, then the one his drawing had no room for. */
const GOAL_CHOICES = (["muscle", "strength", "fat_loss", "general"] as const).map((id) => ({
  value: id,
  label: GOALS.find((goal) => goal.id === id)!.label,
}))

/** Short enough for three to sit side by side in the dropdown. */
const EXPERIENCE_CHOICES: { value: ExperienceId; label: string }[] = [
  { value: "beginner", label: "Under a year" },
  { value: "intermediate", label: "1 to 3 years" },
  { value: "advanced", label: "Over 3 years" },
]

/** "BODY", "TRAINING": a quiet heading over a group of fields. */
function SectionLabel({ id, hint, children }: { id: string; hint?: string; children: React.ReactNode }) {
  const text = (
    <span id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  )
  return hint ? <FieldLabel hint={hint}>{text}</FieldLabel> : text
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
