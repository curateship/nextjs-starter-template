import * as React from "react"
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
import {
  createBroadcastTemplate,
  getBroadcastErrorMessage,
} from "@/lib/api/broadcasts"
import type { BroadcastBlock } from "@/lib/broadcasts/blocks"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { plural } from "@/lib/plural"

export function SaveTemplateDialog({
  open,
  onOpenChange,
  blocks,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  blocks: BroadcastBlock[]
  /** Tells the Templates tab to go and fetch the list again. */
  onSaved: () => void
}) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName("")
    }
  }

  const submit = async () => {
    if (busy) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      showErrorToast("Give the template a name first.")
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      await createBroadcastTemplate(trimmedName, blocks)
      onSaved()
      onOpenChange(false)
      toast.success(`Saved “${trimmedName}”`)
    } catch (saveError) {
      showErrorToast(getBroadcastErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    // FormDialog, not Dialog: a typed name is work, so every way out asks
    // before throwing it away.
    <FormDialog
      open={open}
      dirty={Boolean(name.trim())}
      busy={busy}
      onClose={() => onOpenChange(false)}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this as a template</DialogTitle>
            <DialogDescription>
              Keeps these {blocks.length} {plural(blocks.length, "block", "blocks")} so the
              next email can start from them.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Template details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="template-name">Name</Label>
                  <Input
                    id="template-name"
                    autoFocus
                    maxLength={120}
                    value={name}
                    placeholder="Weekly update"
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return
                      event.preventDefault()
                      void submit()
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
