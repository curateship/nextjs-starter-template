import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  reportGroupByInvite,
  reportTeamPage,
} from "@/lib/api/pomodoro/group-reports"
import {
  GROUP_REPORT_REASONS,
  GROUP_REPORT_THANKS,
  type GroupReportReasonId,
} from "@/lib/pomodoro/group-reports"
import { PROFILE_REPORT_RATE_LIMITED } from "@/lib/pomodoro/profile-reports"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Reporting a group's name or line (groups task 01, part 24), from its
 * invite page or its public page. Nothing is picked for the reporter, the
 * same as the shared-file report, so a report reaches the admin under the
 * reason the reporter chose.
 */
export function GroupReportDialog({
  open,
  onOpenChange,
  groupName,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  /** The invite link's secret, or the team page's address. */
  target: { token: string } | { handle: string }
}) {
  const [reason, setReason] = React.useState<GroupReportReasonId | null>(null)
  const [missingReason, setMissingReason] = React.useState(false)
  // Each opening starts empty, even though the window stays mounted.
  const [shownOpen, setShownOpen] = React.useState(open)
  if (shownOpen !== open) {
    setShownOpen(open)
    if (open) {
      setReason(null)
      setMissingReason(false)
    }
  }
  const [sending, setSending] = React.useState(false)
  const reasonId = React.useId()

  const send = async () => {
    if (!reason) {
      setMissingReason(true)
      showErrorToast("Pick a reason first.")
      return
    }
    setSending(true)
    try {
      if ("token" in target) await reportGroupByInvite(target.token, reason)
      else await reportTeamPage(target.handle, reason)
      // The same thanks whatever happened on the server.
      toast.success(GROUP_REPORT_THANKS)
      onOpenChange(false)
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ""
      showErrorToast(
        text.includes("RATE_LIMITED")
          ? PROFILE_REPORT_RATE_LIMITED
          : "That report could not be sent. Try again."
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Report {groupName}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={reasonId}>What is wrong?</Label>
            <Select
              value={reason ?? ""}
              onValueChange={(value) => {
                setReason(value as GroupReportReasonId)
                setMissingReason(false)
              }}
            >
              <SelectTrigger id={reasonId} aria-invalid={missingReason || undefined}>
                <SelectValue placeholder="Pick a reason" />
              </SelectTrigger>
              <SelectContent>
                {GROUP_REPORT_REASONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Someone on our team reads every report. The group&apos;s owner is
            never told who sent it.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={sending} onClick={() => void send()}>
            {sending ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
