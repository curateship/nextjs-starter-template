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
import { reportSharedFile } from "@/lib/api/pomodoro/shared-media"
import { PROFILE_REPORT_RATE_LIMITED } from "@/lib/pomodoro/profile-reports"
import {
  SHARED_FILE_REPORT_REASONS,
  SHARED_FILE_REPORT_THANKS,
  type SharedFileReportReasonId,
} from "@/lib/pomodoro/shared-media-reports"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Report a shared file (uploads-and-sharing task 05, part 2): the profile's
 * Report window with the file's own reasons. Anybody may send one, signed in
 * or not, and the thanks is the same whatever the server did.
 */
export function ReportSharedFileDialog({
  open,
  onOpenChange,
  mediaId,
  name,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mediaId: string
  name: string
}) {
  const [reason, setReason] =
    React.useState<SharedFileReportReasonId>("copyright")
  const [sending, setSending] = React.useState(false)
  const reasonId = React.useId()

  const send = async () => {
    setSending(true)
    try {
      await reportSharedFile(mediaId, reason)
      toast.success(SHARED_FILE_REPORT_THANKS)
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
          <DialogTitle>Report {name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={reasonId}>What is wrong?</Label>
            <Select
              value={reason}
              onValueChange={(value) =>
                setReason(value as SharedFileReportReasonId)
              }
            >
              <SelectTrigger id={reasonId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHARED_FILE_REPORT_REASONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Someone on our team reads every report. You do not need an account
            to send one. If you own the rights to the work, the{" "}
            <a href="/copyright" className="underline underline-offset-2">
              copyright page
            </a>{" "}
            lets us answer you by email.
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
