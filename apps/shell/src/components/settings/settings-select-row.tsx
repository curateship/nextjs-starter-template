import * as React from "react"

import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * One pick-from-a-list setting: its label above, the dropdown under it, as wide
 * as its longest choice on a wide screen and the full width on a phone.
 *
 * Twenty settings wrote this out by hand. `options` are the stored values and
 * `optionLabel` says each one in words. A setting stored as a number converts
 * at the call, because a dropdown's values are always text.
 *
 * `children` go after the options, for a choice that is not in the list, such
 * as an uploaded font. That is also why the value may be wider than the
 * options.
 */
export function SettingsSelectRow<T extends string, O extends T = T>({
  id,
  label,
  hint,
  value,
  options,
  optionLabel,
  onValueChange,
  disabled,
  triggerClassName = "w-full sm:w-fit",
  children,
}: {
  id: string
  label: React.ReactNode
  hint?: React.ReactNode
  value: T
  options: readonly O[]
  optionLabel: (option: O) => React.ReactNode
  onValueChange: (value: T) => void
  disabled?: boolean
  triggerClassName?: string
  children?: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => onValueChange(next as T)}
      >
        <SelectTrigger id={id} className={triggerClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {optionLabel(option)}
            </SelectItem>
          ))}
          {children}
        </SelectContent>
      </Select>
    </div>
  )
}
