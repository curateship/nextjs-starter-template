import * as React from "react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

/**
 * A text field that saves itself: when it is left, or on Enter, if the text
 * changed. A refused save keeps what was typed and the error toast says why
 * (UI standard, "Settings"). Escape puts back the saved text.
 */
export function SavingInput({
  value,
  onSave,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur" | "defaultValue"> & {
  value: string
  /** Resolves false when the save was refused, so the typed text stays. */
  onSave: (next: string) => Promise<boolean>
}) {
  const [draft, setDraft] = React.useState(value)
  const [saved, setSaved] = React.useState(value)
  // A new value from the server (another field's save, a reload) replaces an untouched draft.
  if (value !== saved) {
    setSaved(value)
    setDraft(value)
  }
  // Enter then leaving the field is one save, not two.
  const pending = React.useRef(false)
  async function commit() {
    if (draft === value || pending.current) return
    pending.current = true
    try {
      await onSave(draft)
    } finally {
      pending.current = false
    }
  }
  return (
    <Input
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        props.onKeyDown?.(event)
        if (event.key === "Enter") {
          event.preventDefault()
          void commit()
        }
        if (event.key === "Escape" && draft !== value) {
          event.preventDefault()
          event.stopPropagation()
          setDraft(value)
        }
      }}
    />
  )
}

/** The same for a few lines of text. Enter makes a new line; leaving the box saves. */
export function SavingTextarea({
  value,
  onSave,
  ...props
}: Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange" | "onBlur" | "defaultValue"> & {
  value: string
  onSave: (next: string) => Promise<boolean>
}) {
  const [draft, setDraft] = React.useState(value)
  const [saved, setSaved] = React.useState(value)
  if (value !== saved) {
    setSaved(value)
    setDraft(value)
  }
  return (
    <Textarea
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) void onSave(draft)
      }}
    />
  )
}
