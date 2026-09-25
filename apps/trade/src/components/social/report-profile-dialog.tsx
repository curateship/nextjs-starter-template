import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  getPublicProfileErrorMessage,
  sendProfileReport,
} from "@/lib/api/trade/public-profiles"
import { REPORT_REASON_MAX } from "@/lib/trade/public-profile/profile"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The Report link on every public profile. No account needed. The report
 * reaches the admins' Profiles list and changes nothing on the page.
 */
export function ReportProfileDialog({
  handle,
  open,
  onClose,
}: {
  handle: string
  open: boolean
  onClose: () => void
}) {
  const [reason, setReason] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)

  const close = React.useCallback(() => {
    setReason("")
    setInvalid(false)
    onClose()
  }, [onClose])

  async function send() {
    if (!reason.trim()) {
      setInvalid(true)
      showErrorToast("Say what is wrong before sending.")
      return
    }
    dismissErrorToast()
    setSending(true)
    try {
      await sendProfileReport(handle, reason)
      toast.success("Report sent. An admin will look at it.")
      close()
    } catch (error) {
      showErrorToast(getPublicProfileErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={reason.trim().length > 0}
      busy={sending}
      onClose={close}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report @{handle}</DialogTitle>
            <DialogDescription>
              Tell the admins what looks wrong. They can hide a profile from the
              public while they look into it.
            </DialogDescription>
          </DialogHeader>
          <form
            // The body scrolls only as a flex child of the window.
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardContent className="grid gap-2">
                  <Label htmlFor="profile-report-reason">What is wrong</Label>
                  <Textarea
                    id="profile-report-reason"
                    value={reason}
                    maxLength={REPORT_REASON_MAX}
                    aria-invalid={invalid || undefined}
                    onBlur={() => setInvalid(reason.trim().length === 0)}
                    onChange={(event) => {
                      setReason(event.target.value)
                      if (event.target.value.trim()) setInvalid(false)
                    }}
                  />
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={sending}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                Send report
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
