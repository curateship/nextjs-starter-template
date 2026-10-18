import * as React from "react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { showErrorToast } from "@/lib/toast/error-toast"

/** Whole reps typed with the number pad, reported when the field is left or Enter is pressed. */
export function RepsInput({
  id,
  label,
  value,
  placeholder,
  onCommit,
}: {
  id: string
  label: string
  value: number | null
  placeholder?: string
  onCommit: (reps: number | null) => void
}) {
  const shown = value === null ? "" : String(value)
  const [draft, setDraft] = React.useState(shown)
  const [lastShown, setLastShown] = React.useState(shown)
  if (shown !== lastShown) {
    setLastShown(shown)
    setDraft(shown)
  }
  const [invalid, setInvalid] = React.useState(false)

  function commit() {
    const text = draft.trim()
    if (text === shown) return
    if (text === "") {
      setInvalid(false)
      onCommit(null)
      return
    }
    const reps = Number(text)
    if (!Number.isInteger(reps) || reps < 0 || reps > 1000) {
      setInvalid(true)
      showErrorToast("Type the reps as a whole number.")
      return
    }
    setInvalid(false)
    onCommit(reps)
  }

  return (
    <Input
      id={id}
      aria-label={label}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={draft}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
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

/** A note that saves when the field is left, not on every key. */
export function NoteField({
  id,
  label,
  value,
  placeholder,
  maxLength = 500,
  onCommit,
}: {
  id: string
  label: string
  value: string
  placeholder?: string
  maxLength?: number
  onCommit: (note: string) => void
}) {
  const [draft, setDraft] = React.useState(value)
  const [lastValue, setLastValue] = React.useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  return (
    <Textarea
      id={id}
      aria-label={label}
      rows={1}
      maxLength={maxLength}
      value={draft}
      placeholder={placeholder ?? "How did it feel?"}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft)
      }}
    />
  )
}
