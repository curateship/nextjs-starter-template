import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { NumberField } from "@/components/ui/number-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import {
  AUTOMATION_FREQUENCY_LABELS,
  AUTOMATION_TIMEZONES,
  AUTOMATION_WEEKDAYS,
  changeAutomationScheduleFrequency,
  changeAutomationScheduleTimezone,
  formatRunAtForTimezoneInput,
  isValidAutomationTimezone,
  readAutomationScheduleDraft,
  runAtFromTimezoneInput,
  type AutomationSchedule,
  type AutomationScheduleFrequency,
} from "@/lib/automations/schedule"

const FREQUENCIES = ["once", "daily", "weekly", "monthly"] as const

export default function TimeActivateFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const schedule = readAutomationScheduleDraft(node.settings)
  const setSchedule = (next: AutomationSchedule) =>
    onChange({ ...node, settings: { schedule: next } })

  return (
    <InspectorCard title="Settings">
      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`time-${node.id}-frequency`}
          className="text-xs"
          hint="How often this flow starts. A one-time schedule stops after its chosen moment passes."
        >
          Frequency
        </FieldLabel>
        <Select
          value={schedule.frequency}
          onValueChange={(value) =>
            setSchedule(
              changeAutomationScheduleFrequency(
                schedule,
                value as AutomationScheduleFrequency
              )
            )
          }
        >
          <SelectTrigger
            id={`time-${node.id}-frequency`}
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIES.map((frequency) => (
              <SelectItem key={frequency} value={frequency}>
                {AUTOMATION_FREQUENCY_LABELS[frequency]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {schedule.frequency === "once" ? (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`time-${node.id}-once`}
            className="text-xs"
            hint="The date and time are read in the timezone chosen below."
          >
            Run at
          </FieldLabel>
          <Input
            id={`time-${node.id}-once`}
            type="datetime-local"
            value={formatRunAtForTimezoneInput(
              schedule.runAt,
              schedule.timezone
            )}
            onChange={(event) => {
              const runAt = runAtFromTimezoneInput(
                event.target.value,
                schedule.timezone
              )
              setSchedule({
                ...schedule,
                runAt: runAt ?? event.target.value,
              })
            }}
          />
        </div>
      ) : (
        <div className="grid gap-1.5">
          <FieldLabel
            htmlFor={`time-${node.id}-clock`}
            className="text-xs"
            hint="The flow follows this wall-clock time when daylight saving changes."
          >
            Time
          </FieldLabel>
          <Input
            id={`time-${node.id}-clock`}
            type="time"
            value={schedule.time}
            onChange={(event) =>
              setSchedule({ ...schedule, time: event.target.value })
            }
          />
        </div>
      )}

      {schedule.frequency === "weekly" ? (
        <div className="grid gap-1.5">
          <FieldLabel htmlFor={`time-${node.id}-weekday`} className="text-xs">
            Weekday
          </FieldLabel>
          <Select
            value={String(schedule.dayOfWeek)}
            onValueChange={(value) =>
              setSchedule({ ...schedule, dayOfWeek: Number(value) })
            }
          >
            <SelectTrigger
              id={`time-${node.id}-weekday`}
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTOMATION_WEEKDAYS.map((day, index) => (
                <SelectItem key={day} value={String(index)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {schedule.frequency === "monthly" ? (
        <NumberField
          id={`time-${node.id}-month-day`}
          label="Day of month"
          labelClassName="text-xs"
          hint="Shorter months use their final day."
          value={schedule.dayOfMonth}
          min={1}
          max={31}
          className="gap-1.5"
          onChange={(dayOfMonth) => setSchedule({ ...schedule, dayOfMonth })}
        />
      ) : null}

      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor={`time-${node.id}-timezone`}
          className="text-xs"
          hint="Choose one of the supported timezones. This keeps 9:00 AM at 9:00 AM when clocks change."
        >
          Timezone
        </FieldLabel>
        <Select
          value={schedule.timezone}
          onValueChange={(timezone) => {
            if (isValidAutomationTimezone(timezone)) {
              setSchedule(changeAutomationScheduleTimezone(schedule, timezone))
            }
          }}
        >
          <SelectTrigger
            id={`time-${node.id}-timezone`}
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTOMATION_TIMEZONES.map((timezone) => (
              <SelectItem key={timezone} value={timezone}>
                {timezone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <InspectorNote>
        The next run is calculated when this flow is saved or turned on. Missed
        times are skipped instead of arriving in a burst later.
      </InspectorNote>
    </InspectorCard>
  )
}
