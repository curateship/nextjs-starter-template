import { SlidersHorizontalIcon } from "lucide-react"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { DripSettingsFields } from "@/components/shared/drip-settings-fields"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import { draftDripStep, dripStepSettings } from "@/lib/automations/nodes/drip"

/**
 * The Drip step's pace: the same fields as a newsletter's, without the on/off
 * box, since a Drip step always lets people through a batch at a time.
 * Settings that contradict each other show as the step's error on the canvas,
 * as every step's do, rather than as a toast.
 */
export default function DripFields({ node, onChange }: AutomationNodeFieldsProps) {
  return (
    <InspectorCard icon={<SlidersHorizontalIcon />} title="Settings">
      <DripSettingsFields
        alwaysOn
        idPrefix={`drip-${node.id}`}
        value={draftDripStep(node.settings)}
        onChange={(pace) =>
          onChange({ ...node, settings: dripStepSettings(pace) })
        }
      />
      <InspectorNote>
        Everyone who reaches this step waits here and goes on with the next
        batch. A change here reaches people let in after it; people already in
        the flow keep the pace they started with. Switching the flow off stops
        everyone still waiting.
      </InspectorNote>
    </InspectorCard>
  )
}
