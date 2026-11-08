import * as React from "react"
import {
  ForwardIcon,
  InboxIcon,
  PaperclipIcon,
  SparklesIcon,
  StarIcon,
} from "lucide-react"

import { CrmRecordMenu } from "@/components/crm/crm-record-menu"
import { ForwardDialog } from "@/components/crm/forward-dialog"
import { ReplyComposer } from "@/components/crm/reply-composer"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Conversation, ConversationFile, ConversationMessage } from "@/lib/api/crm/inbox"
import type { LeadPanel as LeadRecord } from "@/lib/api/crm/leads"
import {
  CRM_THREAD_STATUS_LABELS,
  type CrmThreadStatus,
} from "@/lib/crm/crm"
import type { ReplyDraftUpdate } from "@/lib/crm/reply-drafts"
import { initialsFor } from "@/lib/crm/inbox-time"
import { htmlToText, splitQuotedText } from "@/lib/crm/message-text"
import { formatClockTime, formatDate } from "@/lib/format/format-time"
import { formatFileSize } from "@/lib/format/format-bytes"
import { cn } from "@/lib/utils"

/**
 * The right panel of the CRM dashboard (the Admin 3 panel design, 7 Nov
 * 2026; Tyler: "Right panel shows the full conversation and information about
 * that contact"): one conversation, oldest message at the top, the folding
 * Contact card and the box to answer it at the foot.
 *
 * Drawn as a back-and-forth rather than as a stack of email cards. Theirs sit
 * left in a plain bubble and ours sit right in a tinted one, which is the
 * shape anybody reading a conversation already knows. **Which way a message
 * went is said three ways** — the side, the fill, and a label a screen reader
 * can hear — so it never rests on colour alone.
 *
 * Nobody's address is repeated on every message. It is the same two people the
 * whole way down, so it is said once in the header.
 *
 * The header is the person, the Save star and the ⋮ (`CrmRecordMenu`), which
 * holds the contact's facts as grouped rows and what used to be four square
 * buttons: mark unread, snooze, close and block.
 */
export function ConversationPanel({
  conversation,
  lead,
  siteTags,
  leadName,
  leadEmail,
  loading,
  emptyLine,
  canSend,
  replyFrom,
  replyDraft,
  onReplyDraftChange,
  onStatusChange,
  onSavedChange,
  onMarkUnread,
  onSummarise,
  onBlockSender,
  onLeadChanged,
  onFetchBody,
  onSent,
  onDraft,
}: {
  conversation: Conversation | null
  /** Who it is with, or null while that is still being read. */
  lead: LeadRecord | null
  /** Every tag the site uses, for the ⋮'s Tags row. */
  siteTags: string[]
  leadName: string | null
  leadEmail: string | null
  loading: boolean
  /**
   * Said when no conversation can open because the list is empty, such as
   * "No mail has arrived yet." Null while the list has rows.
   */
  emptyLine: string | null
  canSend: boolean
  /**
   * The whole From line a reply will carry, for the footnote under Send, and
   * null when there is no address for mail to arrive at.
   */
  replyFrom: string | null
  /** What is half typed in the reply box for this conversation. */
  replyDraft: string
  onReplyDraftChange: (threadId: string, update: ReplyDraftUpdate) => void
  onStatusChange: (status: CrmThreadStatus, snoozedUntil?: string | null) => void
  onSavedChange: (saved: boolean) => void
  onMarkUnread: () => void
  /** Writes what the conversation is about, through the metered AI path. */
  onSummarise: () => Promise<void>
  /** Blocks the address this conversation is with, and closes the thread. */
  onBlockSender: () => Promise<void>
  onLeadChanged: () => void
  onFetchBody: (messageId: string) => Promise<void>
  onSent: () => void
  onDraft: () => Promise<string>
}) {
  const endRef = React.useRef<HTMLDivElement | null>(null)
  const [blockOpen, setBlockOpen] = React.useState(false)
  const [blocking, setBlocking] = React.useState(false)
  const [summarising, setSummarising] = React.useState(false)
  const [forwarding, setForwarding] = React.useState(false)
  const summarise = () => {
    if (summarising) return
    setSummarising(true)
    void onSummarise().finally(() => setSummarising(false))
  }

  // The newest mail is at the bottom, so that is where the panel opens. Every
  // mail client does this, and starting at the top of a long thread means
  // scrolling past mail you have already read to find the one that is new.
  //
  // Scrolled to by a marker at the end of the list rather than by setting the
  // scroll box's own offset, which would need a handle on a Radix viewport
  // this component does not own.
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [conversation?.id, conversation?.messages.length])

  if (!conversation) {
    // No ×, never emptied by hand: the dashboard opens the first row on
    // arrival, so this shows only while that loads or when there is no mail.
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
        <div>
          <DashboardCardHeader className="gap-2.5">
            <h2 className="font-heading min-w-0 flex-1 truncate text-[0.891rem] leading-snug font-medium">
              Conversation
            </h2>
            <SidePanelCollapseButton side="right" label="Hide the conversation" />
          </DashboardCardHeader>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center p-6">
          {/* Nothing while it opens, never a loading circle (Tyler, 7 Nov
              2026: "remove the loading circle... in the right panel"). */}
          {loading || !emptyLine ? null : (
            <div className="grid justify-items-center gap-2 text-center text-sm text-muted-foreground">
              <InboxIcon className="size-6" aria-hidden />
              <p>{emptyLine}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const who = leadName?.trim() || leadEmail || "This conversation"

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      {/* Wrapped in its own div, so the shell's table line under a header
          never matches this side panel's header (the Admin 3 panel design). */}
      <div>
        <DashboardCardHeader className="gap-2">
          <Avatar size="sm" className="ml-1 shrink-0">
            <AvatarFallback className="text-[0.6875rem] font-medium">
              {initialsFor(leadName, leadEmail ?? "")}
            </AvatarFallback>
          </Avatar>

          <span className="grid min-w-0 flex-1 leading-tight">
            <h2 className="font-heading truncate text-[0.891rem] font-medium">
              {who}
            </h2>
            {leadEmail && leadEmail !== who ? (
              <span className="truncate text-xs text-muted-foreground">
                {leadEmail}
              </span>
            ) : null}
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-pressed={conversation.saved}
                aria-label={conversation.saved ? "Saved. Take it out of Saved" : "Save it"}
                onClick={() => onSavedChange(!conversation.saved)}
              >
                <StarIcon
                  className={cn(
                    "size-4",
                    conversation.saved && "fill-amber-400 text-amber-500"
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {conversation.saved ? "Take it out of Saved" : "Save it"}
            </TooltipContent>
          </Tooltip>

          <CrmRecordMenu
            conversation={conversation}
            lead={lead}
            siteTags={siteTags}
            onLeadChanged={onLeadChanged}
            onStatusChange={onStatusChange}
            onMarkUnread={onMarkUnread}
            onSummarise={conversation.canSummarise ? summarise : null}
            onForward={() => setForwarding(true)}
            onBlock={() => setBlockOpen(true)}
          />
          <SidePanelCollapseButton side="right" label="Hide the conversation" />
        </DashboardCardHeader>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-1 p-4">
          {conversation.subject ? (
            <p className="pb-2 text-center text-xs text-muted-foreground">
              {conversation.subject}
            </p>
          ) : null}

          {summarising || conversation.summary ? (
            <section
              aria-label="What this conversation is about"
              className="mb-2 grid gap-1.5 rounded-xl bg-muted/50 p-3 text-sm"
            >
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <SparklesIcon className="size-3.5" aria-hidden />
                What this is about
              </h3>
              {summarising ? (
                <p className="text-muted-foreground">Writing…</p>
              ) : (
                <p className="whitespace-pre-wrap">{conversation.summary}</p>
              )}
              {conversation.summaryStale && !summarising ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Newer mail has come since this was written.</span>
                  <Button type="button" variant="ghost" size="xs" onClick={summarise}>
                    Write it again
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {conversation.messages.map((message, index) => {
            const previous = conversation.messages[index - 1]
            const next = conversation.messages[index + 1]
            const newDay =
              !previous ||
              new Date(previous.occurred_at).toDateString() !==
                new Date(message.occurred_at).toDateString()
            // Each forward made after this message and before the next one,
            // as a quiet line in its place in time.
            const forwardsHere = conversation.forwards.filter(
              (forward) =>
                forward.forwarded_at >= message.occurred_at &&
                (!next || forward.forwarded_at < next.occurred_at)
            )

            return (
              <React.Fragment key={message.id}>
                {newDay ? (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    {formatDate(message.occurred_at)}
                  </p>
                ) : null}
                <MessageBubble
                  message={message}
                  onFetchBody={() => onFetchBody(message.id)}
                />
                {forwardsHere.map((forward) => (
                  <p
                    key={forward.id}
                    className="flex items-center justify-center gap-1.5 py-2 text-center text-xs text-muted-foreground"
                  >
                    <ForwardIcon className="size-3.5" aria-hidden />
                    Forwarded to {forward.toEmail}, {formatDate(forward.forwarded_at)}{" "}
                    {formatClockTime(forward.forwarded_at)}
                  </p>
                ))}
              </React.Fragment>
            )
          })}
          <div ref={endRef} aria-hidden />
        </div>
      </ScrollArea>

      {/* A confirmation, although nothing is destroyed: a misclick that
          silently stopped a real customer's mail reaching the inbox is the one
          failure this feature is shaped around. */}
      <ForwardDialog
        open={forwarding}
        threadId={conversation.id}
        onClose={() => setForwarding(false)}
        onSent={onSent}
      />

      <ConfirmDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        destructive={false}
        title="Block mail from this address?"
        description={`Mail from ${leadEmail ?? "this address"} stops reaching the inbox and this conversation closes. Nothing is deleted: every message is still recorded, and Settings → Email → Blocked senders unblocks the address in one press.`}
        confirmLabel="Block the address"
        loading={blocking}
        onConfirm={() => {
          setBlocking(true)
          void onBlockSender().finally(() => {
            setBlocking(false)
            setBlockOpen(false)
          })
        }}
      />

      {/* The reply box, then one last line: the state on the left, and Draft
          with AI, Attach and Send on the right. Snooze and Close are in the
          ⋮'s Conversation group; the lead's facts are in its General tab. */}
      {/* Light grey, the reply box white on it (Tyler, 7 Nov 2026: "make the
          whole footer light gray"). */}
      <footer className="shrink-0 border-t bg-muted/50">
        <ReplyComposer
          status={
            conversation.status === "snoozed" && conversation.snoozed_until
              ? `Snoozed until ${formatDate(conversation.snoozed_until)}`
              : CRM_THREAD_STATUS_LABELS[conversation.status]
          }
          threadId={conversation.id}
          body={replyDraft}
          canSend={canSend}
          onBodyChange={onReplyDraftChange}
          replyFrom={replyFrom}
          onSent={onSent}
          onDraft={onDraft}
        />
      </footer>
    </div>
  )
}


function MessageBubble({
  message,
  onFetchBody,
}: {
  message: ConversationMessage
  onFetchBody: () => Promise<void>
}) {
  const [showQuoted, setShowQuoted] = React.useState(false)
  const [fetching, setFetching] = React.useState(false)
  const outbound = message.direction === "out"

  const split =
    !message.isHtml && message.body
      ? splitQuotedText(message.body)
      : { own: message.body ?? "", quoted: null }

  return (
    <article
      className={cn(
        "flex w-full flex-col gap-1",
        outbound ? "items-end" : "items-start"
      )}
    >
      {/* Said in words, not only in the shape, so a screen reader can tell the
          two apart. The bubble itself carries no label at all. */}
      <span className="sr-only">{outbound ? "You wrote" : "They wrote"}</span>

      <div
        className={cn(
          "max-w-[85%] min-w-0 rounded-2xl px-3.5 py-2.5 text-sm",
          outbound
            ? "bg-primary/10 text-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {!message.bodyReady ? (
          <div className="grid justify-items-start gap-2">
            <p className="text-muted-foreground">
              {message.bodyGaveUp
                ? "The words of this email could not be fetched."
                : "The words of this email are still on their way."}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={fetching}
              onClick={async () => {
                setFetching(true)
                try {
                  await onFetchBody()
                } finally {
                  setFetching(false)
                }
              }}
            >
              {fetching ? "Trying…" : "Try again"}
            </Button>
          </div>
        ) : message.isHtml ? (
          // Somebody else's HTML is not put into this page. It is read as
          // text, which loses the formatting and cannot run anything.
          <p className="break-words whitespace-pre-wrap">
            {htmlToText(message.body ?? "")}
          </p>
        ) : (
          <>
            <p className="break-words whitespace-pre-wrap">{split.own}</p>
            {split.quoted ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowQuoted((shown) => !shown)}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {showQuoted ? "Hide earlier text" : "Show earlier text"}
                </button>
                {showQuoted ? (
                  <p className="mt-2 border-l-2 pl-3 text-xs break-words whitespace-pre-wrap text-muted-foreground">
                    {split.quoted}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {message.attachments.length > 0 ? (
          <ul className="mt-2.5 grid gap-1.5 border-t pt-2">
            {message.attachments.map((attachment, index) => (
              <li key={attachment.id || `${attachment.filename}-${index}`}>
                <FileLine file={attachment} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <time
        dateTime={message.occurred_at}
        className="px-1 text-xs text-muted-foreground tabular-nums"
      >
        {formatClockTime(message.occurred_at)}
      </time>
    </article>
  )
}

/** What a file that is not stored says instead of opening (CRM task 21). */
const FILE_STATE_WORDS: Record<Exclude<ConversationFile["state"], "ready">, string | null> = {
  fetching: "On its way",
  "gave-up": "Could not be fetched",
  "too-big": "Too big to keep, over 25 MB",
  "no-storage": "Set up file storage to open it",
  "names-only": null,
}

const PICTURE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])

/**
 * A stored picture, drawn small. Fetched and shown from memory rather than
 * pointed at by the picture's own address: the local dev server answers an
 * `<img>` request to an app route with a 404 (it asks for a static file), and
 * a fetch is answered like any other request.
 */
function PictureLine({ href, filename }: { href: string; filename: string }) {
  const [shown, setShown] = React.useState<{ for: string; url: string } | null>(null)
  React.useEffect(() => {
    let url: string | null = null
    let cancelled = false
    fetch(href, { credentials: "same-origin" })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return
        url = URL.createObjectURL(blob)
        setShown({ for: href, url })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [href])
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="grid max-w-56 gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      {shown?.for === href ? (
        <img src={shown.url} alt={filename} className="max-h-40 rounded-lg border object-cover" />
      ) : (
        <span className="grid h-20 place-items-center rounded-lg border bg-muted/50">
          <PaperclipIcon className="size-4" aria-hidden />
        </span>
      )}
      <span className="truncate">{filename}</span>
    </a>
  )
}

/**
 * One file in a bubble: a small picture for a stored picture, a link for any
 * other stored file, and otherwise its name with why it does not open.
 */
export function FileLine({ file }: { file: ConversationFile }) {
  const size = file.size !== null ? formatFileSize(file.size) : null
  if (file.href && PICTURE_TYPES.has((file.contentType ?? "").toLowerCase())) {
    return <PictureLine href={file.href} filename={file.filename} />
  }
  const words = file.href ? null : FILE_STATE_WORDS[file.state as Exclude<ConversationFile["state"], "ready">]
  const inner = (
    <>
      <PaperclipIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{file.filename}</span>
      {size ? <span className="shrink-0">{size}</span> : null}
      {words ? <span className="shrink-0 italic">{words}</span> : null}
    </>
  )
  return file.href ? (
    <a
      href={file.href}
      className="flex items-center gap-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      {inner}
    </a>
  ) : (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">{inner}</span>
  )
}
