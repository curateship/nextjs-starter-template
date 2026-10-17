import * as React from "react"

import { cn } from "@/lib/utils"

/** A saved record or validation detail that failed, shown where it belongs. */
export function InlineError({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="alert"
      className={cn("text-sm text-destructive", className)}
      {...props}
    />
  )
}
