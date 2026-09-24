import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  describeDripSchedule,
  DRIP_TIMEZONE_OPTIONS,
  type DripConfig,
  type DripWindow,
} from "@/lib/broadcasts/drip"

/** What a freshly ticked "only certain hours" starts with: one morning window. */
const FIRST_WINDOW: DripWindow = { start: "08:00", end: "13:00" }
const SECOND_WINDOW: DripWindow = { start: "19:00", end: "21:00" }

/**
 * The drip sending fields, in one place because they appear twice: as the
 * workspace default in Settings → Email, and again on the newsletter itself in
 * Review and send. Two copies of this form would drift in wording within a
 * month.
 *
 * Purely controlled — it holds no config of its own, so whichever screen is
 * using it decides what saving means.
 */
export function DripSettingsFields({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: DripConfig
  onChange: (next: DripConfig) => void
  disabled?: boolean
  idPrefix: string
}) {
  const id = (name: string) => `${idPrefix}-${name}`
  const set = (changes: Partial<DripConfig>) =>
    onChange({ ...value, ...changes })

  const setWindow = (index: number, changes: Partial<DripWindow>) => {
    set({
      windows: value.windows.map((window, position) =>
        position === index ? { ...window, ...changes } : window
      ),
    })
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id("enabled")}
          checked={value.enabled}
          disabled={disabled}
          // Only `enabled` changes. Wiping the rest would mean coming back to
          // empty boxes after a change of mind, which is exactly the trap the
          // directory app fell into.
          onCheckedChange={(checked) => set({ enabled: checked === true })}
        />
        <Label htmlFor={id("enabled")} className="font-normal">
          Send it in batches instead of all at once
        </Label>
      </div>

      {value.enabled ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <NumberField
              id={id("batch-min")}
              label="People per batch, fewest"
              hint="Each batch picks a number between these two, so the size varies instead of being identical every time."
              value={value.batchSizeMin}
              min={1}
              max={10_000}
              disabled={disabled}
              className="sm:flex-1"
              onChange={(batchSizeMin) => set({ batchSizeMin })}
            />
            <NumberField
              id={id("batch-max")}
              label="Most"
              hint="The largest a single batch may be. Keep it above the smallest, or the settings will not save."
              value={value.batchSizeMax}
              min={1}
              max={10_000}
              disabled={disabled}
              className="sm:flex-1"
              onChange={(batchSizeMax) => set({ batchSizeMax })}
            />
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <NumberField
              id={id("wait-min")}
              label="Minutes between batches, fewest"
              hint="How long to wait before the next batch. A number between these two is picked each time."
              value={value.waitMinMinutes}
              min={1}
              max={1440}
              disabled={disabled}
              className="sm:flex-1"
              onChange={(waitMinMinutes) => set({ waitMinMinutes })}
            />
            <NumberField
              id={id("wait-max")}
              label="Most"
              hint="The longest gap between two batches, in minutes. A day at the very most."
              value={value.waitMaxMinutes}
              min={1}
              max={1440}
              disabled={disabled}
              className="sm:flex-1"
              onChange={(waitMaxMinutes) => set({ waitMaxMinutes })}
            />
          </div>

          <div className="sm:max-w-64">
            <NumberField
              id={id("bounce")}
              label="Stop if this many out of 100 bounce"
              hint="A bounce means the address does not exist. Too many and the mail servers start treating everything you send as junk, so the newsletter stops itself and tells you. It waits until at least 20 have gone out before judging."
              value={value.bounceThresholdPercent}
              min={1}
              max={100}
              disabled={disabled}
              onChange={(bounceThresholdPercent) =>
                set({ bounceThresholdPercent })
              }
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id={id("weekends")}
              checked={value.skipWeekends}
              disabled={disabled}
              onCheckedChange={(checked) =>
                set({ skipWeekends: checked === true })
              }
            />
            <Label htmlFor={id("weekends")} className="font-normal">
              Do not send at weekends
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id={id("hours")}
              checked={value.windows.length > 0}
              disabled={disabled}
              onCheckedChange={(checked) =>
                set({ windows: checked === true ? [FIRST_WINDOW] : [] })
              }
            />
            <Label htmlFor={id("hours")} className="font-normal">
              Only send during certain hours
            </Label>
          </div>

          {value.windows.length > 0 ? (
            <>
              {value.windows.map((window, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-4 sm:flex-row sm:items-end"
                >
                  <div className="grid gap-2 sm:flex-1">
                    <FieldLabel
                      htmlFor={id(`start-${index}`)}
                      hint="Your own 24-hour clock in the timezone below. A start later than the end runs overnight — 10pm to 2am is a valid stretch."
                    >
                      {index === 0 ? "From" : "And from"}
                    </FieldLabel>
                    <Input
                      id={id(`start-${index}`)}
                      type="time"
                      value={window.start}
                      disabled={disabled}
                      onChange={(event) =>
                        setWindow(index, { start: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2 sm:flex-1">
                    <FieldLabel htmlFor={id(`end-${index}`)}>Until</FieldLabel>
                    <Input
                      id={id(`end-${index}`)}
                      type="time"
                      value={window.end}
                      disabled={disabled}
                      onChange={(event) =>
                        setWindow(index, { end: event.target.value })
                      }
                    />
                  </div>
                  {index > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove this stretch of hours"
                      disabled={disabled}
                      onClick={() =>
                        set({
                          windows: value.windows.filter(
                            (_, position) => position !== index
                          ),
                        })
                      }
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  ) : null}
                </div>
              ))}

              {/* Two is the limit: a morning stretch and an evening one covers
                  what anybody has actually asked for, and every extra one is
                  another thing to get wrong. */}
              {value.windows.length < 2 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-self-start"
                  disabled={disabled}
                  onClick={() => set({ windows: [...value.windows, SECOND_WINDOW] })}
                >
                  <PlusIcon className="size-4" />
                  Add another stretch
                </Button>
              ) : null}

              <div className="grid gap-2">
                <FieldLabel
                  htmlFor={id("timezone")}
                  hint="The hours above are read in this timezone, and it follows the clocks changing on its own."
                >
                  Timezone
                </FieldLabel>
                <Select
                  value={value.timezone}
                  disabled={disabled}
                  onValueChange={(timezone) => set({ timezone })}
                >
                  <SelectTrigger id={id("timezone")} className="w-full sm:w-fit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DRIP_TIMEZONE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    {/* A workspace elsewhere in the world keeps the zone it
                        saved, rather than being silently moved to Eastern. */}
                    {DRIP_TIMEZONE_OPTIONS.some(
                      (option) => option.value === value.timezone
                    ) ? null : (
                      <SelectItem value={value.timezone}>
                        {value.timezone}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {/* The numbers above are abstract on their own; this is the sentence they
          add up to, so a mistake is obvious before it is saved. */}
      <p role="status" className="text-sm text-muted-foreground">
        {describeDripSchedule(value)}
      </p>
    </div>
  )
}
