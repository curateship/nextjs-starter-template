import { Loader2Icon, PauseIcon, PlayIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"

import DatingSettingsTab from "./dating-settings"

/**
 * Every Dating setting of the open profile in one window, opened from the cog
 * in the dashboard's left header (Tyler, 20 Oct 2026: "all the settings needs
 * to be in this cog modal"). They left Settings → App settings on 20 Oct 2026
 * because they differ per profile (task "features/06-profiles"), so the title
 * names the profile. A change saves by itself as it is made.
 *
 * The foot holds the profile's own Delete, at the far left, and Pause or
 * Resume. Delete closes this window and asks in the shared confirm, so no
 * window opens over another.
 */
export function DatingSettingsDialog({
  open,
  profile,
  busy,
  onClose,
  onRenamed,
  onPause,
  onDelete,
}: {
  open: boolean
  profile: DatingDashboard["profile"]
  /** Which button is waiting on the server. */
  busy: string | null
  onClose: () => void
  onRenamed: () => void
  onPause: (paused: boolean) => void
  onDelete: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Dating settings · {profile.name}</DialogTitle>
          <DialogDescription>
            This profile's own: what the AI knows about you and what you want, how it decides, and the phone's limits. Every change saves by itself.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>{open ? <DatingSettingsTab profile={profile} onRenamed={onRenamed} /> : null}</DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" className="text-destructive sm:mr-auto" onClick={onDelete}>
            <Trash2Icon /> Delete profile
          </Button>
          <Button type="button" variant="outline" disabled={busy === "pause"} onClick={() => onPause(!profile.paused)}>
            {busy === "pause" ? <Loader2Icon className="animate-spin" /> : profile.paused ? <PlayIcon /> : <PauseIcon />}
            {profile.paused ? "Resume profile" : "Pause profile"}
          </Button>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
