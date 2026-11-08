import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { forwardConversation, getCrmErrorMessage } from "@/lib/api/crm/inbox"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Forward, from the conversation's ⋮ (CRM task 20): an address, a note of
 * yours, and the whole conversation goes under it. Their answer comes back as
 * a conversation of its own, never into this one.
 */
export function ForwardDialog({
  open,
  threadId,
  onClose,
  onSent,
}: {
  open: boolean
  threadId: string
  onClose: () => void
  /** Reads the conversation again, so its "Forwarded to" line shows. */
  onSent: () => void
}) {
  const [to, setTo] = React.useState("")
  const [note, setNote] = React.useState("")
  const [sending, setSending] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forward this conversation</DialogTitle>
          <DialogDescription>
            Your note goes first, then every message in it. Their answer arrives as a
            conversation of its own.
          </DialogDescription>
        </DialogHeader>
        <form
          id="crm-forward"
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!to.trim() || sending) return
            setSending(true)
            try {
              await forwardConversation(threadId, to, note)
              toast.success(`Forwarded to ${to.trim()}.`)
              setTo("")
              setNote("")
              onClose()
              onSent()
            } catch (error) {
              showErrorToast(getCrmErrorMessage(error))
            } finally {
              setSending(false)
            }
          }}
        >
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="crm-forward-to">To</FieldLabel>
            <Input
              id="crm-forward-to"
              type="email"
              autoFocus
              value={to}
              placeholder="builder@example.com"
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="crm-forward-note">Your note</FieldLabel>
            <Textarea
              id="crm-forward-note"
              rows={4}
              value={note}
              maxLength={5000}
              className="resize-none"
              placeholder="Can you price the gas run on this one?"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="crm-forward" disabled={sending}>
            {sending ? "Sending…" : "Forward"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
