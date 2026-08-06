import * as React from "react"
import { useRouterState } from "@tanstack/react-router"
import { toast } from "sonner"

// One failure on screen at a time. A fresh id per toast (with the previous
// one dismissed first) instead of a single fixed id: sonner swallows a toast
// re-shown under an id that was just dismissed.
let currentErrorToastId: string | number | null = null

/**
 * The one way to report a failure: a red toast in the same fixed spot as the
 * success toasts. One shared slot — a repeat failure replaces the previous
 * message instead of stacking, and it stays until dismissed or until the next
 * attempt starts.
 *
 * Field validation reports here too. Fire it when the field is left (onBlur)
 * or on submit — never per keystroke, which would replace the message on every
 * character typed. Keep `aria-invalid` on the input so the red ring marks which
 * field is at fault after the toast is dismissed.
 */
export function showErrorToast(
  message: React.ReactNode,
  action?: { label: string; onClick: () => void }
) {
  if (currentErrorToastId !== null) {
    toast.dismiss(currentErrorToastId)
  }
  currentErrorToastId = toast.error(message, {
    duration: Infinity,
    action: action
      ? {
          label: action.label,
          onClick: () => {
            dismissErrorToast()
            action.onClick()
          },
        }
      : undefined,
  })
}

/** Call when a new attempt starts so a stale failure never outlives its retry. */
export function dismissErrorToast() {
  if (currentErrorToastId !== null) {
    toast.dismiss(currentErrorToastId)
    currentErrorToastId = null
  }
}

/**
 * Clears the failure when the user leaves the page it came from. The toast
 * never expires on its own, so without this a "wrong password" from the sign-in
 * page would still be sitting there on the forgot-password page. Mounted once,
 * beside the Toaster. Re-fetching in place (router.invalidate) keeps the same
 * path, so a failure the user is still looking at survives.
 */
export function useDismissErrorToastOnNavigate() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  React.useEffect(() => {
    return () => dismissErrorToast()
  }, [pathname])
}
