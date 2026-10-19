import * as React from "react"

import { ImageUpload } from "@/components/shared/image-upload"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { MultiCombobox } from "@/components/ui/multi-combobox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { ExerciseDraft } from "@/components/fitness/exercises/exercise-draft"
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MOVEMENTS,
  MOVEMENT_LABELS,
  MUSCLES,
  MUSCLE_LABELS,
  type Equipment,
  type Movement,
  type Muscle,
} from "@/lib/fitness/exercise-catalog"
import { ROUTINE_TYPES, type RoutineTypeId } from "@/lib/fitness/routine-types"

const muscleByLabel = new Map(MUSCLES.map((muscle) => [MUSCLE_LABELS[muscle], muscle]))
const equipmentByLabel = new Map(EQUIPMENT.map((item) => [EQUIPMENT_LABELS[item], item]))

/**
 * The fields of a lift of the person's own, in the exercise window on the
 * Exercises dashboard. `onChange` hands back the whole draft.
 *
 * The picture uses the shell's `image-upload.tsx` on purpose: a drawing of
 * how a lift is done is not private, unlike before and after photos.
 */
export function ExerciseFields({
  draft,
  nameInvalid,
  onChange,
}: {
  draft: ExerciseDraft
  nameInvalid: boolean
  onChange: (draft: ExerciseDraft) => void
}) {
  const ids = {
    name: React.useId(),
    routineType: React.useId(),
    muscles: React.useId(),
    equipment: React.useId(),
    movement: React.useId(),
    bodyweight: React.useId(),
  }
  return (
    <>
      <div className="grid gap-2">
        <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
        <Input
          id={ids.name}
          maxLength={80}
          value={draft.name}
          aria-invalid={nameInvalid || undefined}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={ids.routineType}
          hint="A program only offers lifts of its own routine type, so a strength program lists strength lifts."
        >
          Routine type
        </FieldLabel>
        <Select value={draft.routineType} onValueChange={(value) => onChange({ ...draft, routineType: value as RoutineTypeId })}>
          <SelectTrigger id={ids.routineType}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROUTINE_TYPES.map((type) => (
              <SelectItem key={type.id} value={type.id} disabled={!type.live}>
                {type.live ? type.label : `${type.label} (coming soon)`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={ids.muscles} hint="The main muscle first. Swaps match lifts on their main muscle.">
          Muscles
        </FieldLabel>
        <MultiCombobox
          id={ids.muscles}
          value={draft.muscles.map((muscle) => MUSCLE_LABELS[muscle])}
          options={MUSCLES.map((muscle) => MUSCLE_LABELS[muscle])}
          placeholder="Pick muscles"
          onChange={(labels) =>
            onChange(
              {
                ...draft,
                muscles: labels.map((label) => muscleByLabel.get(label)).filter((muscle): muscle is Muscle => Boolean(muscle)),
              }
            )
          }
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={ids.equipment} hint="What it needs. Swaps only offer lifts whose equipment you have.">
          Equipment
        </FieldLabel>
        <MultiCombobox
          id={ids.equipment}
          value={draft.equipment.map((item) => EQUIPMENT_LABELS[item])}
          options={EQUIPMENT.map((item) => EQUIPMENT_LABELS[item])}
          placeholder="Pick equipment"
          onChange={(labels) =>
            onChange(
              {
                ...draft,
                equipment: labels
                  .map((label) => equipmentByLabel.get(label))
                  .filter((item): item is Equipment => Boolean(item)),
              }
            )
          }
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={ids.movement}>Movement</FieldLabel>
        <Select value={draft.movement} onValueChange={(value) => onChange({ ...draft, movement: value as Movement })}>
          <SelectTrigger id={ids.movement}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MOVEMENTS.map((movement) => (
              <SelectItem key={movement} value={movement}>
                {MOVEMENT_LABELS[movement]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-4">
        <FieldLabel
          htmlFor={ids.bodyweight}
          hint="Your own body is the weight, like a pull-up. A set logs your bodyweight plus anything added on a belt."
        >
          Bodyweight lift
        </FieldLabel>
        <Switch
          id={ids.bodyweight}
          checked={draft.isBodyweight}
          onCheckedChange={(isBodyweight) => onChange({ ...draft, isBodyweight })}
        />
      </div>
      <ImageUpload
        label="Picture"
        hint="A photo or drawing of the lift, to remember how it's done."
        value={draft.pictureUrl}
        aspect="square"
        onChange={(pictureUrl) => onChange({ ...draft, pictureUrl })}
        className="max-w-48"
      />
    </>
  )
}
