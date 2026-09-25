"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { cn } from "@/lib/utils"

/** The only hex shape the native <input type="color"> swatch accepts. */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

const INVALID_HEX_MESSAGE =
  "Enter a 6-digit hex code, like #3b82f6. The swatch shows white until you do."

type HexColorInputProps = {
  /** id for the text field, so a Label's htmlFor can point at it. */
  id?: string
  value: string
  disabled?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
  swatchAriaLabel?: string
  /** Receives full #rrggbb values only — a bad hex never leaves the field. */
  onColorChange: (color: string) => void
}

/**
 * A color swatch plus a hex text field. The field holds whatever is typed, but
 * only a full #rrggbb ever reaches `onColorChange`, so the last good color
 * stays in force while the field is wrong. Leaving the field with a bad value
 * marks it (`aria-invalid`) and reports through the shared error toast; the
 * swatch falls back to white because the native picker accepts nothing else.
 */
export function HexColorInput({
  id,
  value,
  disabled,
  placeholder = "#ffffff",
  className,
  inputClassName,
  swatchAriaLabel = "Pick a color",
  onColorChange,
}: HexColorInputProps) {
  const [draft, setDraft] = React.useState(value)
  const [invalid, setInvalid] = React.useState(false)

  // Follow outside changes (the swatch, a reload, another editor). An invalid
  // draft never propagates, so `value` changing always means news from outside.
  React.useEffect(() => {
    setDraft(value)
    setInvalid(false)
  }, [value])

  const commit = (next: string) => {
    setDraft(next)
    if (HEX_COLOR_PATTERN.test(next)) {
      // Only this field's own failure toast is dismissed — it can't exist
      // unless the field was marked invalid on blur.
      if (invalid) dismissErrorToast()
      setInvalid(false)
      if (next !== value) onColorChange(next)
    }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input
        type="color"
        value={HEX_COLOR_PATTERN.test(draft) ? draft : "#ffffff"}
        disabled={disabled}
        onChange={(event) => commit(event.target.value)}
        className="h-8 w-12 cursor-pointer rounded-md border border-border bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={swatchAriaLabel}
      />
      <Input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        className={cn("w-40", inputClassName)}
        aria-invalid={invalid || undefined}
        onChange={(event) => commit(event.target.value)}
        onBlur={() => {
          if (HEX_COLOR_PATTERN.test(draft)) return
          setInvalid(true)
          showErrorToast(INVALID_HEX_MESSAGE)
        }}
      />
    </div>
  )
}
