import * as React from "react"

import { Input } from "@/components/ui/input"
import { showErrorToast } from "@/lib/toast/error-toast"
import { formatWeightNumber, fromKg, toKg, type WeightUnit } from "@/lib/fitness/weights"

/**
 * A weight typed in the person's own unit and handed back in kilograms.
 *
 * It keeps whatever is typed while it is typed, and only reports a value when
 * the field is left or Enter is pressed. Empty reports null. Anything that
 * isn't a number between 0 and 1000 kg is marked, kept on screen and refused
 * with a toast, so a half-typed "8" never saves as 8 kg.
 */
export function WeightInput({
  id,
  valueKg,
  unit,
  onCommit,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string
  valueKg: number | null
  unit: WeightUnit
  onCommit: (kg: number | null) => void
  placeholder?: string
  className?: string
  "aria-label"?: string
}) {
  const shown = valueKg === null ? "" : formatWeightNumber(valueKg, unit)
  const [draft, setDraft] = React.useState(shown)
  const [lastShown, setLastShown] = React.useState(shown)
  if (shown !== lastShown) {
    setLastShown(shown)
    setDraft(shown)
  }
  const [invalid, setInvalid] = React.useState(false)

  function commit() {
    const text = draft.trim().replace(",", ".")
    if (text === shown) return
    if (text === "") {
      setInvalid(false)
      onCommit(null)
      return
    }
    const value = Number(text)
    const kg = toKg(value, unit)
    if (!Number.isFinite(value) || value < 0 || kg > 1000) {
      setInvalid(true)
      showErrorToast(`Type a weight between 0 and ${Math.round(fromKg(1000, unit))} ${unit}.`)
      return
    }
    setInvalid(false)
    onCommit(kg)
  }

  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      className={className}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          commit()
        }
      }}
    />
  )
}
