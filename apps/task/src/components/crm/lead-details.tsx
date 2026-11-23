import * as React from "react"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CRM_STAGE_LABELS, CRM_STAGES, type CrmStage } from "@/lib/crm/crm"
import { centsToDollars, dollarsToCents } from "@/lib/crm/money"
import {
  addLeadToContactList,
  getLeadErrorMessage,
  saveLead,
  type LeadPanel as LeadRecord,
} from "@/lib/api/crm/leads"
import { formatDate } from "@/lib/format/format-time"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The right panel's contents: who they are, where they are up to, and when to
 * chase them.
 *
 * Each box saves as it is left, on its own. The whole record is never posted,
 * so two people editing the same lead cannot have one of them write a stale
 * copy over the other's change — the worst case is that the later edit of one
 * field wins, which is what anybody would expect.
 */
export function LeadDetails({
  lead,
  onChanged,
}: {
  lead: LeadRecord
  onChanged: () => void
}) {
  const [addingContact, setAddingContact] = React.useState(false)

  const save = async (patch: Omit<Parameters<typeof saveLead>[0], "leadId">) => {
    try {
      await saveLead({ leadId: lead.id, ...patch })
      onChanged()
    } catch (error) {
      showErrorToast(getLeadErrorMessage(error))
    }
  }

  return (
    <div className="grid gap-3">
      <TextRow
        label="Name"
        value={lead.name ?? ""}
        placeholder="Nobody has said"
        onCommit={(name) => save({ name: name || null })}
      />
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="lead-email">Email</FieldLabel>
        {/* Read-only on purpose: the address IS the lead. Changing it would
            mean a different person, and the mail already filed under this one
            would follow them. */}
        <Input id="lead-email" value={lead.email} readOnly className="h-8" />
      </div>
      <TextRow
        label="Company"
        value={lead.company ?? ""}
        placeholder="Nobody has said"
        onCommit={(company) => save({ company: company || null })}
      />
      <TextRow
        label="Phone"
        value={lead.phone ?? ""}
        placeholder="Nobody has said"
        onCommit={(phone) => save({ phone: phone || null })}
      />

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="lead-stage">Stage</FieldLabel>
        <Select
          value={lead.stage}
          onValueChange={(value) => save({ stage: value as CrmStage })}
        >
          <SelectTrigger id="lead-stage" className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CRM_STAGES.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {CRM_STAGE_LABELS[stage]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor="lead-value"
          hint="What the whole job is worth if it comes off, in dollars."
        >
          Worth
        </FieldLabel>
        <MoneyRow
          cents={lead.valueCents}
          onCommit={(valueCents) => save({ valueCents })}
        />
      </div>

      <div className="grid gap-1.5">
        <FieldLabel
          htmlFor="lead-follow-up"
          hint="On this date a notice appears in the bell. Clearing the date stops it."
        >
          Follow up on
        </FieldLabel>
        <DatePicker
          id="lead-follow-up"
          value={lead.follow_up_at ? new Date(lead.follow_up_at) : undefined}
          placeholder="No date set"
          onChange={(date) =>
            save({ followUpAt: date ? date.toISOString() : null })
          }
        />
        {lead.follow_up_at ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={() => save({ followUpAt: null })}
          >
            Clear the date
          </Button>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="lead-follow-up-note">
          What to say when you do
        </FieldLabel>
        <NoteRow
          value={lead.followUpNote ?? ""}
          onCommit={(followUpNote) =>
            save({ followUpNote: followUpNote || null })
          }
        />
      </div>

      <dl className="grid gap-1 border-t pt-3 text-xs text-muted-foreground">
        <div className="flex justify-between gap-2">
          <dt>Where they came from</dt>
          <dd className="text-right">{lead.source ?? "Nobody has said"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>First heard from</dt>
          <dd className="text-right">{formatDate(lead.created_at)}</dd>
        </div>
      </dl>

      {lead.contactId ? (
        <p className="text-xs text-muted-foreground">
          They are on the newsletter list.
        </p>
      ) : (
        <div className="grid gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={addingContact}
            onClick={async () => {
              setAddingContact(true)
              try {
                await addLeadToContactList(lead.id)
                onChanged()
              } catch (error) {
                showErrorToast(getLeadErrorMessage(error))
              } finally {
                setAddingContact(false)
              }
            }}
          >
            {addingContact ? "Adding…" : "Add to contacts"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Writing to you is not asking for a newsletter, so this is the only
            way they join the list.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * A box that saves what is in it when it is left, and on Enter.
 *
 * Saving on every keystroke would be a request per letter. Saving only on a
 * button means an edit lost by clicking away, which is the more annoying of
 * the two.
 */
function TextRow({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  onCommit: (value: string) => void
}) {
  const [text, setText] = useSyncedDraft(value)
  const id = `lead-${label.toLowerCase().replace(/\s+/g, "-")}`

  const commit = () => {
    const next = text.trim()
    if (next === value.trim()) return
    onCommit(next)
  }

  return (
    <div className="grid gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={text}
        placeholder={placeholder}
        className="h-8"
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </div>
  )
}

function MoneyRow({
  cents,
  onCommit,
}: {
  cents: number
  onCommit: (cents: number) => void
}) {
  const [text, setText] = useSyncedDraft(centsToDollars(cents))

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-muted-foreground">$</span>
      <Input
        id="lead-value"
        value={text}
        inputMode="decimal"
        placeholder="0"
        className="h-8"
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const next = dollarsToCents(text)
          // Unreadable goes back to what was saved rather than to zero.
          if (next === null) {
            setText(centsToDollars(cents))
            return
          }
          if (next !== cents) onCommit(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </div>
  )
}

function NoteRow({
  value,
  onCommit,
}: {
  value: string
  onCommit: (value: string) => void
}) {
  const [text, setText] = useSyncedDraft(value)

  return (
    <Textarea
      id="lead-follow-up-note"
      value={text}
      rows={2}
      className="resize-none"
      placeholder="Ask whether they got the quote"
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        const next = text.trim()
        if (next !== value.trim()) onCommit(next)
      }}
    />
  )
}
