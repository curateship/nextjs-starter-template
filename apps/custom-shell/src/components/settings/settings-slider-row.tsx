import * as React from "react"

import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"

export function SettingsSliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  valueLabel,
  disabled,
  onChange,
  help,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  valueLabel: string
  disabled?: boolean
  onChange: (value: number) => void
  help?: string
}) {
  const fieldId = React.useId()
  const labelId = `${fieldId}-label`
  const helpId = `${fieldId}-help`
  const thumbRef = React.useRef<HTMLSpanElement>(null)

  return (
    <div className="grid gap-2">
      <div className="grid max-w-sm gap-2">
        <div className="flex items-center justify-between">
          {/* Radix puts the slider role on a span, so htmlFor cannot name it or
              move focus. The ARIA link and click handler do both jobs. */}
          <Label
            id={labelId}
            className="cursor-pointer"
            onClick={() => thumbRef.current?.focus()}
          >
            {label}
          </Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {valueLabel}
          </span>
        </div>
        <Slider
          thumbRef={thumbRef}
          aria-labelledby={labelId}
          aria-describedby={help ? helpId : undefined}
          aria-valuetext={valueLabel}
          min={min}
          max={max}
          step={step}
          value={[value]}
          disabled={disabled}
          onValueChange={(next) => onChange(next[0] ?? min)}
        />
      </div>
      {help ? (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
    </div>
  )
}
