import * as React from "react"
import { BanIcon, ForwardIcon, MailOpenIcon, PaperclipIcon, SparklesIcon, UserPlusIcon, XIcon } from "lucide-react"

import {
  PickDayRow,
  PickGroup,
  PickMenuRow,
  PickRow,
} from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Conversation } from "@/lib/api/crm/inbox"
import {
  addLeadToContactList,
  changeLeadTagOn,
  getLeadErrorMessage,
  saveLead,
  type LeadPanel as LeadRecord,
} from "@/lib/api/crm/leads"
import {
  CRM_STAGE_LABELS,
  CRM_STAGES,
  CRM_THREAD_STATUS_LABELS,
  type CrmStage,
  type CrmThreadStatus,
} from "@/lib/crm/crm"
import { normalizeLeadTag } from "@/lib/crm/lead-tags"
import { centsToDollars, dollarsToCents } from "@/lib/crm/money"
import { formatDate } from "@/lib/format/format-time"
import { formatFileSize } from "@/lib/format/format-bytes"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The open conversation's ⋮ on the CRM's right panel (the Admin 3 panel
 * design, 7 Nov 2026). Two tabs, 20.4rem wide:
 *
 * - **General:** the contact's facts as grouped rows (Tyler: the facts go in
 *   the ⋮, with a folding Contact card above the reply box). Person, Deal,
 *   Follow up, then Conversation. Every row saves itself, on its own, so two
 *   people editing one lead never write a stale copy over each other. The
 *   address is the lead, so its row opens nothing. Under the groups: Mark
 *   unread, Add to contacts, and Block in red under a line.
 * - **Files:** every file the conversation carried.
 */
export function CrmRecordMenu({
  conversation,
  lead,
  siteTags,
  onLeadChanged,
  onStatusChange,
  onMarkUnread,
  onSummarise,
  onForward,
  onBlock,
}: {
  conversation: Conversation
  /** Null while the lead is still being read. */
  lead: LeadRecord | null
  /** Every tag the site uses, offered while typing a new one. */
  siteTags: string[]
  onLeadChanged: () => void
  onStatusChange: (status: CrmThreadStatus, snoozedUntil?: string | null) => void
  onMarkUnread: () => void
  /** Writes what the conversation is about (CRM task 32); null when it is too short to need one. */
  onSummarise: (() => void) | null
  onForward: () => void
  onBlock: () => void
}) {
  const [open, setOpen] = React.useState(false)

  const save = async (patch: Omit<Parameters<typeof saveLead>[0], "leadId">) => {
    if (!lead) return
    try {
      await saveLead({ leadId: lead.id, ...patch })
      onLeadChanged()
    } catch (error) {
      showErrorToast(getLeadErrorMessage(error))
    }
  }

  const files = conversation.messages.flatMap((message) =>
    message.attachments.map((attachment, index) => ({
      key: `${message.id}-${attachment.id || index}`,
      attachment,
      when: message.occurred_at,
      outbound: message.direction === "out",
    }))
  )

  return (
    <TabbedMenu
      label="Conversation menu"
      align="end"
      width="20.4rem"
      open={open}
      onOpenChange={setOpen}
      tabs={[
        {
          value: "general",
          label: "General",
          content: lead ? (
            <div className="grid gap-4 p-3">
              <LeadFactGroups lead={lead} siteTags={siteTags} save={save} onLeadChanged={onLeadChanged} />

              <PickGroup title="Conversation">
                <PickMenuRow
                  label="Status"
                  value={CRM_THREAD_STATUS_LABELS[conversation.status]}
                  options={(["open", "closed"] as const).map((status) => ({
                    value: status,
                    label: CRM_THREAD_STATUS_LABELS[status],
                  }))}
                  selected={conversation.status}
                  onPick={(status) => onStatusChange(status as CrmThreadStatus, null)}
                />
                <PickDayRow
                  label="Snooze until"
                  value={
                    conversation.status === "snoozed" && conversation.snoozed_until
                      ? formatDate(conversation.snoozed_until)
                      : "None"
                  }
                  empty={conversation.status !== "snoozed"}
                  day={
                    conversation.status === "snoozed" && conversation.snoozed_until
                      ? new Date(conversation.snoozed_until)
                      : null
                  }
                  clearLabel="Bring it back now"
                  onPick={(day) =>
                    day
                      ? onStatusChange("snoozed", day.toISOString())
                      : onStatusChange("open", null)
                  }
                />
              </PickGroup>

              <div className="grid">
                <ActionRow
                  icon={<MailOpenIcon className="size-4" />}
                  onClick={() => {
                    setOpen(false)
                    onMarkUnread()
                  }}
                >
                  Mark unread
                </ActionRow>
                <ActionRow
                  icon={<ForwardIcon className="size-4" />}
                  onClick={() => {
                    setOpen(false)
                    onForward()
                  }}
                >
                  Forward
                </ActionRow>
                {onSummarise ? (
                  <ActionRow
                    icon={<SparklesIcon className="size-4" />}
                    onClick={() => {
                      setOpen(false)
                      onSummarise()
                    }}
                  >
                    {conversation.summary ? "Summarise it again" : "Summarise"}
                  </ActionRow>
                ) : null}
                {lead.contactId ? null : (
                  <AddToContactsRow leadId={lead.id} onAdded={onLeadChanged} />
                )}
                <div aria-hidden className="-mx-3 my-1.5 border-t" />
                <ActionRow
                  destructive
                  icon={<BanIcon className="size-4" />}
                  onClick={() => {
                    setOpen(false)
                    onBlock()
                  }}
                >
                  Block this address
                </ActionRow>
              </div>
            </div>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Reading…</p>
          ),
        },
        {
          value: "files",
          label: "Files",
          content:
            files.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No files came with this conversation.
              </p>
            ) : (
              <ul className="grid gap-1 p-2">
                {files.map(({ key, attachment, when, outbound }) => (
                  <li
                    key={key}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm"
                  >
                    <PaperclipIcon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="grid min-w-0 flex-1">
                      {attachment.href ? (
                        <a
                          href={attachment.href}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate underline-offset-2 hover:underline"
                        >
                          {attachment.filename}
                        </a>
                      ) : (
                        <span className="truncate">{attachment.filename}</span>
                      )}
                      <span className="truncate text-xs text-muted-foreground">
                        {outbound ? "You sent it" : "They sent it"},{" "}
                        {formatDate(when)}
                        {attachment.size !== null
                          ? `, ${formatFileSize(attachment.size)}`
                          : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ),
        },
      ]}
    />
  )
}

/**
 * A lead's facts as grouped rows: Person, Deal, Follow up. The conversation ⋮
 * and the People tab's lead ⋮ both draw these, so a lead's facts are changed
 * the same way wherever it is open. Every row saves itself, on its own.
 */
export function LeadFactGroups({
  lead,
  siteTags,
  save,
  onLeadChanged,
}: {
  lead: LeadRecord
  siteTags: string[]
  save: (patch: Omit<Parameters<typeof saveLead>[0], "leadId">) => Promise<void>
  onLeadChanged: () => void
}) {
  return (
    <>
      <PickGroup title="Person">
        <TextPickRow
          label="Name"
          value={lead.name ?? ""}
          onCommit={(name) => save({ name: name || null })}
        />
        <PickRow label="Email" value={lead.email} disabled>
          {null}
        </PickRow>
        <TextPickRow
          label="Company"
          value={lead.company ?? ""}
          onCommit={(company) => save({ company: company || null })}
        />
        <TextPickRow
          label="Phone"
          value={lead.phone ?? ""}
          inputMode="tel"
          onCommit={(phone) => save({ phone: phone || null })}
        />
      </PickGroup>

      <PickGroup title="Deal">
        <PickMenuRow
          label="Stage"
          value={CRM_STAGE_LABELS[lead.stage]}
          options={CRM_STAGES.map((stage) => ({
            value: stage,
            label: CRM_STAGE_LABELS[stage],
          }))}
          selected={lead.stage}
          onPick={(stage) => void save({ stage: stage as CrmStage })}
        />
        <MoneyPickRow
          cents={lead.valueCents}
          onCommit={(valueCents) => save({ valueCents })}
        />
        <TagsPickRow
          leadId={lead.id}
          tags={lead.tags}
          siteTags={siteTags}
          onChanged={onLeadChanged}
        />
      </PickGroup>

      <PickGroup
        title="Follow up"
        after={
          <p className="px-0.5 text-xs text-muted-foreground">
            On the day, a notice appears in the bell with the note.
          </p>
        }
      >
        <PickDayRow
          label="Date"
          value={lead.follow_up_at ? formatDate(lead.follow_up_at) : "None"}
          empty={!lead.follow_up_at}
          day={lead.follow_up_at ? new Date(lead.follow_up_at) : null}
          clearLabel="Clear the date"
          onPick={(day) =>
            void save({ followUpAt: day ? day.toISOString() : null })
          }
        />
        <TextPickRow
          label="Note"
          value={lead.followUpNote ?? ""}
          multiline
          placeholder="Ask whether they got the quote"
          onCommit={(followUpNote) =>
            save({ followUpNote: followUpNote || null })
          }
        />
      </PickGroup>
    </>
  )
}

/** A ghost row under the groups, as every record ⋮ in the design ends. */
export function ActionRow({
  icon,
  destructive = false,
  disabled = false,
  onClick,
  children,
}: {
  icon: React.ReactNode
  destructive?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      className={
        destructive
          ? "w-full justify-start gap-2 px-2 font-normal text-destructive hover:text-destructive"
          : "w-full justify-start gap-2 px-2 font-normal"
      }
      onClick={onClick}
    >
      {icon}
      {children}
    </Button>
  )
}

/**
 * Writing to you is not asking for a newsletter, so this row is the only way
 * a lead joins the list (`workspace/docs/crm/inbox-and-leads.md`).
 */
export function AddToContactsRow({
  leadId,
  onAdded,
}: {
  leadId: string
  onAdded: () => void
}) {
  const [adding, setAdding] = React.useState(false)
  return (
    <ActionRow
      icon={<UserPlusIcon className="size-4" />}
      disabled={adding}
      onClick={async () => {
        setAdding(true)
        try {
          await addLeadToContactList(leadId)
          onAdded()
        } catch (error) {
          showErrorToast(getLeadErrorMessage(error))
        } finally {
          setAdding(false)
        }
      }}
    >
      {adding ? "Adding…" : "Add to contacts"}
    </ActionRow>
  )
}

/** A typed value: the row shows it, or "None", and its small box holds the field. Leaving the field saves it. */
export function TextPickRow({
  label,
  value,
  placeholder,
  multiline = false,
  inputMode,
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  multiline?: boolean
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  onCommit: (value: string) => void
}) {
  const [text, setText] = useSyncedDraft(value)
  const id = React.useId()
  const commit = () => {
    const next = text.trim()
    if (next !== value.trim()) onCommit(next)
  }
  return (
    <PickRow label={label} value={value.trim() || "None"} empty={!value.trim()}>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {multiline ? (
          <Textarea
            id={id}
            autoFocus
            rows={3}
            value={text}
            placeholder={placeholder}
            className="resize-none"
            onChange={(event) => setText(event.target.value)}
            onBlur={commit}
          />
        ) : (
          <Input
            id={id}
            autoFocus
            value={text}
            placeholder={placeholder}
            inputMode={inputMode}
            onChange={(event) => setText(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
        )}
      </div>
    </PickRow>
  )
}

/** What the whole job is worth, in dollars; stored in cents. */
function MoneyPickRow({
  cents,
  onCommit,
}: {
  cents: number
  onCommit: (cents: number) => void
}) {
  const [text, setText] = useSyncedDraft(centsToDollars(cents))
  const id = React.useId()
  return (
    <PickRow
      label="Worth"
      value={cents ? `$${centsToDollars(cents)}` : "None"}
      empty={!cents}
    >
      <div className="grid gap-1.5">
        <FieldLabel htmlFor={id}>What the whole job is worth</FieldLabel>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">$</span>
          <Input
            id={id}
            autoFocus
            value={text}
            inputMode="decimal"
            placeholder="0"
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
      </div>
    </PickRow>
  )
}

/**
 * A lead's tags (CRM task 27): what kind of lead it is, beside the stage,
 * which is how far along. The row shows them; its box adds one by typing,
 * Enter or a comma adding it, or by picking one the site already uses, and
 * takes one away with its ×. Each change saves on its own.
 */
function TagsPickRow({
  leadId,
  tags,
  siteTags,
  onChanged,
}: {
  leadId: string
  tags: string[]
  siteTags: string[]
  onChanged: () => void
}) {
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const change = async (mode: "add" | "remove", value: string) => {
    const tag = normalizeLeadTag(value)
    if (!tag || busy) return
    setBusy(true)
    try {
      await changeLeadTagOn(leadId, mode, tag)
      if (mode === "add") setText("")
      onChanged()
    } catch (error) {
      showErrorToast(getLeadErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const typed = normalizeLeadTag(text) ?? ""
  const offered = siteTags
    .filter((tag) => !tags.includes(tag) && (!typed || tag.startsWith(typed)))
    .slice(0, 8)
  return (
    <PickRow label="Tags" value={tags.length ? tags.join(", ") : "None"} empty={!tags.length}>
      <div className="grid gap-2">
        {tags.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Tags on this lead">
            {tags.map((tag) => (
              <li
                key={tag}
                className="flex items-center gap-1 rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-sm"
              >
                {tag}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Take off ${tag}`}
                  disabled={busy}
                  onClick={() => void change("remove", tag)}
                >
                  <XIcon className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <Input
          autoFocus
          value={text}
          placeholder="Add a tag"
          aria-label="Add a tag"
          maxLength={60}
          onChange={(event) => {
            const value = event.target.value
            // A comma adds what was typed before it, as a tag list is typed.
            if (value.includes(",")) {
              void change("add", value.split(",")[0] ?? "")
              return
            }
            setText(value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void change("add", text)
            }
          }}
        />
        {offered.length ? (
          <div className="flex flex-wrap gap-1.5">
            {offered.map((tag) => (
              <Button
                key={tag}
                type="button"
                variant="outline"
                size="xs"
                disabled={busy}
                onClick={() => void change("add", tag)}
              >
                {tag}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </PickRow>
  )
}
