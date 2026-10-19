import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { PanelCard } from "@/components/fitness/panel-card"
import { calendarChanged } from "@/components/fitness/program/calendar-version"
import { useAutoSave, type ProgramPageData } from "@/components/fitness/program/program-data"
import { WeightInput } from "@/components/fitness/weight-input"
import { FieldLabel } from "@/components/ui/field-label"
import { NumberField } from "@/components/ui/number-field"
import { Switch } from "@/components/ui/switch"
import { saveStrengthRules, type StrengthSettings as Program } from "@/lib/api/fitness/programs"
import { formatWeight } from "@/lib/fitness/weights"

type StrengthSettingsChange = Parameters<typeof saveStrengthRules>[0]["change"]

/**
 * The program's own rules, as two cards in the right panel: how the weights
 * move after each session, and the training blocks with their lighter weeks.
 * Which weekdays are workouts is the week itself, on the left.
 * Everything saves as it changes; a save that fails says so in a toast.
 */
export function StrengthSettings({ data }: { data: ProgramPageData }) {
  const router = useRouter()
  const autoSave = useAutoSave()
  const unit = data.preferences.unit
  const [strength, setStrength] = React.useState<Program>(data.strength)
  const [shownStrength, setShownStrength] = React.useState(data.strength)
  if (shownStrength !== data.strength) {
    // Another program, or a reload, replaces what was edited here.
    setShownStrength(data.strength)
    setStrength(data.strength)
  }

  function save(key: string, change: StrengthSettingsChange, at: "soon" | "now", relay = false) {
    setStrength((current) => ({ ...current, ...change }))
    autoSave[at](`strength-${key}`, async () => {
      await saveStrengthRules({ programId: data.program.id, change })
      if (relay) {
        calendarChanged()
        await router.invalidate()
      }
    })
  }

  const dropExample = Math.round(100 * (1 - strength.dropPercent / 100) * 10) / 10
  const base = `strength-${data.program.id}`

  return (
    <>
      <PanelCard storageId="fitness-program-weight-rules" title="Weight rules">
        <div className="flex items-center gap-3">
          <Switch
            id={`${base}-auto`}
            checked={strength.autoIncrease}
            onCheckedChange={(checked) => save("auto", { autoIncrease: checked }, "now")}
          />
          <FieldLabel
            htmlFor={`${base}-auto`}
            hint="After each workout the next session's weight is set for you. You can always type a different weight."
          >
            Change weights automatically
          </FieldLabel>
        </div>
        {strength.autoIncrease ? (
          <>
            <div className="grid gap-2">
              <FieldLabel
                htmlFor={`${base}-increase`}
                hint={`Hit every rep of every set and the next session adds this. A 100 kg squat becomes ${formatWeight(100 + strength.increaseKg, unit)}.`}
              >
                Add after a good session ({unit})
              </FieldLabel>
              <WeightInput
                id={`${base}-increase`}
                valueKg={strength.increaseKg}
                unit={unit}
                onCommit={(kg) => save("increase", { increaseKg: kg ?? 0 }, "now")}
              />
            </div>
            <NumberField
              id={`${base}-misses`}
              label="Missed sessions before a drop"
              hint="Sessions in a row where reps were missed before the weight comes down."
              value={strength.missesBeforeDrop}
              min={1}
              max={10}
              onChange={(value) => save("misses", { missesBeforeDrop: value }, "soon")}
              onCommit={() => save("misses", { missesBeforeDrop: strength.missesBeforeDrop }, "now")}
            />
            <NumberField
              id={`${base}-drop`}
              label="Drop, out of 100"
              hint={`How much a drop takes off. At ${strength.dropPercent}, a 100 kg squat missed ${strength.missesBeforeDrop} times in a row drops to ${dropExample} kg, rounded to your plates.`}
              value={strength.dropPercent}
              min={0}
              max={50}
              onChange={(value) => save("drop", { dropPercent: value }, "soon")}
              onCommit={() => save("drop", { dropPercent: strength.dropPercent }, "now")}
            />
          </>
        ) : null}
      </PanelCard>

      <PanelCard storageId="fitness-program-training-blocks" title="Training blocks">
        <NumberField
          id={`${base}-block`}
          label="Weeks in a block, 0 for none"
          hint="With 4, every fourth week is lighter so your body recovers, then the next block carries on from where the weights were. Weights don't go up in a light week."
          value={strength.blockWeeks}
          min={0}
          max={12}
          onChange={(value) => save("block", { blockWeeks: value }, "soon", true)}
          onCommit={() => save("block", { blockWeeks: strength.blockWeeks }, "now", true)}
        />
        {strength.blockWeeks >= 2 ? (
          <NumberField
            id={`${base}-light`}
            label="Light week, out of 100"
            hint={`The light week lifts this share of the usual weight. At ${strength.lightWeekPercent}, a 100 kg squat is ${strength.lightWeekPercent} kg that week.`}
            value={strength.lightWeekPercent}
            min={30}
            max={100}
            onChange={(value) => save("light", { lightWeekPercent: value }, "soon")}
            onCommit={() => save("light", { lightWeekPercent: strength.lightWeekPercent }, "now")}
          />
        ) : null}
      </PanelCard>
    </>
  )
}
