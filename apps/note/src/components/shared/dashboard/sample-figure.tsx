import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A number that is a stand-in, in a row where the rest is real.
 *
 * Quieter than the figures around it and underlined with a dashed rule, so it
 * reads as provisional at a glance — but never *only* that, because a shade
 * and a rule are both invisible to a screen reader and one of them is
 * invisible in greyscale. The `title` says it plainly, and the card it sits on
 * carries a "Sample" badge in words.
 */
export function SampleValue({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "text-muted-foreground underline decoration-muted-foreground/50 decoration-dashed underline-offset-4",
        className
      )}
      title="A stand-in figure. Nothing in the app records this yet."
    >
      {children}
    </span>
  )
}
