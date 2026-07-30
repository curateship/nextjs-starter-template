import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A red text line announced to screen readers, for the two messages that must
 * live next to their field or page instead of in the shared error toast:
 * live while-you-type validation (e.g. "passwords do not match") and
 * page-state text (e.g. a dead verification link). Anything that fails when
 * the user clicks reports through showErrorToast; data-surface load failures
 * use ErrorBanner. Pass className for layout spacing only.
 */
export function InlineError({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      role="alert"
      className={cn("text-sm text-destructive", className)}
      {...props}
    />
  )
}
