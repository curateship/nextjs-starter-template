import * as React from "react"
import { ListIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  automationTypeOptions,
  MAX_AUTOMATION_TYPE_LENGTH,
} from "@/lib/automations/automation-types"

const ADD_CUSTOM_VALUE = "__add_custom__"

/**
 * Preset dropdown for an Automation's trading-style category, with an
 * "Add custom…" option that swaps to a free-text field. `knownTypes` folds in
 * custom categories already used elsewhere so they show up as choices too.
 */
export function AutomationTypeSelect({
  id,
  value,
  knownTypes = [],
  disabled,
  onChange,
}: {
  id?: string
  value: string
  knownTypes?: readonly string[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const [customMode, setCustomMode] = React.useState(false)
  const options = automationTypeOptions(knownTypes, value)

  if (customMode) {
    return (
      <div className="flex items-center gap-2">
        <Input
          id={id}
          autoFocus
          maxLength={MAX_AUTOMATION_TYPE_LENGTH}
          value={value}
          placeholder="e.g. Momentum"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          disabled={disabled}
          onClick={() => setCustomMode(false)}
        >
          <ListIcon className="size-3.5" />
          List
        </Button>
      </div>
    )
  }

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next === ADD_CUSTOM_VALUE) {
          setCustomMode(true)
          return
        }
        onChange(next)
      }}
    >
      <SelectTrigger id={id} className="h-8 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={ADD_CUSTOM_VALUE}>+ Add custom…</SelectItem>
      </SelectContent>
    </Select>
  )
}
