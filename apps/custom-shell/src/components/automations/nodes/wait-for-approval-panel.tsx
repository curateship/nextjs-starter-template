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
import { Textarea } from "@/components/ui/textarea"
import type {
  AutomationNodeFieldsProps,
  AutomationNodeSettings,
} from "@/lib/automations/node-descriptor"
import {
  APPROVAL_SUMMARY_MAX,
  APPROVAL_TIMEOUT_CHOICES,
  APPROVAL_TIMEOUT_DAYS,
} from "@/lib/automations/nodes/wait-for-approval"
import { plural } from "@/lib/plural"

export default function WaitForApprovalFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const summary =
    typeof node.settings.summary === "string" ? node.settings.summary : ""
  const timeoutDays =
    typeof node.settings.timeoutDays === "number"
      ? node.settings.timeoutDays
      : APPROVAL_TIMEOUT_DAYS.default
  // A flow saved with a deadline the list no longer offers keeps it selectable,
  // so opening the node cannot silently move it to a different one.
  const timeoutChoices = APPROVAL_TIMEOUT_CHOICES.includes(
    timeoutDays as (typeof APPROVAL_TIMEOUT_CHOICES)[number]
  )
    ? [...APPROVAL_TIMEOUT_CHOICES]
    : [...APPROVAL_TIMEOUT_CHOICES, timeoutDays].sort((a, b) => a - b)

  const setSettings = (settings: AutomationNodeSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...settings } })

  return (
    <InspectorCard title="Settings">
      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`approval-${node.id}-summary`}
          className="text-xs"
          hint="The only thing the reviewer is told before they press Approve, so name the real consequence — who it reaches and how many of them."
        >
          What happens when this is approved
        </FieldLabel>
        <Textarea
          id={`approval-${node.id}-summary`}
          value={summary}
          rows={1}
          maxLength={APPROVAL_SUMMARY_MAX}
          placeholder="e.g. Sends the changelog email to every paying member."
          className="text-xs"
          onChange={(event) => setSettings({ summary: event.target.value })}
        />
      </div>

      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`approval-${node.id}-timeout`}
          className="text-xs"
          hint="Nobody answering is not the same as yes. When this many days pass with no answer, the run stops as timed out and nothing after this step happens."
        >
          Give up after
        </FieldLabel>
        <Select
          value={String(timeoutDays)}
          onValueChange={(value) => setSettings({ timeoutDays: Number(value) })}
        >
          <SelectTrigger
            id={`approval-${node.id}-timeout`}
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {timeoutChoices.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {days} {plural(days, "day", "days")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <InspectorNote>
        Nothing after this step runs until somebody approves it. Rejecting ends
        the run there, and so does the deadline passing.
      </InspectorNote>
    </InspectorCard>
  )
}
