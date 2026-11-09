import * as React from "react"
import { PlusIcon, UploadIcon, UserPlusIcon } from "lucide-react"

import { ContactTagsBox } from "@/components/broadcasts/contact-tags-box"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getContactErrorMessage, saveContact } from "@/lib/api/people/contacts"
import {
  CONTACT_SEGMENT_STATUSES,
  segmentStatusLabels,
  type ContactSegmentStatus,
} from "@/lib/contacts/contact-segments"
import { useAddAsk } from "@/lib/crm/add-asks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"

const EMPTY_FORM = { email: "", firstName: "", lastName: "" }

/**
 * New contact, as a dropdown under the middle header's button: the address
 * first, then first and last name, then status and tags. Enter in a field
 * makes it, except in Tags, where Enter places the tag.
 * An address already on the list is updated rather than added twice. Clicking away keeps what was typed for the next opening.
 *
 * The button first offers the two ways to add people (Tyler, 9 Nov 2026:
 * "clicking on add new contact should open a dropdown to give me 2 options to
 * add new contact"): Add a contact turns the same dropdown into the form, and
 * Upload a CSV file opens the import window.
 */
export function NewContactDropdown({
  knownTags,
  onCreated,
  onImport,
}: {
  /** Every tag in use in the workspace, offered as Tags is typed in. */
  knownTags: string[]
  /** The new person, opened in the right panel once the list has them. */
  onCreated: (contactId: string) => Promise<void>
  /** Opens the CSV import window. */
  onImport: () => void
}) {
  const [open, setOpen] = React.useState(false)
  // Each opening starts on the two choices.
  const [choosing, setChoosing] = React.useState(true)
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [status, setStatus] = React.useState<ContactSegmentStatus>("subscribed")
  const [tags, setTags] = React.useState<string[]>([])
  const [invalid, setInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getContactErrorMessage)

  // "Add a subscriber" from the CRM's left header + opens straight on the form.
  useAddAsk("subscriber", () => {
    setChoosing(false)
    setOpen(true)
  })

  const field =
    (key: keyof typeof EMPTY_FORM) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }))

  const create = async () => {
    const email = form.email.trim()
    if (!email) {
      setInvalid(true)
      showErrorToast("Email address is required.")
      return
    }
    await run(async () => {
      const { id } = await saveContact({
        email,
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        tags,
        status,
      })
      setForm(EMPTY_FORM)
      setTags([])
      setStatus("subscribed")
      setInvalid(false)
      setOpen(false)
      await onCreated(id)
    }, `Added ${email}.`)
  }

  return (
    <NewRecordDropdown
      label="New contact"
      open={open}
      onOpenChange={(next) => {
        if (next) setChoosing(true)
        setOpen(next)
      }}
      choices={
        choosing ? (
          <div className="grid" role="menu" aria-label="Add people">
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              className="w-full justify-start gap-2 px-2 font-normal"
              onClick={() => setChoosing(false)}
            >
              <UserPlusIcon className="size-4 text-muted-foreground" />
              Add a contact
            </Button>
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              className="w-full justify-start gap-2 px-2 font-normal"
              onClick={() => {
                setOpen(false)
                onImport()
              }}
            >
              <UploadIcon className="size-4 text-muted-foreground" />
              Upload a CSV file
            </Button>
          </div>
        ) : undefined
      }
      submitLabel="Create contact"
      busy={saving}
      onSubmit={() => void create()}
      trigger={
        // Words where there is room; an icon with its name in a narrow panel.
        <Button type="button" className="ml-1 @max-3xl:size-8 @max-3xl:px-0" aria-label="New contact">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:hidden">New contact</span>
        </Button>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="new-contact-email">Email</Label>
        <Input
          id="new-contact-email"
          type="email"
          autoFocus
          value={form.email}
          placeholder="ada@example.com"
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            field("email")(event)
            setInvalid(false)
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="new-contact-first">First name</Label>
          <Input id="new-contact-first" value={form.firstName} onChange={field("firstName")} />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="new-contact-last">Last name</Label>
          <Input id="new-contact-last" value={form.lastName} onChange={field("lastName")} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-contact-status">Status</Label>
        <Select value={status} onValueChange={(value) => setStatus(value as ContactSegmentStatus)}>
          <SelectTrigger id="new-contact-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTACT_SEGMENT_STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                {segmentStatusLabels[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-contact-tags">Tags</Label>
        <ContactTagsBox
          id="new-contact-tags"
          tags={tags}
          knownTags={knownTags}
          disabled={saving}
          onAdd={(tag) => {
            setTags((current) => [...current, tag])
            return true
          }}
          onRemove={(tag) => setTags((current) => current.filter((entry) => entry !== tag))}
        />
      </div>
    </NewRecordDropdown>
  )
}
