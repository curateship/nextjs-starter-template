import * as React from "react"

import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"

/**
 * A number on a node's settings panel.
 *
 * Its own file because both backtest panels are full of these, and because
 * typing a number into a panel that saves on every keystroke is fiddlier than
 * it looks: clearing the box to type a new number leaves it empty for a moment,
 * and writing that straight through would save nothing where a number belongs.
 *
 * So the box keeps its own text while you are in it, and only a reading that
 * parses and sits in range is written to the node. A reading that does not is
 * marked on the field and simply not saved — the value on the step stays the
 * last good one, which is what "the run always uses the numbers saved on the
 * step" needs to mean something.
 */
export function TradeNumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  integer = false,
  step,
  suffix,
  onChange,
}: {
  id: string
  label: React.ReactNode
  hint?: React.ReactNode
  value: number
  min: number
  max: number
  /** True when a decimal would not be honoured by the thing this controls. */
  integer?: boolean
  /** The saved value must sit on this increment, starting from `min`. */
  step?: number
  /** A unit drawn after the box — "%", "hours". */
  suffix?: string
  onChange: (next: number) => void
}) {
  const [text, setText] = React.useState(() => String(value))
  const [lastValue, setLastValue] = React.useState(value)

  // The node changed underneath us — an undo, a different node selected into
  // the same panel. What is on the step wins over what was typed. Worked out
  // while rendering rather than in an effect, the same way `form-dialog.tsx`
  // notices its window opening: an effect would draw the old text once first.
  if (lastValue !== value) {
    setLastValue(value)
    setText(String(value))
  }

  const parsed = Number(text.trim())
  const accepts = (next: number) => {
    const steps = step === undefined ? 0 : (next - min) / step
    return (
      Number.isFinite(next) &&
      next >= min &&
      next <= max &&
      (!integer || Number.isInteger(next)) &&
      (step === undefined || Math.abs(steps - Math.round(steps)) < 1e-9)
    )
  }
  const valid = text.trim() !== "" && accepts(parsed)

  return (
    <div className="grid gap-1.5">
      <FieldLabel htmlFor={id} className="text-xs" hint={hint}>
        {label}
      </FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode={integer ? "numeric" : "decimal"}
          step={step}
          value={text}
          aria-invalid={!valid}
          onChange={(event) => {
            setText(event.target.value)
            const next = Number(event.target.value.trim())
            if (event.target.value.trim() !== "" && accepts(next)) {
              onChange(next)
            }
          }}
        />
        {suffix ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
      {/* Says WHY, rather than just turning red.
          A red box with no words is indistinguishable from a broken panel:
          typing 750 into a field that stops at 730 looked like the step had
          failed, when it had simply refused a number too big. The limit is in
          the hint behind the little icon, which is not where somebody is
          looking while they type. */}
      {valid ? null : (
        <p className="text-xs text-destructive">
          {text.trim() === ""
            ? "This needs a number."
            : integer && Number.isFinite(parsed) && !Number.isInteger(parsed)
              ? "Use a whole number. Anything else is not saved."
              : step !== undefined &&
                  Number.isFinite(parsed) &&
                  parsed >= min &&
                  parsed <= max
                ? `Use increments of ${step.toLocaleString()}${
                    suffix ? ` ${suffix}` : ""
                  }. Anything else is not saved.`
              : `Between ${min.toLocaleString()} and ${max.toLocaleString()}${
                  suffix ? ` ${suffix}` : ""
                }. Anything else is not saved.`}
        </p>
      )}
    </div>
  )
}
