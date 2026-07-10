import * as React from "react"
import { Loader2Icon, PlayIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
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
  getContactErrorMessage,
  listContacts,
  type ContactItem,
} from "@/lib/api/contacts"
import { getWorkflowErrorMessage } from "@/lib/api/workflows"

// This workflow acts on a contact (calls, CRM writes), so a manual run needs
// one picked up front. Confirming hands the contact id back to the canvas.
export function RunWorkflowDialog({
  open,
  onOpenChange,
  providerWarning,
  onStart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // True when the graph places calls but the voice provider isn't configured.
  providerWarning: boolean
  onStart: (contactId: string) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Run Workflow</DialogTitle>
          <DialogDescription>
            This workflow acts on a contact — pick who this run is for.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <RunWorkflowContent
            providerWarning={providerWarning}
            onStart={onStart}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RunWorkflowContent({
  providerWarning,
  onStart,
  onClose,
}: {
  providerWarning: boolean
  onStart: (contactId: string) => Promise<void>
  onClose: () => void
}) {
  const [contacts, setContacts] = React.useState<ContactItem[] | null>(null)
  const [contactId, setContactId] = React.useState("")
  const [starting, setStarting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    listContacts()
      .then((data) => {
        if (!active) return
        setContacts(data.contacts)
        if (data.contacts.length > 0) {
          setContactId(data.contacts[0].id)
        }
      })
      .catch((loadError) => {
        if (active) setError(getContactErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [])

  async function handleStart() {
    if (!contactId || starting) return
    setStarting(true)
    setError(null)
    try {
      await onStart(contactId)
    } catch (startError) {
      setError(getWorkflowErrorMessage(startError))
    } finally {
      setStarting(false)
    }
  }

  if (!contacts) {
    return (
      <DialogBody>
        {error ? (
          <ErrorAlert message={error} />
        ) : (
          <div className="flex justify-center py-8">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogBody>
    )
  }

  if (contacts.length === 0) {
    return (
      <>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            No contacts yet — add one under Contacts first, then run this
            workflow against it.
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <>
      <DialogBody>
        <div className="space-y-4">
          {error ? <ErrorAlert message={error} /> : null}
          {providerWarning ? (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              The voice provider isn't connected, so the voice call step will
              fail. Set it up under Settings → Voice Provider first.
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="run-workflow-contact">Contact</Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger id="run-workflow-contact" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {[contact.first_name, contact.last_name]
                      .filter(Boolean)
                      .join(" ")}
                    {` — ${contact.phone}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DialogBody>
      <DialogFooter variant="plain">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!contactId || starting}
          onClick={handleStart}
        >
          {starting ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <PlayIcon className="size-4" />
          )}
          {starting ? "Starting" : "Run Workflow"}
        </Button>
      </DialogFooter>
    </>
  )
}
