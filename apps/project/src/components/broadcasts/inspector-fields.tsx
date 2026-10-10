import * as React from "react"

import { InspectorCard as SharedInspectorCard } from "@/components/shared/inspector-card"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

/**
 * The parts the newsletter's options panel is built from.
 *
 * Its own set rather than the automation inspector's: this panel is read while
 * looking at a page of type, so it is quieter and more spaced out than a panel
 * read while looking at a flow chart. Everything here is presentation — the
 * remembered open/shut state underneath is the same one every settings card in
 * the app uses.
 */

/**
 * Names this family in the remembered open/shut state, and builds the key the
 * same way it always did, so a card somebody had shut stays shut. Plain
 * characters only: the script that keeps a shut card shut before the first
 * paint skips any key it does not recognise on sight.
 */
const CARD_SCOPE = "broadcast-block"

function cardStorageId(title: string) {
  return `${CARD_SCOPE}-${title.toLowerCase().replace(/[^\w-]+/g, "-")}`
}

/**
 * This panel's card, which is the shared one with this panel's own storage
 * scope filled in. The component moved to `shared/` on 5 Oct 2026, when the
 * front page editor's panel became the second to use it; the key is still
 * built the same way, so a card somebody had shut stays shut.
 */
export function InspectorCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <SharedInspectorCard
      storageId={cardStorageId(title)}
      title={title}
      description={description}
    >
      {children}
    </SharedInspectorCard>
  )
}

/** A field's name, in the one size and weight every field here uses. */
export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className="text-[15px] font-medium">
      {children}
    </label>
  )
}

/**
 * A number you set by dragging, with the value sitting at the end of its own
 * label. A box you type a number into makes you guess what looks right and then
 * look over at the email to check; dragging shows you as you go.
 */
export function SliderField({
  id,
  label,
  value,
  min,
  max,
  unit = "px",
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  unit?: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className="grid gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <span className="text-[15px] text-muted-foreground tabular-nums">
          {value}
          <span className="ml-1 text-muted-foreground/60">{unit}</span>
        </span>
      </div>
      <Slider
        id={id}
        aria-label={label}
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
      />
    </div>
  )
}

/** The handful of backgrounds an email actually uses, plus anything else. */
const SWATCHES = [
  { value: "#ffffff", label: "White" },
  { value: "#fafafa", label: "Off white" },
  { value: "#e5e7eb", label: "Light grey" },
  { value: "#111827", label: "Near black" },
] as const

export function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const normalized = value.trim().toLowerCase()
  const custom = !SWATCHES.some((swatch) => swatch.value === normalized)

  return (
    <div className="grid gap-2.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            aria-label={swatch.label}
            aria-pressed={normalized === swatch.value}
            title={swatch.label}
            disabled={disabled}
            onClick={() => onChange(swatch.value)}
            className={cn(
              "size-9 rounded-lg border transition-[box-shadow,border-color] disabled:opacity-50",
              normalized === swatch.value
                ? "border-foreground ring-2 ring-foreground/20"
                : "hover:border-foreground/25"
            )}
            style={{ backgroundColor: swatch.value }}
          />
        ))}
        {/* Any colour at all, for the one workspace whose brand is none of the
            four above. Shows as picked when the stored value is not a swatch. */}
        <label
          className={cn(
            "relative size-9 cursor-pointer overflow-hidden rounded-lg border transition-colors",
            custom
              ? "border-foreground ring-2 ring-foreground/20"
              : "hover:border-foreground/25",
            disabled && "pointer-events-none opacity-50"
          )}
          style={{ backgroundColor: custom ? value : undefined }}
          title="Any other colour"
        >
          {custom ? null : (
            <span
              aria-hidden
              className="absolute inset-0 bg-[conic-gradient(#f87171,#facc15,#4ade80,#38bdf8,#a78bfa,#f87171)] opacity-70"
            />
          )}
          <input
            type="color"
            aria-label={`${label} — any other colour`}
            disabled={disabled}
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  )
}

/** An on/off setting: what it does on the left, the switch on the right. */
export function SwitchField({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="grid gap-0.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? (
          <span className="text-sm text-muted-foreground">{description}</span>
        ) : null}
      </span>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  )
}
