import * as React from "react"
import { AlertCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

// The one error banner for data surfaces: a flat band that states what failed
// and, when the surface can reload, offers the retry right in the banner.
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: React.ReactNode
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <AlertCircleIcon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </div>
  )
}
