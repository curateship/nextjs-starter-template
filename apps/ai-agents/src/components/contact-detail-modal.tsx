import * as React from "react"
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { Textarea } from "@/components/ui/textarea"
import {
  createContactNote,
  getContactDetail,
  getContactErrorMessage,
  updateContact,
  updateContactTags,
  type ContactCallItem,
  type ContactDetailResponse,
  type ContactItem,
  type ContactNoteItem,
} from "@/lib/api/contacts"
import {
  CALL_STATUS_LABELS,
  callStatusBadgeVariant,
  formatCallDuration,
} from "@/lib/call-format"
import { dateTimeFormatter } from "@/lib/format"

// Contact modal following the shell's edit-modal anatomy (see the sidebar
// destination dialog): flat fields, section header rows with their action on
// the right, dashed empty states, Save in the footer.
export function ContactDetailModal({
  contact,
  onOpenChange,
  onContactChanged,
}: {
  contact: ContactItem | null
  onOpenChange: (open: boolean) => void
  onContactChanged: (contact: ContactItem) => void
}) {
  return (
    <Dialog open={!!contact} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">
            {contact
              ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
              : "Contact"}
          </DialogTitle>
          <DialogDescription>
            Edit this contact and review their call activity.
          </DialogDescription>
        </DialogHeader>
        {contact ? (
          <ContactDetailContent
            key={contact.id}
            contactId={contact.id}
            onContactChanged={onContactChanged}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ContactDetailContent({
  contactId,
  onContactChanged,
  onClose,
}: {
  contactId: string
  onContactChanged: (contact: ContactItem) => void
  onClose: () => void
}) {
  const [detail, setDetail] = React.useState<ContactDetailResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Profile fields, seeded once the detail loads.
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [doNotCall, setDoNotCall] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const [tagInput, setTagInput] = React.useState("")
  const [savingTags, setSavingTags] = React.useState(false)
  const [noteBody, setNoteBody] = React.useState("")
  const [addingNote, setAddingNote] = React.useState(false)

  React.useEffect(() => {
    let active = true
    getContactDetail(contactId)
      .then((data) => {
        if (!active) return
        setDetail(data)
        setFirstName(data.contact.first_name)
        setLastName(data.contact.last_name ?? "")
        setPhone(data.contact.phone)
        setEmail(data.contact.email ?? "")
        setDoNotCall(data.contact.do_not_call)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getContactErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [contactId])

  function applySavedContact(saved: ContactItem) {
    setDetail((current) => (current ? { ...current, contact: saved } : current))
    onContactChanged(saved)
  }

  // Footer Save: persists profile fields and closes, like the shell modals.
  async function handleSave() {
    if (saving || !firstName || !phone) return
    setSaving(true)
    setError(null)
    try {
      const saved = await updateContact(contactId, {
        firstName,
        lastName: lastName || null,
        phone,
        email: email || null,
        doNotCall,
      })
      applySavedContact(saved)
      onClose()
    } catch (saveError) {
      setError(getContactErrorMessage(saveError))
      setSaving(false)
    }
  }

  // Tags save instantly, like toggles elsewhere in the shell.
  async function saveTags(tags: string[]) {
    if (savingTags) return
    setSavingTags(true)
    setError(null)
    try {
      applySavedContact(await updateContactTags(contactId, tags))
      setTagInput("")
    } catch (tagError) {
      setError(getContactErrorMessage(tagError))
    } finally {
      setSavingTags(false)
    }
  }

  async function handleAddNote() {
    if (!noteBody || addingNote) return
    setAddingNote(true)
    setError(null)
    try {
      const note = await createContactNote(contactId, noteBody)
      setDetail((current) =>
        current ? { ...current, notes: [note, ...current.notes] } : current
      )
      setNoteBody("")
    } catch (noteError) {
      setError(getContactErrorMessage(noteError))
    } finally {
      setAddingNote(false)
    }
  }

  if (!detail) {
    return (
      <DialogBody>
        {error ? (
          <ErrorAlert message={error} />
        ) : (
          <div className="grid h-64 place-items-center">
            <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogBody>
    )
  }

  const contact = detail.contact
  const customFieldEntries = Object.entries(contact.custom_fields)

  return (
    <>
      <DialogBody>
        {error ? <ErrorAlert message={error} /> : null}

        {/* Profile fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="contact-first-name">First name</Label>
            <Input
              id="contact-first-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-last-name">Last name</Label>
            <Input
              id="contact-last-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-phone">Phone</Label>
            <Input
              id="contact-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={doNotCall}
            onCheckedChange={(checked) => setDoNotCall(checked === true)}
          />
          Do not call — campaigns skip this contact
        </label>

        {/* Tags */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Tags</p>
            <p className="text-xs text-muted-foreground">
              Saved immediately. Use them to organize and find contacts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {contact.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  className="rounded-sm text-muted-foreground hover:text-foreground"
                  disabled={savingTags}
                  onClick={() => saveTags(contact.tags.filter((t) => t !== tag))}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
            <Input
              value={tagInput}
              placeholder="Add tag..."
              aria-label="Add tag"
              className="h-7 w-32 text-xs"
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && tagInput) {
                  saveTags([...contact.tags, tagInput])
                }
              }}
            />
            <Button
              type="button"
              size="icon-xs"
              variant="outline"
              aria-label="Add tag"
              disabled={!tagInput || savingTags}
              onClick={() => saveTags([...contact.tags, tagInput])}
            >
              {savingTags ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <PlusIcon className="size-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Custom fields (from CSV imports) */}
        {customFieldEntries.length > 0 ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Custom fields</p>
              <p className="text-xs text-muted-foreground">
                Imported from CSV — available as {"{{variables}}"} in agent
                prompts.
              </p>
            </div>
            <dl className="space-y-1.5">
              {customFieldEntries.map(([key, value]) => (
                <div key={key} className="flex gap-3 text-sm">
                  <dt className="w-36 shrink-0 truncate text-muted-foreground">
                    {key}
                  </dt>
                  <dd className="min-w-0 flex-1 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {/* Call history */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Call history</p>
            <p className="text-xs text-muted-foreground">
              Every call with this contact, newest first.
            </p>
          </div>
          {detail.calls.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No calls yet.
            </div>
          ) : (
            <div className="space-y-2">
              {detail.calls.map((call) => (
                <ContactCallRow key={call.id} call={call} />
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Notes</p>
              <p className="text-xs text-muted-foreground">
                Saved immediately, newest first.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!noteBody || addingNote}
              onClick={handleAddNote}
            >
              {addingNote ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PlusIcon className="size-4" />
              )}
              Add Note
            </Button>
          </div>
          <Textarea
            value={noteBody}
            placeholder="Write a note..."
            className="min-h-16"
            onChange={(event) => setNoteBody(event.target.value)}
          />
          {detail.notes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No notes yet.
            </div>
          ) : (
            <div className="space-y-2">
              {detail.notes.map((note) => (
                <ContactNoteRow key={note.id} note={note} />
              ))}
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter variant="plain">
        <Button
          type="button"
          disabled={saving || !firstName || !phone}
          onClick={handleSave}
        >
          {saving ? "Saving" : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}

function ContactCallRow({ call }: { call: ContactCallItem }) {
  const duration = formatCallDuration(call.duration_seconds)
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium capitalize">{call.direction} call</span>
        <Badge variant={callStatusBadgeVariant(call.status)}>
          {CALL_STATUS_LABELS[call.status] ?? call.status}
        </Badge>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {dateTimeFormatter.format(new Date(call.started_at ?? call.created_at))}
        {duration ? ` · ${duration}` : ""}
      </p>
      {call.summary ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {call.summary}
        </p>
      ) : null}
    </div>
  )
}

function ContactNoteRow({ note }: { note: ContactNoteItem }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm whitespace-pre-wrap">{note.body}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {dateTimeFormatter.format(new Date(note.created_at))}
      </p>
    </div>
  )
}

