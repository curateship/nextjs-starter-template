import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  AutomationNodeFieldsProps,
  AutomationNodeSettings,
} from "@/lib/automations/node-descriptor"
import {
  MEMBER_EVENTS,
  MEMBER_EVENT_HINTS,
  MEMBER_EVENT_LABELS,
  readMemberEvent,
} from "@/lib/automations/nodes/member-event"

export default function MemberEventFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const event = readMemberEvent(node.settings) ?? "registered"
  const setSettings = (settings: AutomationNodeSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...settings } })

  return (
    <InspectorCard title="Settings">
      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`member-event-${node.id}-event`}
          className="text-xs"
          hint="Which member change starts this flow. The member it happened to is who the rest of the flow is about."
        >
          Start this flow when
        </FieldLabel>
        <Select
          value={event}
          onValueChange={(value) => setSettings({ event: value })}
        >
          <SelectTrigger
            id={`member-event-${node.id}-event`}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEMBER_EVENTS.map((choice) => (
              <SelectItem key={choice} value={choice}>
                {MEMBER_EVENT_LABELS[choice]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <InspectorNote>{MEMBER_EVENT_HINTS[event]}</InspectorNote>
    </InspectorCard>
  )
}
