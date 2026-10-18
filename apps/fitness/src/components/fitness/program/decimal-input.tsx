import * as React from "react"

import { Input } from "@/components/ui/input"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * A number with decimals, such as a waist of 81.5 cm, that may be left empty.
 * Every valid value is handed to `onValue` as it is typed, so the form can
 * save 700ms later; leaving the field or pressing Enter hands it to
 * `onCommit` to save at once. A value out of range is marked and kept on
 * screen, and nothing is sent.
 */
export function DecimalInput({
  id,
  value,
  min,
  max,
  what,
  onValue,
  onCommit,
}: {
  id: string
  value: number | null
  min: number
  max: number
  /** How the toast names the field: "your waist". */
  what: string
  onValue: (value: number | null) => void
  onCommit: (value: number | null) => void
}) {
  const shown = value === null ? "" : String(Math.round(value * 10) / 10)
  const [draft, setDraft] = React.useState(shown)
  const [invalid, setInvalid] = React.useState(false)

  function read(text: string): { ok: boolean; value: number | null } {
    const clean = text.trim().replace(",", ".")
    if (clean === "") return { ok: true, value: null }
    const number = Number(clean)
    return Number.isFinite(number) && number >= min && number <= max
      ? { ok: true, value: number }
      : { ok: false, value: null }
  }

  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      value={draft}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        setDraft(event.target.value)
        const result = read(event.target.value)
        setInvalid(!result.ok)
        if (result.ok) onValue(result.value)
      }}
      onBlur={() => {
        const result = read(draft)
        if (!result.ok) {
          showErrorToast(`Type a number from ${min} to ${max} for ${what}, or leave it empty.`)
          return
        }
        onCommit(result.value)
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return
        event.preventDefault()
        const result = read(draft)
        if (result.ok) onCommit(result.value)
      }}
    />
  )
}
