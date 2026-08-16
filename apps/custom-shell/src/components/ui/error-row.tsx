import * as React from "react"

import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import { cn } from "@/lib/utils"

/**
 * A failure that stays inside the surface that failed, with its recovery beside
 * it. The persistent error toast still fires, but dismissing it never leaves a
 * blank page, panel, or card behind.
 */
export function ErrorRow({
  message,
  onRetry,
  className,
}: {
  message: React.ReactNode
  onRetry?: () => void
  className?: string
}) {
  return (
    <>
      <ErrorBanner message={message} onRetry={onRetry} />
      <div
        className={cn(
          "grid justify-items-center gap-3 px-4 py-8 text-center",
          className
        )}
      >
        <p className="text-sm text-muted-foreground">{message}</p>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </>
  )
}
