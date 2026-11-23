import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { showErrorToast } from "@/lib/toast/error-toast"

/** A window that asks for one name: renaming the program or a workout day. */
export function NameDialog({
  open,
  title,
  name,
  maxLength,
  saveLabel,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  name: string
  maxLength: number
  saveLabel: string
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const [draft, setDraft] = React.useState(name)
  const [wasOpen, setWasOpen] = React.useState(open)
  const [busy, setBusy] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setDraft(name)
      setInvalid(false)
    }
  }
  const id = React.useId()

  async function save() {
    if (!draft.trim()) {
      setInvalid(true)
      showErrorToast("Give it a name.")
      return
    }
    setBusy(true)
    try {
      await onSave(draft.trim())
      onClose()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={draft !== name} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardContent className="grid gap-2">
                <Label htmlFor={id}>Name</Label>
                <Input
                  id={id}
                  value={draft}
                  maxLength={maxLength}
                  autoFocus
                  aria-invalid={invalid || undefined}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void save()
                    }
                  }}
                />
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" size="lg" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {saveLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
