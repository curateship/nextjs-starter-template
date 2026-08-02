import * as React from "react"

import { getViewAsErrorMessage, stopViewingAsMember } from "@/lib/api/view-as"
import { showErrorToast } from "@/lib/error-toast"

/**
 * Ends "view as somebody else" and puts the admin back in their own seat.
 *
 * Two places offer the way out — the reminder in the top bar and the account
 * menu, which is showing the member's name while the admin is the one clicking
 * it — so the way out lives here once rather than in both.
 *
 * It leaves by a full page load, not a router refresh: every loader on the page
 * was fetched as the member and has to be thrown away. The admin lands back on
 * the list of accounts they came from, as themselves.
 */
export function useStopViewingAs() {
  const [leaving, setLeaving] = React.useState(false)

  const stopViewing = React.useCallback(async () => {
    if (leaving) return

    setLeaving(true)
    try {
      await stopViewingAsMember()
      window.location.href = "/admin/users"
    } catch (error) {
      setLeaving(false)
      showErrorToast(getViewAsErrorMessage(error))
    }
  }, [leaving])

  return { leaving, stopViewing }
}
