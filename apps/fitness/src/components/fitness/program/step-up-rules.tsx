import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { useAutoSave, type ProgramPageData } from "@/components/fitness/program/program-data"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { FieldLabel } from "@/components/ui/field-label"
import { NumberField } from "@/components/ui/number-field"
import { Switch } from "@/components/ui/switch"
import { saveStepUpRules, type CalisthenicsSettings } from "@/lib/api/fitness/programs"

/**
 * A Calisthenics program's own rules, in place of Weight rules and Training
 * blocks, which only mean something with weights (Tyler, 21 Oct 2026: "Reps,
 * then the next version"). Whether a move steps up to its harder version by
 * itself, and after how many good sessions in a row. Everything saves as it
 * changes.
 */
export function StepUpRules({ data }: { data: ProgramPageData }) {
  const router = useRouter()
  const autoSave = useAutoSave()
  const [rules, setRules] = React.useState<CalisthenicsSettings>(data.calisthenics)
  const [shownRules, setShownRules] = React.useState(data.calisthenics)
  if (shownRules !== data.calisthenics) {
    setShownRules(data.calisthenics)
    setRules(data.calisthenics)
  }
  const base = `step-up-${data.program.id}`

  function save(change: Partial<CalisthenicsSettings>, at: "soon" | "now") {
    setRules((current) => ({ ...current, ...change }))
    autoSave[at]("step-up", async () => {
      await saveStepUpRules({ programId: data.program.id, change })
      await router.invalidate()
    })
  }

  return (
    <CollapsibleSettingsCard storageId="fitness-program-step-up" title="Step-up rules" size="sm" contentClassName="grid gap-4">
      <fieldset disabled={data.program.archived} className="contents">
        <div className="flex items-center gap-3">
          <Switch
            id={`${base}-auto`}
            checked={rules.autoStepUp}
            onCheckedChange={(autoStepUp) => save({ autoStepUp }, "now")}
          />
          <FieldLabel
            htmlFor={`${base}-auto`}
            hint="Hit the top of a move's range on every set and the next session moves to its harder version, from the bottom of the range: knee push-ups to push-ups."
          >
            Step up to the harder version by itself
          </FieldLabel>
        </div>
        {rules.autoStepUp ? (
          <NumberField
            id={`${base}-sessions`}
            label="Good sessions in a row before stepping up"
            hint="1 steps up after the first session with every set at the top of the range."
            value={rules.sessionsToStep}
            min={1}
            max={5}
            onChange={(sessionsToStep) => save({ sessionsToStep }, "soon")}
            onCommit={() => save({ sessionsToStep: rules.sessionsToStep }, "now")}
          />
        ) : null}
      </fieldset>
    </CollapsibleSettingsCard>
  )
}
