import * as React from "react"

import { FieldLabel } from "@/components/ui/field-label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

/**
 * One on-or-off setting: the switch on the left, what it does to its right.
 *
 * **The switch leads the row.** Tyler asked for this on 25 Sep 2026. Every
 * toggle in Settings used to be one of two shapes — a tick box with its words
 * beside it, or a label on the left with the switch pushed to the far right by
 * `justify-between`. Neither lined up with the other, and on a wide card the
 * second put the control an inch from the words that explain it. One shape,
 * switch first, and a column of settings reads down its left edge.
 *
 * It is a `Switch` and not a `Checkbox` because every one of these takes effect
 * when it is flipped rather than when a form is submitted — the reason written
 * on `Switch` itself.
 */
export function SettingsSwitchRow({
  id,
  checked,
  onCheckedChange,
  label,
  hint,
  disabled,
  className,
}: {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** The sentence beside the switch. Says what being on does, not its name. */
  label: React.ReactNode
  /** Longer guidance, behind the info icon rather than under the row. */
  hint?: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
      <FieldLabel htmlFor={id} hint={hint} className="font-normal">
        {label}
      </FieldLabel>
    </div>
  )
}
