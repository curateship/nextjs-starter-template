import * as React from "react"
import {
  CopyIcon,
  LayoutTemplateIcon,
  MailIcon,
  SendIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"

import { BroadcastStatusPanel } from "@/components/broadcasts/broadcast-status-panel"
import { SendBroadcastDialog } from "@/components/broadcasts/send-broadcast-dialog"
import { SaveTemplateDialog } from "@/components/broadcasts/template-dialogs"
import { ActionRow, TextPickRow } from "@/components/crm/crm-record-menu"
import { EmailPage, useEmailDraft, type EmailEditableFields } from "@/components/crm/email-page"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { PickGroup, PickMenuRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getBroadcast,
  getBroadcastErrorMessage,
  updateBroadcast,
  type BroadcastDetail,
  type BroadcastListItem,
  type BroadcastTemplateItem,
} from "@/lib/api/email/broadcasts"
import type { SegmentChoice } from "@/lib/api/people/contact-segments"
import { describeAudienceFilter, type BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"
import { describeNextBatch } from "@/lib/broadcasts/drip"
import { formatDate, formatDateTime } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"

export const BROADCAST_STATUS_LABELS: Record<BroadcastListItem["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  paused: "Paused",
  sent: "Sent",
}

/** How far along a send is, in plain numbers rather than a percentage. */
export function broadcastProgress(item: BroadcastListItem) {
  if (item.status === "draft") return "Not sent yet"
  if (item.status === "scheduled" && item.scheduled_at) return `Goes ${formatDateTime(item.scheduled_at)}`
  const failed = item.totalFailed > 0 ? `, ${item.totalFailed} did not go through` : ""
  // A paced send sits at the same numbers for half an hour at a time, which
  // reads as stuck. Saying when the next batch goes makes it read as waiting.
  const next = item.status === "sending" ? describeNextBatch(item.next_batch_at) : null
  return `${item.totalSent} of ${item.totalRecipients} sent${failed}${next ? `, ${next}` : ""}`
}

const POLL_MS = 5000
const SLEEPING_POLL_MS = 30_000
const EDITABLE_STATUSES = new Set(["draft", "scheduled", "paused"])

function fieldsOf(detail: BroadcastDetail): EmailEditableFields {
  return {
    subject: detail.subject,
    preheader: detail.preheader,
    fromName: detail.fromName ?? "",
    blocks: detail.blocks,
  }
}

/**
 * One newsletter on the CRM's right panel, written there (Part C4; Tyler,
 * 7 Nov 2026: "The right panel stays as the panel to open email
 * conversations and broadcast email editor", then "not linked it outside").
 *
 * - **⋮, General:** the subject, the preview line and the From name, then
 *   the name only you see, a template to start from, Save as a template,
 *   Make a copy, and Delete in red.
 * - **⋮, Audience:** who it goes to. It is picked on the way out, in Review
 *   and send, so nobody sends to the wrong people by a stale setting.
 * - **⋮, Sending:** where the send has got to, one line per address.
 * - **Body:** the email (`EmailPage`).
 * - **Footer:** the state and the counts, and Review and send.
 */
export function BroadcastRecord({
  broadcastId,
  segments,
  blockDefaults,
  templates,
  onListChanged,
  onCopy,
  onDelete,
}: {
  broadcastId: string
  segments: SegmentChoice[]
  blockDefaults: BroadcastBlockDefaults
  /** The saved templates, for "Start from a template". Read when the ⋮ opens. */
  templates: () => Promise<BroadcastTemplateItem[]>
  /** The list beside it is read again: a name, a status or a count changed. */
  onListChanged: () => void
  onCopy: (broadcastId: string) => void
  onDelete: (item: BroadcastListItem) => void
}) {
  const [detail, setDetail] = React.useState<BroadcastDetail | null>(null)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    let cancelled = false
    getBroadcast(broadcastId)
      .then((read) => {
        if (!cancelled) setDetail(read)
      })
      .catch((error) => {
        if (cancelled) return
        setFailed(true)
        showErrorToast(getBroadcastErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [broadcastId])

  if (!detail) {
    return failed ? (
      <EmptyRecord title="Newsletter" icon={<MailIcon aria-hidden />} line="This newsletter could not be opened." hideLabel="Hide the newsletter" />
    ) : (
      <EmptyRecord title="Newsletter" icon={null} line="" loading hideLabel="Hide the newsletter" />
    )
  }
  return (
    <OpenBroadcast
      initial={detail}
      segments={segments}
      blockDefaults={blockDefaults}
      templates={templates}
      onListChanged={onListChanged}
      onCopy={onCopy}
      onDelete={onDelete}
    />
  )
}

function OpenBroadcast({
  initial,
  segments,
  blockDefaults,
  templates,
  onListChanged,
  onCopy,
  onDelete,
}: {
  initial: BroadcastDetail
  segments: SegmentChoice[]
  blockDefaults: BroadcastBlockDefaults
  templates: () => Promise<BroadcastTemplateItem[]>
  onListChanged: () => void
  onCopy: (broadcastId: string) => void
  onDelete: (item: BroadcastListItem) => void
}) {
  const [broadcast, setBroadcast] = React.useState(initial)
  const [incoming, setIncoming] = React.useState(() => fieldsOf(initial))
  const [version, setVersion] = React.useState(0)
  const [sendOpen, setSendOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false)
  const [templateList, setTemplateList] = React.useState<BroadcastTemplateItem[] | null>(null)
  const segmentNames = React.useMemo(
    () => Object.fromEntries(segments.map((one) => [one.id, one.name])),
    [segments]
  )
  const editable = EDITABLE_STATUSES.has(broadcast.status)

  const listChangedRef = React.useRef(onListChanged)
  React.useEffect(() => {
    listChangedRef.current = onListChanged
  })

  const save = React.useCallback(
    async (next: EmailEditableFields) => {
      const saved = await updateBroadcast({
        broadcastId: initial.id,
        subject: next.subject,
        preheader: next.preheader,
        fromName: next.fromName.trim() || null,
        blocks: next.blocks,
      })
      setBroadcast(saved)
    },
    [initial.id]
  )
  const { fields, change, saveNow } = useEmailDraft({ incoming, version, onSave: save })

  /** Takes the server's copy as the truth, boxes and all. */
  const adopt = React.useCallback((next: BroadcastDetail) => {
    setBroadcast(next)
    setIncoming(fieldsOf(next))
    setVersion((current) => current + 1)
    listChangedRef.current()
  }, [])

  // A send in progress moves on its own, so its numbers are read again while
  // it runs: every 5 seconds, or every 30 while it sleeps between batches.
  const nextBatchAt = broadcast.next_batch_at
  React.useEffect(() => {
    if (broadcast.status !== "sending" && broadcast.status !== "scheduled") return
    const sleeping = nextBatchAt !== null && new Date(nextBatchAt).getTime() - Date.now() > 60_000
    const timer = setInterval(
      () => {
        getBroadcast(broadcast.id)
          .then((read) => {
            if (EDITABLE_STATUSES.has(read.status)) setBroadcast(read)
            else adopt(read)
          })
          .catch(() => undefined)
      },
      sleeping ? SLEEPING_POLL_MS : POLL_MS
    )
    return () => clearInterval(timer)
  }, [adopt, broadcast.id, broadcast.status, nextBatchAt])

  const rename = async (name: string) => {
    if (!name.trim()) return
    try {
      setBroadcast(await updateBroadcast({ broadcastId: broadcast.id, name }))
      onListChanged()
    } catch (error) {
      showErrorToast(getBroadcastErrorMessage(error))
    }
  }

  const openMenu = (open: boolean) => {
    setMenuOpen(open)
    if (open && templateList === null) {
      void templates()
        .then(setTemplateList)
        .catch(() => setTemplateList([]))
    }
  }

  const canSend = broadcast.status === "draft" || broadcast.status === "scheduled"

  return (
    <>
      <RecordFrame
        avatar={<MailIcon aria-hidden />}
        title={broadcast.name}
        hideLabel="Hide the newsletter"
        bare
        actions={
          <TabbedMenu
            label="Newsletter menu"
            align="end"
            width="20.4rem"
            open={menuOpen}
            onOpenChange={openMenu}
            tabs={[
              {
                value: "general",
                label: "General",
                content: (
                  <div className="grid gap-4 p-3">
                    <PickGroup title="Email">
                      <TextPickRow
                        label="Subject"
                        value={fields.subject}
                        placeholder="What this email is about"
                        onCommit={(subject) => change((current) => ({ ...current, subject }))}
                      />
                      <TextPickRow
                        label="Preview line"
                        value={fields.preheader}
                        placeholder="The grey line the inbox shows next to it"
                        onCommit={(preheader) => change((current) => ({ ...current, preheader }))}
                      />
                      <TextPickRow
                        label="From name"
                        value={fields.fromName}
                        placeholder="Blank uses the site's"
                        onCommit={(fromName) => change((current) => ({ ...current, fromName }))}
                      />
                    </PickGroup>
                    <PickGroup
                      title="Newsletter"
                      after={<p className="px-0.5 text-xs text-muted-foreground">Only you see the name.</p>}
                    >
                      <TextPickRow label="Name" value={broadcast.name} onCommit={(name) => void rename(name)} />
                      {editable ? (
                        <PickMenuRow
                          label="Start from"
                          value="A template"
                          options={(templateList ?? []).map((template) => ({ value: template.id, label: template.name }))}
                          selected=""
                          disabled={!templateList?.length}
                          onPick={(templateId) => {
                            const template = templateList?.find((entry) => entry.id === templateId)
                            if (template) change((current) => ({ ...current, blocks: template.blocks }))
                          }}
                        />
                      ) : null}
                    </PickGroup>
                    <div className="grid">
                      <ActionRow
                        icon={<LayoutTemplateIcon className="size-4" />}
                        onClick={() => {
                          setMenuOpen(false)
                          setSaveTemplateOpen(true)
                        }}
                      >
                        Save as a template
                      </ActionRow>
                      <ActionRow
                        icon={<CopyIcon className="size-4" />}
                        onClick={() => {
                          setMenuOpen(false)
                          onCopy(broadcast.id)
                        }}
                      >
                        Make a copy
                      </ActionRow>
                      <div aria-hidden className="-mx-3 my-1.5 border-t" />
                      <ActionRow
                        destructive
                        icon={<Trash2Icon className="size-4" />}
                        onClick={() => {
                          setMenuOpen(false)
                          onDelete(broadcast)
                        }}
                      >
                        Delete
                      </ActionRow>
                    </div>
                  </div>
                ),
              },
              {
                value: "audience",
                label: "Audience",
                content: (
                  <div className="grid gap-3 p-4 text-sm">
                    <p className="text-[15px]">{describeAudienceFilter(broadcast.audienceFilter, segmentNames)}</p>
                    <p className="text-muted-foreground">
                      Who gets it is picked on the way out, in Review and send, with how many people that is.
                    </p>
                  </div>
                ),
              },
              {
                value: "sending",
                label: "Sending",
                content: (
                  <div className="min-h-64">
                    <BroadcastStatusPanel broadcast={broadcast} segmentNames={segmentNames} onUpdated={adopt} />
                  </div>
                ),
              },
            ]}
          />
        }
        body={
          <EmailPage
            fields={fields}
            change={change}
            blockDefaults={blockDefaults}
            editable={editable}
            onOpenSettings={() => openMenu(true)}
          />
        }
        footer={
          <>
            <FooterState>
              <SendIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Badge variant={broadcast.status === "paused" ? "destructive" : "secondary"}>
                {BROADCAST_STATUS_LABELS[broadcast.status]}
              </Badge>
              <span className="truncate text-muted-foreground">{broadcastProgress(broadcast)}</span>
            </FooterState>
            {canSend ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  // Saves what is typed first, so what goes out is what is on screen.
                  void saveNow().then((saved) => {
                    if (saved) setSendOpen(true)
                  })
                }}
              >
                <SendIcon className="size-4" />
                Review and send
              </Button>
            ) : null}
          </>
        }
      />
      <SendBroadcastDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        broadcast={broadcast}
        segments={segments}
        onUpdated={adopt}
      />
      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        blocks={fields.blocks}
        onSaved={() => setTemplateList(null)}
      />
    </>
  )
}

/**
 * One saved template on the right: the email it starts a newsletter with,
 * read only, because a template is changed by saving a newsletter over it.
 * Its ⋮ makes it the one every new newsletter starts from, or deletes it.
 */
export function TemplateRecord({
  template,
  blockDefaults,
  onMakeDefault,
  onDelete,
  onUse,
}: {
  template: BroadcastTemplateItem
  blockDefaults: BroadcastBlockDefaults
  onMakeDefault: (isDefault: boolean) => void
  onDelete: () => void
  /** Starts a new newsletter from it, opened in place. */
  onUse: () => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const fields: EmailEditableFields = { subject: "", preheader: "", fromName: "", blocks: template.blocks }
  return (
    <RecordFrame
      avatar={<LayoutTemplateIcon aria-hidden />}
      title={template.name}
      line={template.isDefault ? "Every new newsletter starts from this one" : `Changed ${formatDate(template.updated_at)}`}
      hideLabel="Hide the template"
      bare
      actions={
        <TabbedMenu
          label="Template menu"
          align="end"
          width="20.4rem"
          open={menuOpen}
          onOpenChange={setMenuOpen}
          tabs={[
            {
              value: "general",
              label: "General",
              content: (
                <div className="grid p-3">
                  <ActionRow
                    icon={<StarIcon className="size-4" />}
                    onClick={() => {
                      setMenuOpen(false)
                      onMakeDefault(!template.isDefault)
                    }}
                  >
                    {template.isDefault ? "Stop starting new newsletters from it" : "Start every new newsletter from it"}
                  </ActionRow>
                  <div aria-hidden className="-mx-3 my-1.5 border-t" />
                  <ActionRow
                    destructive
                    icon={<Trash2Icon className="size-4" />}
                    onClick={() => {
                      setMenuOpen(false)
                      onDelete()
                    }}
                  >
                    Delete
                  </ActionRow>
                </div>
              ),
            },
          ]}
        />
      }
      body={
        <EmailPage
          fields={fields}
          change={() => undefined}
          blockDefaults={blockDefaults}
          editable={false}
          onOpenSettings={() => setMenuOpen(true)}
        />
      }
      footer={
        <>
          <FooterState>
            <span className="truncate text-muted-foreground">{template.blocks.length} blocks</span>
          </FooterState>
          <Button type="button" size="sm" onClick={onUse}>
            <MailIcon className="size-4" />
            New newsletter from it
          </Button>
        </>
      }
    />
  )
}
