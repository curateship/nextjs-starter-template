import * as React from "react"

import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * A whole-number field that can stay empty or invalid while it is being edited.
 *
 * Only a value inside the supplied limits is passed to `onChange`. Invalid text
 * stays on screen, the field is marked, and leaving it explains that the last
 * valid value remains in use. This preserves what was typed instead of snapping
 * to zero, a limit, or an older value midway through a correction.
 */
export function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  disabled,
  className,
  labelClassName,
  inputClassName,
  onChange,
  onCommit,
}: {
  id: string
  label: string
  hint?: string
  value: number
  min: number
  max: number
  disabled?: boolean
  className?: string
  labelClassName?: string
  inputClassName?: string
  onChange: (value: number) => void
  onCommit?: () => void
}) {
  const [draft, setDraft] = React.useState(String(value))
  const [lastValue, setLastValue] = React.useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(String(value))
  }

  const parsed = Number(draft)
  const valid =
    draft.trim() !== "" &&
    Number.isInteger(parsed) &&
    parsed >= min &&
    parsed <= max

  return (
    <div className={cn("grid gap-2", className)}>
      <FieldLabel htmlFor={id} hint={hint} className={labelClassName}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        className={inputClassName}
        aria-invalid={!valid || undefined}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          const nextNumber = Number(next)
          if (
            next.trim() &&
            Number.isInteger(nextNumber) &&
            nextNumber >= min &&
            nextNumber <= max
          ) {
            onChange(nextNumber)
          }
        }}
        onBlur={() => {
          if (!valid) {
            showErrorToast(
              `Enter a whole number from ${min} to ${max} for ${label}. The last valid value is still in use.`
            )
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && valid) onCommit?.()
        }}
      />
    </div>
  )
}
