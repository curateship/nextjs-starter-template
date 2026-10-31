import * as React from "react"

import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * The shared tooltip on one icon button, in place of a `title`. Greyed out, it
 * shows `disabledReason` instead, or nothing when there is no reason to give.
 *
 * `disabled` must be the same condition the button itself is given.
 */
export function Hint({
  label,
  disabled = false,
  disabledReason,
  children,
}: {
  label: React.ReactNode
  disabled?: boolean
  disabledReason?: React.ReactNode
  children: React.ReactElement
}) {
  if (disabled) {
    return disabledReason ? (
      <DisabledReason disabled reason={disabledReason}>
        {children}
      </DisabledReason>
    ) : (
      children
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
