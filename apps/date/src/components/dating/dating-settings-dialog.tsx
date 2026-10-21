import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import DatingSettingsTab from "./dating-settings"

/**
 * Every Dating setting in one window, opened from the cog in the dashboard's
 * left header (Tyler, 20 Oct 2026: "all the settings needs to be in this cog
 * modal"). They are only here since they left Settings → App settings on
 * 20 Oct 2026, because they will differ per profile once there is a Profiles
 * dashboard. A change saves by itself as it is made, and the page's header
 * says Saving… and Saved.
 */
export function DatingSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Dating settings</DialogTitle>
          <DialogDescription>What the AI knows about you and what you want, how it decides, and the phone's limits. Every change saves by itself.</DialogDescription>
        </DialogHeader>
        <DialogBody>{open ? <DatingSettingsTab /> : null}</DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
