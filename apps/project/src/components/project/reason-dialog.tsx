import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Asks for the one line a reason needs: why a task is Stuck, or why it is
 * being handed back. Used where there is no task window open to type it in,
 * such as dragging a card into the Stuck column.
 */
export function ReasonDialog({
  open,
  title,
  description,
  label,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  label: string
  confirmLabel: string
  busy: boolean
  onConfirm: (reason: string) => Promise<boolean>
  onClose: () => void
}) {
  const [reason, setReason] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)

  function close() {
    setReason("")
    setInvalid(false)
    onClose()
  }

  async function confirm() {
    if (!reason.trim()) {
      setInvalid(true)
      showErrorToast("Say in a line why.")
      return
    }
    if (await onConfirm(reason.trim())) close()
  }

  return (
    <FormDialog open={open} dirty={Boolean(reason.trim())} busy={busy} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Reason</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="reason-text">{label}</Label>
                    <Input
                      id="reason-text"
                      value={reason}
                      maxLength={LIMITS.reason}
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setReason(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
