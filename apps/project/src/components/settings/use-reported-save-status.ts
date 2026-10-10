import * as React from "react"

import { useShellRuntime } from "@/components/shell/shell-layout"
import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"

/**
 * An auto-saving card's own Saving…/Saved state, put in the sticky header.
 *
 * **Idle is reported as nothing, not as "idle".** The header shows
 * `pageSaveStatus ?? saveStatus`, so a card sitting there saying "idle" would
 * hide the settings page's own save. That did not matter while each of these
 * cards had a screen to itself. Since 25 Sep 2026 Storage bucket and AI
 * provider keys are two cards on General settings, both mounted whenever that
 * screen is open, next to fields that save through the page. Saying nothing is
 * what lets the page's own state through.
 *
 * "Saved" clears itself after two seconds, the same as the header's own.
 */
export function useReportedSaveStatus(): React.Dispatch<
  React.SetStateAction<SaveStatus>
> {
  const { reportSaveStatus } = useShellRuntime()
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")

  React.useEffect(() => {
    reportSaveStatus(saveStatus === "idle" ? null : saveStatus)
  }, [reportSaveStatus, saveStatus])

  // Clearing belongs to unmount alone. Folded into the effect above it would
  // run on every status change, and a card going quiet would blank whatever
  // the card beside it was saying.
  React.useEffect(() => {
    return () => reportSaveStatus(null)
  }, [reportSaveStatus])

  React.useEffect(() => {
    if (saveStatus !== "saved") return
    const timer = setTimeout(() => setSaveStatus("idle"), 2000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  return setSaveStatus
}
