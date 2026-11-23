import * as React from "react"

import { PublicProfileDialog } from "@/components/social/public-profile-dialog"
import { Button } from "@/components/ui/button"
import { QuickSettingRow } from "@/components/ui/quick-setting-row"

/**
 * The Public profile row in the header's settings cog, and the window it
 * opens.
 *
 * **Why the window is not drawn by the row.** The cog's panel is the shell's,
 * and it removes its rows the moment it closes. Opening a window moves focus
 * out of the panel, which closes it, so a window drawn inside the row would
 * vanish as it opened. The window is drawn by `PublicProfileDialogHost`
 * instead, which the header's pinned-markets strip draws on every signed-in
 * page, and the row only asks it to open.
 */
let open = false
const listeners = new Set<() => void>()

function setOpen(next: boolean) {
  open = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function PublicProfileDialogHost() {
  const isOpen = React.useSyncExternalStore(
    subscribe,
    () => open,
    () => false
  )
  return <PublicProfileDialog open={isOpen} onClose={() => setOpen(false)} />
}

export default function PublicProfileSetting() {
  return (
    <QuickSettingRow
      label="Public profile"
      hint="A page anyone can open, showing what your real wallets made."
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        Open
      </Button>
    </QuickSettingRow>
  )
}
