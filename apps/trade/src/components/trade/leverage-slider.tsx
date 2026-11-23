import { FieldLabel } from "@/components/ui/field-label"
import { Slider } from "@/components/ui/slider"

/**
 * The one leverage control every order window uses: the word "Leverage", the
 * chosen number beside it, and a slider from 1× to what this market allows.
 * The quick order, order settings, grid, grid settings and DCA windows all
 * draw this, so moving between them never looks like two different settings.
 *
 * Draws nothing when the market lends nothing, because a slider from 1× to 1×
 * has nothing to choose.
 */
export function LeverageSlider({
  id,
  value,
  max,
  disabled = false,
  hint,
  onChange,
}: {
  id: string
  value: number
  /** The highest whole leverage this market allows. */
  max: number
  disabled?: boolean
  hint?: string
  onChange: (next: number) => void
}) {
  if (max <= 1) return null
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel htmlFor={id} hint={hint}>
          Leverage
        </FieldLabel>
        <span className="text-xs text-muted-foreground tabular-nums">
          {value}×
        </span>
      </div>
      <Slider
        id={id}
        min={1}
        max={max}
        step={1}
        value={[Math.min(Math.max(1, value), max)]}
        disabled={disabled}
        onValueChange={([next]) => onChange(next)}
        aria-label="Leverage"
      />
    </div>
  )
}
