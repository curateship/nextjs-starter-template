import * as React from "react"
import { GitMergeIcon, MessageSquareTextIcon, SettingsIcon, SquareMousePointerIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { MenuActionRow } from "@/components/admin-dashboard/list-parts"
import { Chip } from "@/components/crm/crm-table"
import { EmptyRecord, RecordFrame } from "@/components/crm/record-frame"
import { PickGroup, PickRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  createFeedbackComment,
  deleteFeedbackComment,
  getFeedbackErrorMessage,
  listFeedbackComments,
  type FeedbackCommentItem,
  type FeedbackItem,
} from "@/lib/api/feedback"
import { feedbackStatusLabels } from "@/lib/feedback/feedback-status"
import { feedbackTagLabels } from "@/lib/feedback/feedback-tags"
import { feedbackTypeLabels } from "@/lib/feedback/feedback-type"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useLoad } from "@/lib/hooks/use-load"
import { showErrorToast } from "@/lib/toast/error-toast"

const HIDE_LABEL = "Hide the thread"

/** The server's own limit on one reply. */
const REPLY_MAX_LENGTH = 5000

/**
 * The Feedback tab's right panel: the thread open (Tyler, 8 Nov 2026:
 * "Clicking on the feedback thread should open its thread on the right panel
 * to see all the replies and I can also reply to it in the footer"). It
 * replaced the comments window, in the CRM's one record frame:
 *
 * - **Header:** the feedback on one line (it has no title of its own), then
 *   its type, status and votes, then the ⋮: Feedback settings and Merge open
 *   their windows, Delete asks first.
 * - **Body:** the feedback as written, its tags and screenshot, then every
 *   reply oldest first. A reply its writer or an admin may delete has a bin.
 * - **Footer:** a reply box. Enter sends, Shift+Enter starts a new line. The
 *   author is told, as a reply from the member board tells them.
 *
 * `onRepliesChange` tells the list a reply came or went, so the row's count
 * follows at once.
 */
export function FeedbackThreadPanel({
  feedback,
  openId,
  onSettings,
  onMerge,
  onDelete,
  onRepliesChange,
}: {
  /** The thread open, or null when there is none or it has gone. */
  feedback: FeedbackItem | null
  openId: string | undefined
  onSettings: (feedback: FeedbackItem) => void
  onMerge: (feedback: FeedbackItem) => void
  onDelete: (feedback: FeedbackItem) => void
  onRepliesChange: (feedbackId: string, change: number) => void
}) {
  if (!feedback) {
    return (
      <EmptyRecord
        title="Thread"
        icon={<SquareMousePointerIcon aria-hidden />}
        line={openId ? "That feedback is not there any more." : "Click a piece of feedback to read its thread here."}
        hideLabel={HIDE_LABEL}
      />
    )
  }
  return (
    <OpenThread
      feedback={feedback}
      onSettings={onSettings}
      onMerge={onMerge}
      onDelete={onDelete}
      onRepliesChange={onRepliesChange}
    />
  )
}

function OpenThread({
  feedback,
  onSettings,
  onMerge,
  onDelete,
  onRepliesChange,
}: {
  feedback: FeedbackItem
  onSettings: (feedback: FeedbackItem) => void
  onMerge: (feedback: FeedbackItem) => void
  onDelete: (feedback: FeedbackItem) => void
  onRepliesChange: (feedbackId: string, change: number) => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  // The replies as read, then as added and deleted here.
  const [replies, setReplies] = React.useState<FeedbackCommentItem[] | null>(null)
  const load = useLoad(() => listFeedbackComments(feedback.id), getFeedbackErrorMessage, {
    keys: [feedback.id],
    onLoad: (data) => setReplies(data.comments),
  })
  const [deleteTarget, setDeleteTarget] = React.useState<FeedbackCommentItem | null>(null)
  const [runDelete, deleting] = useAsyncAction(getFeedbackErrorMessage)
  const bottomRef = React.useRef<HTMLDivElement | null>(null)

  const fromMenu = (action: () => void) => () => {
    setMenuOpen(false)
    action()
  }

  const removeReply = () => {
    if (!deleteTarget) return
    const target = deleteTarget
    void runDelete(async () => {
      await deleteFeedbackComment(target.id)
      setReplies((current) => (current ?? []).filter((reply) => reply.id !== target.id))
      onRepliesChange(feedback.id, -1)
      setDeleteTarget(null)
    }, "Reply deleted.")
  }

  const line = [
    feedbackTypeLabels[feedback.type],
    feedbackStatusLabels[feedback.status],
    `${feedback.vote_count} ${plural(feedback.vote_count, "vote", "votes")}`,
  ].join(" · ")

  return (
    <>
      <RecordFrame
        avatar={<MessageSquareTextIcon aria-hidden />}
        title={feedback.message.replace(/\s+/g, " ").trim()}
        line={line}
        hideLabel={HIDE_LABEL}
        actions={
          <TabbedMenu
            label="Feedback menu"
            align="end"
            width="20.4rem"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            tabs={[
              {
                value: "general",
                label: "General",
                content: (
                  <div className="grid gap-4 p-3">
                    <PickGroup title="Feedback">
                      <PickRow label="From" value={feedback.author_name} disabled>
                        {null}
                      </PickRow>
                      <PickRow label="Posted" value={formatDateTime(feedback.created_at)} disabled>
                        {null}
                      </PickRow>
                      <PickRow
                        label="Tags"
                        value={feedback.tags.length ? feedback.tags.map((tag) => feedbackTagLabels[tag]).join(", ") : "None"}
                        empty={!feedback.tags.length}
                        disabled
                      >
                        {null}
                      </PickRow>
                    </PickGroup>
                    <div className="grid">
                      <MenuActionRow icon={<SettingsIcon />} onClick={fromMenu(() => onSettings(feedback))}>
                        Feedback settings
                      </MenuActionRow>
                      <MenuActionRow icon={<GitMergeIcon />} onClick={fromMenu(() => onMerge(feedback))}>
                        Merge into another item
                      </MenuActionRow>
                      <div aria-hidden className="-mx-3 my-1.5 border-t" />
                      <MenuActionRow icon={<Trash2Icon />} destructive onClick={fromMenu(() => onDelete(feedback))}>
                        Delete feedback
                      </MenuActionRow>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        }
        body={
          <>
            <section className="grid gap-2" aria-label="The feedback">
              <p className="text-sm">
                <span className="font-medium">{feedback.author_name}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(feedback.created_at, formatDateTime)}
                </span>
              </p>
              <p className="text-sm whitespace-pre-wrap">{feedback.message}</p>
              {feedback.tags.length ? (
                <span className="flex flex-wrap gap-1">
                  {feedback.tags.map((tag) => (
                    <Chip key={tag} muted>
                      {feedbackTagLabels[tag]}
                    </Chip>
                  ))}
                </span>
              ) : null}
              {feedback.attachment_url ? (
                <a
                  href={feedback.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open the screenshot at full size"
                  className="block w-fit max-w-full rounded-lg"
                >
                  <img
                    src={feedback.attachment_url}
                    alt="Screenshot attached to this feedback"
                    loading="lazy"
                    className="max-h-48 max-w-full rounded-lg border"
                  />
                </a>
              ) : null}
            </section>

            <section className="grid gap-2 border-t pt-3.75" aria-label="Replies">
              <h3 className="px-0.5 text-sm font-medium text-muted-foreground">
                {replies && replies.length
                  ? `${replies.length} ${plural(replies.length, "reply", "replies")}`
                  : "Replies"}
              </h3>
              {load.error && !replies ? (
                <span className="grid justify-items-start gap-2 text-sm text-muted-foreground">
                  {load.error}
                  <Button type="button" variant="outline" size="sm" onClick={load.retry}>
                    Try again
                  </Button>
                </span>
              ) : replies === null ? null : replies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No replies yet.</p>
              ) : (
                <ol className="grid gap-3">
                  {replies.map((reply) => (
                    <ReplyRow key={reply.id} reply={reply} onDelete={() => setDeleteTarget(reply)} />
                  ))}
                </ol>
              )}
              <div ref={bottomRef} />
            </section>
          </>
        }
        footer={
          <ReplyBox
            feedbackId={feedback.id}
            onSent={(reply) => {
              setReplies((current) => [...(current ?? []), reply])
              onRepliesChange(feedback.id, 1)
              // After the new reply is drawn, so it is the one in view.
              requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }))
            }}
          />
        }
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete this reply?"
        description={
          deleteTarget
            ? `${quoteOneLine(deleteTarget.message)} by ${deleteTarget.author_name} goes. This cannot be undone.`
            : null
        }
        confirmLabel="Delete reply"
        loading={deleting}
        onConfirm={removeReply}
      />
    </>
  )
}

/** One reply: the writer's initial, name and when, the words, and a bin when they may go. */
function ReplyRow({ reply, onDelete }: { reply: FeedbackCommentItem; onDelete: () => void }) {
  return (
    <li className="group/reply flex items-start gap-2.5">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-medium text-muted-foreground"
      >
        {reply.author_name.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-1.5 text-sm">
          <span className="truncate font-medium">{reply.author_name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(reply.created_at, formatDateTime)}
          </span>
        </p>
        <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{reply.message}</p>
      </div>
      {reply.can_delete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete the reply by ${reply.author_name}`}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      ) : null}
    </li>
  )
}

/**
 * The reply box at the foot of the thread. Enter sends and Shift+Enter starts a
 * new line. What is typed stays in the box when a send fails, so nothing is
 * lost over something that can be tried again.
 */
function ReplyBox({ feedbackId, onSent }: { feedbackId: string; onSent: (reply: FeedbackCommentItem) => void }) {
  const [text, setText] = React.useState("")
  const [sending, setSending] = React.useState(false)

  const send = async () => {
    if (sending) return
    const message = text.trim()
    if (!message) {
      showErrorToast("Write a reply first.")
      return
    }
    setSending(true)
    try {
      const reply = await createFeedbackComment({ feedbackId, message })
      setText("")
      toast.success("Reply sent.")
      onSent(reply)
    } catch (error) {
      showErrorToast(getFeedbackErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <Textarea
        aria-label="Your reply"
        placeholder="Write a reply"
        rows={2}
        maxLength={REPLY_MAX_LENGTH}
        value={text}
        className="min-h-16 resize-none bg-background"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
          event.preventDefault()
          void send()
        }}
      />
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Shift+Enter for a new line</span>
        <Button type="button" size="sm" disabled={sending} onClick={() => void send()}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  )
}
