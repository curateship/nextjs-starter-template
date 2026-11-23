import { MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * A small whole number with a minus and a plus either side, such as sets or
 * reps, as Tyler drew it on 18 Oct 2026. The number is never typed, so there
 * is no half-typed value to guard against; each press hands the new value
 * back at once. A press past either end keeps the number and says what the
 * range is, rather than greying the button out (Tyler: a button is never
 * disabled while nothing is running).
 */
export function StepperField({
  id,
  label,
  value,
  min,
  max,
  disabled = false,
  className,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  disabled?: boolean
  className?: string
  onChange: (value: number) => void
}) {
  function step(by: number) {
    const next = value + by
    if (next < min || next > max) {
      showErrorToast(`${label} go from ${min} to ${max}.`)
      return
    }
    onChange(next)
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Label id={`${id}-label`}>{label}</Label>
      <div
        id={id}
        role="group"
        aria-labelledby={`${id}-label`}
        className="flex h-8 items-center rounded-md border bg-background"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`One fewer ${label.toLowerCase()}`}
          disabled={disabled}
          onClick={() => step(-1)}
        >
          <MinusIcon />
        </Button>
        <output aria-live="polite" className="min-w-0 flex-1 text-center text-sm font-medium tabular-nums">
          {value}
        </output>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`One more ${label.toLowerCase()}`}
          disabled={disabled}
          onClick={() => step(1)}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}
