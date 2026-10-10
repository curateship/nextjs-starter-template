import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  SHARE_MESSAGES,
  SHARE_RIGHTS_LABEL,
} from "@/lib/pomodoro/shared-media"

/**
 * The Share tick and, once it is ticked, the "I have the right to share
 * this" tick under it (uploads-and-sharing task 05, part 1). Both must be
 * ticked to share; the upload window and the cog's window use this one.
 *
 * `needsRights` is false when the file is already shared, so editing its
 * name does not ask again for a confirmation the server already holds.
 */
export function ShareFields({
  shared,
  confirmRights,
  needsRights,
  showProblem,
  disabled,
  disabledReason,
  onChange,
}: {
  shared: boolean
  confirmRights: boolean
  needsRights: boolean
  /** Upload or Save was pressed with Share ticked and the rights not. */
  showProblem: boolean
  disabled?: boolean
  /** Said under the tick when it cannot be changed, such as a take-down. */
  disabledReason?: string | null
  onChange: (change: { shared?: boolean; confirmRights?: boolean }) => void
}) {
  const shareId = React.useId()
  const rightsId = React.useId()
  const problemId = React.useId()
  const missing = showProblem && shared && needsRights && !confirmRights

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={shareId}
          checked={shared}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ shared: checked === true })}
        />
        <Label htmlFor={shareId}>Share this</Label>
      </div>
      {disabledReason ? (
        <p className="text-sm text-muted-foreground">{disabledReason}</p>
      ) : null}
      {shared && needsRights ? (
        <div className="flex items-start gap-2">
          <Checkbox
            id={rightsId}
            className="mt-0.5"
            checked={confirmRights}
            disabled={disabled}
            aria-invalid={missing ? true : undefined}
            aria-describedby={missing ? problemId : undefined}
            onCheckedChange={(checked) =>
              onChange({ confirmRights: checked === true })
            }
          />
          <Label htmlFor={rightsId} className="leading-snug font-normal">
            {SHARE_RIGHTS_LABEL}
          </Label>
        </div>
      ) : null}
      {missing ? (
        <p id={problemId} className="text-sm text-destructive">
          {SHARE_MESSAGES.SHARE_NOT_CONFIRMED}
        </p>
      ) : null}
    </div>
  )
}
