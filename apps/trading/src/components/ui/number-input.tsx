import { useState, type ComponentProps } from "react"

import { Input } from "@/components/ui/input"

/**
 * A number box you can actually empty.
 *
 * A plain controlled `<Input type="number" value={someNumber}>` snaps straight
 * back to "0" the instant you clear it: `Number("")` is 0, that 0 goes up to the
 * state, and it comes back down as the box's value before the next keystroke —
 * so the old number can never be replaced by typing over it. Every number field
 * in the app hit this.
 *
 * This keeps the typed TEXT locally while the box is being edited and only sends
 * a number up when that text is one. Clearing it leaves it blank and sends
 * nothing; leaving the box drops the draft, so a field abandoned while blank
 * shows its saved value again rather than silently becoming zero.
 *
 * Use this instead of `<Input type="number">` anywhere the value is a number.
 * A field that stores "" for "unset" can keep using a plain Input — it already
 * clears correctly, because its value is a string all the way down.
 */
export function NumberInput({
  value,
  onValueChange,
  onBlur,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number
  onValueChange: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <Input
      {...props}
      type="number"
      value={draft ?? String(value)}
      onChange={(event) => {
        const text = event.target.value
        setDraft(text)
        const next = Number(text)
        if (text.trim() !== "" && Number.isFinite(next)) onValueChange(next)
      }}
      onBlur={(event) => {
        setDraft(null)
        onBlur?.(event)
      }}
    />
  )
}
