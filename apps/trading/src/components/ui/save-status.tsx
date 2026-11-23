import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type SaveStatus = "idle" | "saving" | "saved"

/**
 * Auto-save feedback for surfaces that have no save button: the settings page
 * (via the sticky header) and the Automation editor toolbar. Renders nothing
 * while idle, so a quiet page stays quiet.
 */
export function SaveStatusIndicator({
  status,
  className,
}: {
  status?: SaveStatus
  className?: string
}) {
  if (status === "saving") {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>
        Saving…
      </span>
    )
  }
  if (status === "saved") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-sm text-muted-foreground",
          className
        )}
      >
        <CheckIcon className="h-4 w-4" />
        Saved
      </span>
    )
  }
  return null
}
