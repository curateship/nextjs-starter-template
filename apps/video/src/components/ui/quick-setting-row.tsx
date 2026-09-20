import * as React from "react"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

/**
 * One row inside the header's quick settings menu.
 *
 * The menu belongs to the shell and the rows in it belong to whichever app is
 * running, so this is the piece that keeps them looking like one menu: the
 * label on the left, the control on the right, the same height and the same
 * spacing whatever the app puts in it. An app builds its row from here rather
 * than laying one out itself.
 */
export function QuickSettingRow({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: React.ReactNode
  /** The control's id, so pressing the label works the control. */
  htmlFor?: string
  /** One short line under the label, for a rule that is not obvious. */
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <div className="grid min-w-0 gap-0.5">
        <Label htmlFor={htmlFor} className="font-normal">
          {label}
        </Label>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

/**
 * The switch row an app's quick setting is nearly always made of.
 *
 * Kept as one call rather than a row wrapped round a switch because every app
 * would otherwise wire the label to the switch itself, and the first one to
 * forget would ship a label that does nothing when it is pressed.
 */
export function QuickSettingSwitch({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: React.ReactNode
  hint?: React.ReactNode
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <QuickSettingRow label={label} htmlFor={id} hint={hint}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </QuickSettingRow>
  )
}
