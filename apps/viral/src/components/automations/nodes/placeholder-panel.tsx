import { InspectorCard } from "@/components/automations/inspector-card"
import { FieldLabel } from "@/components/ui/field-label"
import { Textarea } from "@/components/ui/textarea"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"

export default function PlaceholderFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const note = typeof node.settings.note === "string" ? node.settings.note : ""
  return (
    <InspectorCard title="Settings">
      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`placeholder-${node.id}-note`}
          className="text-xs"
          hint="Shown as the step's description on the canvas."
        >
          Note (optional)
        </FieldLabel>
        <Textarea
          id={`placeholder-${node.id}-note`}
          value={note}
          rows={1}
          maxLength={500}
          placeholder="What should this step become?"
          className="text-xs"
          onChange={(event) =>
            onChange({
              ...node,
              settings: { ...node.settings, note: event.target.value },
            })
          }
        />
      </div>
    </InspectorCard>
  )
}
