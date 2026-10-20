import * as React from "react"

import { useShellRuntime } from "@/components/shell/shell-layout"
import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"

/**
 * Guest mode: the project dashboard opened by somebody sent from Project, at
 * `/guest/promo/<project id>` (`workspace/docs/project-guests.md`). The
 * guest page wraps the dashboard in `GuestContext`; every screen that
 * must hide something from a guest asks `usePromoGuest()`, which is null on
 * the admin pages.
 *
 * The admin pages sit inside the shell's layout, which gives the dashboard
 * its rows per page and the header's Saving… sign. The guest page has no
 * shell layout, so `usePromoShell()` answers from the guest frame instead.
 */

export type PromoGuest = {
  /** The Project person's name, as "Sam". */
  name: string
  projectId: string
  /** The frame's own Saving…/Saved sign. */
  reportSaveStatus: (status: SaveStatus | null) => void
}

/** Set by the guest page around the dashboard; absent on the admin pages. */
export const GuestContext = React.createContext<PromoGuest | null>(null)

/** The guest on the guest page; null on every admin page. */
export function usePromoGuest() {
  return React.useContext(GuestContext)
}

/** Rows per page on the guest page, where there is no shell setting to read. */
const GUEST_ROWS_PER_PAGE = 25

/**
 * The shell's runtime, or null outside the shell's layout. The shell's hook
 * throws there; its context is always read first, so the order of hooks
 * never changes.
 */
function useOptionalShellRuntime() {
  try {
    return useShellRuntime()
  } catch {
    return null
  }
}

/** What the dashboard reads from the shell, answered by the guest frame on the guest page. */
export function usePromoShell(): {
  rowsPerPage: number
  reportSaveStatus: (status: SaveStatus | null) => void
} {
  const guest = usePromoGuest()
  const shell = useOptionalShellRuntime()
  if (guest) return { rowsPerPage: GUEST_ROWS_PER_PAGE, reportSaveStatus: guest.reportSaveStatus }
  if (!shell) throw new Error("Shell runtime is missing")
  return { rowsPerPage: shell.config.dashboardRowsPerPage, reportSaveStatus: shell.reportSaveStatus }
}

/**
 * The shell's `useReportedSaveStatus`, reporting through `usePromoShell` so
 * it also works on the guest page. Idle reports nothing, and "Saved" clears
 * itself after two seconds, the same as the shell's.
 */
export function usePromoSaveStatus(): React.Dispatch<React.SetStateAction<SaveStatus>> {
  const { reportSaveStatus } = usePromoShell()
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")

  React.useEffect(() => {
    reportSaveStatus(saveStatus === "idle" ? null : saveStatus)
  }, [reportSaveStatus, saveStatus])

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
