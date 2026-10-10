import * as React from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BanIcon,
  ClockIcon,
  MailIcon,
  MailOpenIcon,
  PaperclipIcon,
} from "lucide-react"

import { ReplyComposer } from "@/components/crm/reply-composer"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { EmptyRow } from "@/components/shared/feed-card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { LoadingRow } from "@/components/ui/loading-row"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Conversation, ConversationMessage } from "@/lib/api/crm/inbox"
import type { CrmThreadStatus } from "@/lib/crm/crm"
import type { ReplyDraftUpdate } from "@/lib/crm/reply-drafts"
import { initialsFor } from "@/lib/crm/inbox-time"
import { htmlToText, splitQuotedText } from "@/lib/crm/message-text"
import { formatClockTime, formatDate } from "@/lib/format/format-time"
import { formatFileSize } from "@/lib/format/format-bytes"
import { cn } from "@/lib/utils"

/**
 * The middle panel: one conversation, oldest message at the top, with the box
 * to answer it at the foot.
 *
 * Drawn as a back-and-forth rather than as a stack of email cards. Theirs sit
 * left in a plain bubble and ours sit right in a tinted one, which is the
 * shape anybody reading a conversation already knows. **Which way a message
 * went is said three ways** — the side, the fill, and a label a screen reader
 * can hear — so it never rests on colour alone.
 *
 * Nobody's address is repeated on every message. It is the same two people the
 * whole way down, so it is said once in the header.
 */
export function ConversationPanel({
  conversation,
  leadName,
  leadEmail,
  loading,
  canSend,
  replyFrom,
  replyDraft,
  onReplyDraftChange,
  onStatusChange,
  onMarkUnread,
  onBlockSender,
  onFetchBody,
  onSent,
  onDraft,
}: {
  conversation: Conversation | null
  leadName: string | null
  leadEmail: string | null
  loading: boolean
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
  onMarkUnread: () => void
  /** Blocks the address this conversation is with, and closes the thread. */
  onBlockSender: () => Promise<void>
  onFetchBody: (messageId: string) => Promise<void>
  onSent: () => void
  onDraft: () => Promise<string>
}) {
  const endRef = React.useRef<HTMLDivElement | null>(null)
  const [snoozeOpen, setSnoozeOpen] = React.useState(false)
  const [blockOpen, setBlockOpen] = React.useState(false)
  const [blocking, setBlocking] = React.useState(false)

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
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
        <DashboardCardHeader>
          <span className="flex size-4 items-center justify-center text-muted-foreground">
            <MailIcon className="size-4" aria-hidden />
          </span>
          <h2 className="font-heading text-[0.891rem] leading-snug font-medium">
            Conversation
          </h2>
        </DashboardCardHeader>
        <div className="grid min-h-0 flex-1 place-items-center">
          {loading ? (
            <LoadingRow label="Opening…" />
          ) : (
            <EmptyRow>Pick a conversation on the left to read it.</EmptyRow>
          )}
        </div>
      </div>
    )
  }

  const who = leadName?.trim() || leadEmail || "This conversation"
  const closed = conversation.status === "closed"

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <DashboardCardHeader className="gap-2.5">
        <Avatar size="sm">
          <AvatarFallback className="text-[0.6875rem] font-medium">
            {initialsFor(leadName, leadEmail ?? "")}
          </AvatarFallback>
        </Avatar>

        <h2 className="font-heading min-w-0 truncate text-[0.891rem] leading-snug font-medium">
          {who}
        </h2>
        {leadEmail && leadEmail !== who ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {leadEmail}
          </span>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <HeaderAction
            label="Mark as unread"
            onClick={onMarkUnread}
            icon={<MailOpenIcon className="size-4" />}
          />

          <Popover open={snoozeOpen} onOpenChange={setSnoozeOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "size-8",
                  conversation.status === "snoozed" && "text-primary"
                )}
                aria-label={
                  conversation.status === "snoozed"
                    ? "Snoozed. Change the date"
                    : "Snooze until a date"
                }
              >
                <ClockIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
              <div className="grid gap-2">
                <p className="text-xs text-muted-foreground">
                  It leaves the inbox until this date, then comes back on its
                  own.
                </p>
                <DatePicker
                  value={
                    conversation.snoozed_until
                      ? new Date(conversation.snoozed_until)
                      : undefined
                  }
                  placeholder="Pick a date"
                  onChange={(date) => {
                    setSnoozeOpen(false)
                    if (!date) {
                      onStatusChange("open", null)
                      return
                    }
                    onStatusChange("snoozed", date.toISOString())
                  }}
                />
                {conversation.status === "snoozed" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSnoozeOpen(false)
                      onStatusChange("open", null)
                    }}
                  >
                    Bring it back now
                  </Button>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>

          <HeaderAction
            label="Block this address"
            onClick={() => setBlockOpen(true)}
            icon={<BanIcon className="size-4" />}
          />

          <HeaderAction
            label={closed ? "Reopen this conversation" : "Close it"}
            onClick={() => onStatusChange(closed ? "open" : "closed")}
            active={closed}
            icon={
              closed ? (
                <ArchiveRestoreIcon className="size-4" />
              ) : (
                <ArchiveIcon className="size-4" />
              )
            }
          />
        </div>
      </DashboardCardHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-1 p-4">
          {conversation.subject ? (
            <p className="pb-2 text-center text-xs text-muted-foreground">
              {conversation.subject}
            </p>
          ) : null}

          {conversation.messages.map((message, index) => {
            const previous = conversation.messages[index - 1]
            const newDay =
              !previous ||
              new Date(previous.occurred_at).toDateString() !==
                new Date(message.occurred_at).toDateString()

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
              </React.Fragment>
            )
          })}
          <div ref={endRef} aria-hidden />
        </div>
      </ScrollArea>

      {/* A confirmation, although nothing is destroyed. The button sits in a
          row of four square icons, and a misclick that silently stopped a real
          customer's mail reaching the inbox is the one failure this feature is
          shaped around. */}
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

      <ReplyComposer
        threadId={conversation.id}
        body={replyDraft}
        canSend={canSend}
        onBodyChange={onReplyDraftChange}
        replyFrom={replyFrom}
        onSent={onSent}
        onDraft={onDraft}
      />
    </div>
  )
}

/** One of the square buttons in the header, so they cannot drift apart. */
function HeaderAction({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-8", active && "text-primary")}
          aria-label={label}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
          <ul className="mt-2.5 grid gap-1 border-t pt-2">
            {message.attachments.map((attachment, index) => (
              <li
                key={attachment.id || `${attachment.filename}-${index}`}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <PaperclipIcon className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{attachment.filename}</span>
                {attachment.size !== null ? (
                  <span className="shrink-0">
                    {formatFileSize(attachment.size)}
                  </span>
                ) : null}
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
