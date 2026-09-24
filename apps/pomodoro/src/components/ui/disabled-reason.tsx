"use client"

import * as React from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * Why a greyed-out control is greyed out, in a tooltip you can actually reach.
 *
 * A plain `title` on a disabled button never appears: `Button` carries
 * `disabled:pointer-events-none`, so the pointer never lands on it and the
 * browser never shows the tip. The fix is to hang the tooltip on a wrapper that
 * is not disabled, which is what this is.
 *
 * The wrapper only exists while the control is off. Enabled, the control is
 * returned untouched — no extra element in the layout, and no second tab stop
 * beside a button that is already reachable.
 *
 * Disabled, the wrapper takes `tabIndex={0}`. A disabled button cannot be
 * focused, so without this the reason would be mouse-only; the wrapper is the
 * only thing a keyboard can land on to ask.
 *
 * Write the reason as the condition and what would lift it — "The last
 * workspace cannot be deleted" — not a restatement of the button.
 *
 * `disabled` must be the same condition the control itself is given. They are
 * two copies of one fact, so change them together: a wrapper that disagrees
 * with its button either explains a button that works or stays silent about one
 * that does not.
 */
export function DisabledReason({
  reason,
  disabled,
  className,
  children,
}: {
  /** The condition, in one plain sentence. */
  reason: React.ReactNode
  disabled: boolean
  className?: string
  children: React.ReactNode
}) {
  if (!disabled) return <>{children}</>

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* inline-flex so a toolbar or an action column keeps its shape: the
            wrapper sits exactly where the control sat. */}
        <span
          tabIndex={0}
          className={cn("inline-flex rounded-lg", focusRing, className)}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}
