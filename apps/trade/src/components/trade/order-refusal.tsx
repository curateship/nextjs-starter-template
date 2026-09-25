import * as React from "react"

import { LOST_MONEY } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

/**
 * Why the button below will not do anything, said before it is pressed.
 *
 * **A dead grey button on a trading screen reads as a broken app**, not as a
 * form with a problem in it. Every window that can refuse says so here, in one
 * sentence, in the same red, sitting where the eye is already going: right
 * beside or above the button it is about.
 *
 * The words name the box and what would fix it, in dollars wherever money is
 * involved. Never a code, never a field name out of the source.
 *
 * It carries an `id` so the button can point at it with `aria-describedby`,
 * which is what ties the sentence to the control for a screen reader rather
 * than leaving it as loose text near it.
 */
export function OrderRefusal({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  /** The one sentence, or null when there is nothing to refuse. */
  children: React.ReactNode
}) {
  if (!children) return null
  return (
    <p
      id={id}
      className={cn("text-xs", LOST_MONEY, className)}
    >
      {children}
    </p>
  )
}
