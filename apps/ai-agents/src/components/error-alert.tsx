import { AlertCircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// The app-wide inline error banner. Render under the page/dialog header.
export function ErrorAlert({
  message,
  className,
}: {
  message: string
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive",
        className
      )}
    >
      <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
