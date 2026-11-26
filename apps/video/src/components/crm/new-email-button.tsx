import * as React from "react"
import { PlusIcon } from "lucide-react"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  holdNewEmail,
  undoHeldNewEmail,
  useReplyStore,
  useReplySent,
  useSecondsLeft,
} from "@/components/crm/reply-store"
import { Button } from "@/components/ui/button"
import { CRM_MAX_BODY_LENGTH } from "@/lib/crm/crm"
import { showErrorToast } from "@/lib/toast/error-toast"

type Draft = { to: string; name: string; subject: string; body: string; from: string }
const EMPTY: Draft = { to: "", name: "", subject: "", body: "", from: "" }

/**
 * The inbox header's one primary button, New email (CRM task 15, built in
 * task 36 on 7 Nov 2026): write to somebody who has not written first. It
 * opens the shell's New dropdown. What is typed stays when it is clicked
 * away from, and goes once the mail is sent. Send waits ten seconds with
 * Undo before the mail goes; then the new conversation opens on the right.
 */
export function NewEmailButton({
  addresses,
  onSent,
}: {
  /** The addresses it can go out from, first one first. A From row shows only with two or more. */
  addresses: { address: string; label: string }[]
  onSent: (threadId: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<Draft>(EMPTY)
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))
  // Send holds the email for ten seconds, with Undo here, before it goes
  // (CRM task 38, part 1). It is held in the CRM's reply store, so it still
  // goes if the dropdown or the Inbox is left meanwhile.
  const held = useReplyStore().newEmail
  const seconds = useSecondsLeft(held && !held.sending ? held.sendAt : null)

  // Gone: what was typed goes, and the new conversation opens. A refused one
  // keeps what was typed here, with the reason in the error toast.
  useReplySent((event) => {
    if (event.kind !== "new-email") return
    setDraft(EMPTY)
    setOpen(false)
    onSent(event.threadId)
  })

  const send = () => {
    if (held) return
    if (!draft.to.trim() || !draft.subject.trim() || !draft.body.trim()) {
      showErrorToast("Fill in who it is to, the subject and the message.")
      return
    }
    holdNewEmail({
      to: draft.to,
      name: draft.name || undefined,
      subject: draft.subject,
      body: draft.body,
      fromAddress: draft.from || undefined,
    })
  }

  return (
    <NewRecordDropdown
      label="New email"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Send"
      busy={held !== null}
      onSubmit={send}
      trigger={
        <DashboardToolbarButton type="button" aria-label="New email">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:sr-only">New email</span>
        </DashboardToolbarButton>
      }
    >
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="crm-new-to">To</FieldLabel>
        <Input
          id="crm-new-to"
          type="email"
          autoFocus
          value={draft.to}
          placeholder="sam@example.com"
          onChange={(event) => set({ to: event.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="crm-new-name">Their name</FieldLabel>
        <Input
          id="crm-new-name"
          value={draft.name}
          placeholder="Sam Taylor"
          onChange={(event) => set({ name: event.target.value })}
        />
      </div>
      {addresses.length > 1 ? (
        <div className="grid gap-1.5">
          <FieldLabel htmlFor="crm-new-from">From</FieldLabel>
          <Select
            value={draft.from || addresses[0]?.address}
            onValueChange={(from) => set({ from })}
          >
            <SelectTrigger id="crm-new-from" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {addresses.map((address) => (
                <SelectItem key={address.address} value={address.address}>
                  {address.label || address.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="crm-new-subject">Subject</FieldLabel>
        <Input
          id="crm-new-subject"
          value={draft.subject}
          maxLength={2000}
          onChange={(event) => set({ subject: event.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="crm-new-body">Message</FieldLabel>
        <Textarea
          id="crm-new-body"
          rows={5}
          value={draft.body}
          maxLength={CRM_MAX_BODY_LENGTH}
          className="resize-none"
          onChange={(event) => set({ body: event.target.value })}
        />
      </div>
      {held ? (
        <p className="flex items-center justify-end gap-2 text-xs text-muted-foreground" aria-live="polite">
          {held.sending ? "Sending…" : `Sending in ${seconds}s`}
          {held.sending ? null : (
            <Button type="button" variant="outline" size="xs" onClick={undoHeldNewEmail}>
              Undo
            </Button>
          )}
        </p>
      ) : null}
    </NewRecordDropdown>
  )
}
