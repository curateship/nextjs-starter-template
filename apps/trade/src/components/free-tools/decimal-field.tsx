import * as React from "react"

import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { readDecimal } from "@/lib/free-tools/money"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * A number field for the free tools that takes decimals and thousands
 * commas: "1,000", "1.27", "0.5".
 *
 * Only a value inside the limits reaches `onChange`, so the answer keeps
 * showing the last good number while the visitor fixes a typo. The typed text
 * stays on screen, the field is marked, and leaving it says what is allowed.
 * `NumberField` does the same for whole numbers.
 */
export function DecimalField({
  id,
  label,
  hint,
  value,
  min,
  max,
  unit,
  className,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: number
  min: number
  max: number
  /** "$" is drawn before the number, anything else after it. */
  unit: string
  className?: string
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = React.useState(() => String(value))
  const [lastValue, setLastValue] = React.useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    if (readDecimal(draft) !== value) setDraft(String(value))
  }

  const parsed = readDecimal(draft)
  const valid = parsed !== null && parsed >= min && parsed <= max
  const before = unit === "$"

  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      <div className="relative">
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-muted-foreground",
            before ? "left-3" : "right-3"
          )}
        >
          {unit}
        </span>
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          aria-invalid={!valid || undefined}
          className={cn("tabular-nums", before ? "pl-7" : "pr-9")}
          onChange={(event) => {
            setDraft(event.target.value)
            const next = readDecimal(event.target.value)
            if (next !== null && next >= min && next <= max) onChange(next)
          }}
          onBlur={() => {
            if (!valid) {
              showErrorToast(
                `${label} takes a number from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}. The answer still uses the last one that fit.`
              )
            }
          }}
        />
      </div>
    </div>
  )
}
