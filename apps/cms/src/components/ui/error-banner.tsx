import * as React from "react"

import { showErrorToast } from "@/lib/toast/error-toast"

// Compatibility wrapper for existing call sites. All failures use the shared
// persistent toast, including failures that used to render as a banner.
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: React.ReactNode
  onRetry?: () => void
}) {
  const retryRef = React.useRef(onRetry)
  const lastMessageRef = React.useRef<React.ReactNode>(undefined)

  React.useEffect(() => {
    retryRef.current = onRetry
  }, [onRetry])

  React.useEffect(() => {
    if (Object.is(lastMessageRef.current, message)) return
    lastMessageRef.current = message

    showErrorToast(
      message,
      onRetry
        ? { label: "Try again", onClick: () => retryRef.current?.() }
        : undefined
    )
  }, [message, onRetry])

  return null
}
