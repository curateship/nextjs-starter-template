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
  BILLING_MOMENTS,
  BILLING_MOMENT_HINTS,
  BILLING_MOMENT_LABELS,
  readBillingMoment,
  readTrialDaysBefore,
  TRIAL_ENDING_CHOICES,
} from "@/lib/automations/nodes/billing-moment"
import { plural } from "@/lib/format/plural"

export default function BillingMomentFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const moment = readBillingMoment(node.settings) ?? "paymentFailed"
  const daysBefore = readTrialDaysBefore(node.settings)
  // A flow saved with a number the list no longer offers keeps it selectable,
  // so opening the node cannot silently move it to a different one.
  const dayChoices = TRIAL_ENDING_CHOICES.includes(
    daysBefore as (typeof TRIAL_ENDING_CHOICES)[number]
  )
    ? [...TRIAL_ENDING_CHOICES]
    : [...TRIAL_ENDING_CHOICES, daysBefore].sort((a, b) => a - b)

  const setSettings = (settings: AutomationNodeSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...settings } })

  return (
    <InspectorCard title="Settings">
      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`billing-moment-${node.id}-moment`}
          className="text-xs"
          hint="Which money moment starts this flow. The member it happened to is who the rest of the flow is about."
        >
          Start this flow when
        </FieldLabel>
        <Select
          value={moment}
          onValueChange={(value) => setSettings({ moment: value })}
        >
          <SelectTrigger
            id={`billing-moment-${node.id}-moment`}
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BILLING_MOMENTS.map((choice) => (
              <SelectItem key={choice} value={choice}>
                {BILLING_MOMENT_LABELS[choice]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Only the trial has anything to set. The other two are a comparison the
          app can already make, so asking for a number would be asking somebody
          to guess at something we know. */}
      {moment === "trialEnding" ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`billing-moment-${node.id}-days`}
            className="text-xs"
            hint="How much warning the member gets. A trial already inside this window when you switch the flow on starts straight away."
          >
            When the trial has this long left
          </FieldLabel>
          <Select
            value={String(daysBefore)}
            onValueChange={(value) =>
              setSettings({ daysBefore: Number(value) })
            }
          >
            <SelectTrigger
              id={`billing-moment-${node.id}-days`}
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dayChoices.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {days} {plural(days, "day", "days")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <InspectorNote>{BILLING_MOMENT_HINTS[moment]}</InspectorNote>
    </InspectorCard>
  )
}
