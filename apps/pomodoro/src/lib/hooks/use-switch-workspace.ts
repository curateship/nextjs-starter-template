import * as React from "react"

import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  getWorkspaceErrorMessage,
  switchWorkspace,
} from "@/lib/api/people/workspaces"

/**
 * Moving to another workspace, from wherever the reader asked.
 *
 * Two places ask — the sidebar switcher and the workspaces dashboard — and they
 * have to do exactly the same thing, including the part that is easy to get
 * wrong. So the act lives here rather than being written out twice.
 */
export function useSwitchWorkspace() {
  /** Which row is mid-switch, so it can show it and the rest can be held. */
  const [busyWorkspaceId, setBusyWorkspaceId] = React.useState<string | null>(
    null
  )

  const switchToWorkspace = React.useCallback(async (workspaceId: string) => {
    dismissErrorToast()
    setBusyWorkspaceId(workspaceId)
    try {
      await switchWorkspace(workspaceId)

      // **The whole page reloads, rather than the router re-running loaders.**
      //
      // Sixteen screens read their loader data once, into `useState(initial…)`,
      // and a re-run hands them fresh props that `useState` ignores — so after
      // switching, the Automations list, the media library and a dozen others
      // went on showing the workspace you had just left until somebody pressed
      // reload. Fixing each of them would be sixteen edits, one of which would
      // be missed, and every screen written afterwards would have to remember.
      //
      // Switching is a rare, deliberate act that changes *everything* on
      // screen, so throwing the page away is the honest answer rather than a
      // shortcut: nothing from the workspace you left should survive it.
      //
      // The address is kept. On a list that is exactly right; on a record's own
      // page — an automation the other workspace does not have — it lands on
      // not-found, which is true, and the sidebar is right there.
      window.location.reload()
    } catch (error) {
      showErrorToast(getWorkspaceErrorMessage(error))
    } finally {
      setBusyWorkspaceId(null)
    }
  }, [])

  return { switchToWorkspace, busyWorkspaceId }
}
