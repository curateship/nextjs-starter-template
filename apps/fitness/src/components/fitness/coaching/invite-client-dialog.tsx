import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

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
import { changeClients } from "@/lib/api/fitness/coaching"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { showErrorToast } from "@/lib/toast/error-toast"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Asks someone to be coached, by the email on their account. They answer on
 * their own Programs dashboard; until then the coach sees nothing of theirs.
 */
export function InviteClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const emailId = React.useId()
  const [email, setEmail] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  function close() {
    onOpenChange(false)
    setEmail("")
    setInvalid(false)
  }

  async function invite() {
    if (!EMAIL.test(email.trim())) {
      setInvalid(true)
      showErrorToast("Type the email address on their account.")
      return
    }
    setBusy(true)
    try {
      await changeClients({ action: "invite", email: email.trim() })
      toast.success("Asked. They'll see the request on their Programs dashboard.")
      await router.invalidate()
      close()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={email.trim() !== ""} busy={busy} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              void invite()
            }}
          >
            <DialogHeader>
              <DialogTitle>Invite a client</DialogTitle>
              <DialogDescription>
                They need an account already. Nothing of theirs is shared with you until they say yes.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-6">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Who</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor={emailId}>Their email</Label>
                    <Input
                      id={emailId}
                      type="email"
                      autoComplete="off"
                      value={email}
                      autoFocus
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setEmail(event.target.value)
                        if (invalid) setInvalid(false)
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Send request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
