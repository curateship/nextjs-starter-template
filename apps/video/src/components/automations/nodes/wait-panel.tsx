import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type {
  AutomationNodeFieldsProps,
  AutomationNodeSettings,
} from "@/lib/automations/node-descriptor"
import {
  readWaitSettings,
  WAIT_MAX_DAYS,
  type WaitUnit,
} from "@/lib/automations/nodes/wait"

export default function WaitFields({ node, onChange }: AutomationNodeFieldsProps) {
  const { amount, unit, stopOnClick } = readWaitSettings(node.settings)
  const setSettings = (settings: AutomationNodeSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...settings } })

  return (
    <InspectorCard title="Settings">
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={`wait-${node.id}-amount`}
          className="text-xs"
          hint={`Anything from 1 hour to ${WAIT_MAX_DAYS} days.`}
        >
          Wait for
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id={`wait-${node.id}-amount`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amount > 0 ? String(amount) : ""}
            aria-invalid={amount < 1 || undefined}
            className="w-24"
            onChange={(event) => {
              const next = Number(event.target.value)
              setSettings({ amount: Number.isFinite(next) ? next : 0 })
            }}
          />
          <Select
            value={unit}
            onValueChange={(value) => setSettings({ unit: value as WaitUnit })}
          >
            <SelectTrigger
              aria-label="Hours or days"
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <FieldLabel
          htmlFor={`wait-${node.id}-stop-on-click`}
          className="text-xs"
          hint="Checked when the wait ends. Any click on any email this flow sent them counts, because every link in a sequence points at the thing it is selling."
        >
          Stop for anyone who clicked a link
        </FieldLabel>
        <Switch
          id={`wait-${node.id}-stop-on-click`}
          checked={stopOnClick}
          onCheckedChange={(checked) => setSettings({ stopOnClick: checked })}
        />
      </div>

      <InspectorNote>
        In a flow that starts with Segment, a few at a time, a wait that ends
        outside the sending hours in Settings &gt; Email carries on at the next
        hour it is allowed to send. Switching the flow off stops everyone at
        their next wait.
      </InspectorNote>
    </InspectorCard>
  )
}
