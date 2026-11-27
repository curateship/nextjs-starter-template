import * as React from "react"

import { PickRow } from "@/components/shared/notes/pick-rows"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * A row of a record's ⋮ holding one typed field (the Admin 3 panel design:
 * "Only typed values and whole cards use `PickRow`"): its name on the left,
 * what it holds on the right, and a small box with the field. Leaving the
 * field, or Enter in a one-line field, saves it; there is no Save button. A
 * refused save keeps what was typed, so it can be put right.
 */
export function TextPickRow({
  id,
  label,
  value,
  shown,
  placeholder,
  type,
  inputMode,
  multiline = false,
  onSave,
}: {
  id: string
  label: string
  /** What the field holds, as saved. */
  value: string
  /** What the row shows, when not the value itself: "Stored" for a password. */
  shown?: string
  placeholder?: string
  type?: "text" | "password"
  inputMode?: "numeric" | "decimal"
  multiline?: boolean
  /** Saves it, answering whether it was taken. */
  onSave: (text: string) => Promise<boolean>
}) {
  const [draft, setDraft] = React.useState(value)
  const [last, setLast] = React.useState(value)
  // A new saved value (another record, a save coming back) replaces the box's words.
  if (last !== value) {
    setLast(value)
    setDraft(value)
  }
  const saving = React.useRef(false)
  const save = async () => {
    if (saving.current || draft === value) return
    saving.current = true
    try {
      await onSave(draft)
    } finally {
      saving.current = false
    }
  }
  const words = shown ?? value
  return (
    <PickRow label={label} value={words || "None"} empty={!words}>
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        {multiline ? (
          <Textarea id={id} rows={3} value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={() => void save()} />
        ) : (
          <Input
            id={id}
            type={type}
            inputMode={inputMode}
            autoComplete={type === "password" ? "new-password" : "off"}
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void save()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void save()
              }
            }}
          />
        )}
      </div>
    </PickRow>
  )
}
