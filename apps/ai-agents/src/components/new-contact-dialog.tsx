import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createContact,
  getContactErrorMessage,
  type ContactItem,
} from "@/lib/api/contacts"

// Create-only: editing happens inline in the contact detail modal. The inner
// form only mounts while open, so its state is always fresh per session.
export function NewContactDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (contact: ContactItem) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>New Contact</DialogTitle>
          <DialogDescription>
            Phone numbers are stored in international format.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ContactForm onSaved={onSaved} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ContactForm({
  onSaved,
  onClose,
}: {
  onSaved: (contact: ContactItem) => void
  onClose: () => void
}) {
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [doNotCall, setDoNotCall] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSave() {
    if (saving || !firstName || !phone) return
    setSaving(true)
    setError(null)
    try {
      const saved = await createContact({
        firstName,
        lastName: lastName || null,
        phone,
        email: email || null,
        doNotCall,
      })
      onSaved(saved)
      onClose()
    } catch (saveError) {
      setError(getContactErrorMessage(saveError))
      setSaving(false)
    }
  }

  return (
    <>
      <DialogBody>
        <div className="space-y-4">
          {error ? (
            <ErrorAlert message={error} />
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="contact-first-name">First name</Label>
              <Input
                id="contact-first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-last-name">Last name</Label>
              <Input
                id="contact-last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-phone">Phone</Label>
            <Input
              id="contact-phone"
              type="tel"
              value={phone}
              placeholder="+1 416 555 0123"
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={doNotCall}
              onCheckedChange={(checked) => setDoNotCall(checked === true)}
            />
            Do not call
          </label>
        </div>
      </DialogBody>
      <DialogFooter variant="plain">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={saving || !firstName || !phone}
          onClick={handleSave}
        >
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {saving ? "Saving" : "Create Contact"}
        </Button>
      </DialogFooter>
    </>
  )
}
