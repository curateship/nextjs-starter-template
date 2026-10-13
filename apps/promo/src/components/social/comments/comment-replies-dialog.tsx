import * as React from "react"
import {
  AlertTriangleIcon,
  ArrowUpIcon,
  ClockIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  cancelReply,
  getReplyErrorMessage,
  loadReplies,
  sendReply,
  writeReplyDrafts,
  type CommentReplies,
} from "@/lib/api/social/comments"
import { formatTimeAgo } from "@/lib/format/format-time"
import { MAX_COMMENT_CHARS } from "@/lib/social/options"
import { postedDateText, waitingReplyText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { Hint } from "../hint"

/** How often to ask again while an answer is on its way now. */
const POLL_MS = 2_000

type ReplyView = NonNullable<CommentReplies["replies"]>[number]

/** Only an address on Reddit is ever opened from a stored value. */
function openOnReddit(url: string) {
  if (url.startsWith("https://www.reddit.com/")) window.open(url, "_blank", "noopener,noreferrer")
}

/**
 * A sent comment and the replies directly under it, each with a box to
 * answer it: draft with AI, read it, press Reply. The answer goes out from
 * the account that sent the comment, under the same rules as Post.
 *
 * The replies' words come from the comment's last check, so a comment never
 * read says so and offers Read again. Nothing here answers on its own, and a
 * failed answer stays on screen with why and the words that were tried.
 */
export function CommentRepliesDialog({
  commentId,
  checkedAt,
  checking,
  onCheck,
  onClose,
}: {
  /** The comment whose replies are open, or null when the window is shut. */
  commentId: string | null
  /** The row's last reading, so a check that lands reloads the window. */
  checkedAt: Date | null
  /** A check of this comment is waiting or running. */
  checking: boolean
  onCheck: (commentId: string) => Promise<void>
  onClose: () => void
}) {
  const [state, setState] = React.useState<{
    commentId: string | null
    data: CommentReplies | null
    error: string | null
  }>({ commentId: null, data: null, error: null })
  /** What is typed in each reply's box, by reply id. */
  const [texts, setTexts] = React.useState<Record<string, string>>({})
  /** The draft each box's words came from, until they are edited. */
  const [fromDraft, setFromDraft] = React.useState<Record<string, string | null>>({})
  /** The reply whose drafts, answer or cancel is on its way. */
  const [busy, setBusy] = React.useState<{ replyId: string; what: "draft" | "send" | "cancel" } | null>(null)
  const [invalid, setInvalid] = React.useState<string | null>(null)

  const ready = commentId !== null && state.commentId === commentId
  const data = ready ? state.data : null
  const checkedKey = checkedAt ? new Date(checkedAt).getTime() : 0

  const reload = React.useCallback(
    (id: string): Promise<void> =>
      loadReplies(id).then(
        (next) => setState({ commentId: id, data: next, error: null }),
        (error: unknown) =>
          setState({ commentId: id, data: null, error: getReplyErrorMessage(error) })
      ),
    []
  )

  // Read when opened, and again whenever a check of the comment lands.
  React.useEffect(() => {
    if (!commentId) return
    void reload(commentId)
  }, [commentId, checkedKey, reload])

  // An answer going out now finishes on its own, so the window asks until it
  // has. One waiting for the account's morning is not asked about.
  const sending = Boolean(data?.replies?.some((reply) => reply.pending?.running))
  React.useEffect(() => {
    if (!commentId || !sending) return
    const timer = setInterval(() => void reload(commentId), POLL_MS)
    return () => clearInterval(timer)
  }, [commentId, sending, reload])

  const dirty = Object.values(texts).some((text) => text.trim() !== "")

  function close() {
    setTexts({})
    setFromDraft({})
    setInvalid(null)
    onClose()
  }

  async function draft(reply: ReplyView) {
    if (!commentId) return
    setBusy({ replyId: reply.id, what: "draft" })
    try {
      await writeReplyDrafts(commentId, reply.id)
      await reload(commentId)
    } catch (error) {
      showErrorToast(getReplyErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function send(reply: ReplyView) {
    if (!commentId) return
    const text = (texts[reply.id] ?? "").trim()
    if (!text) {
      setInvalid(reply.id)
      showErrorToast(`Write the answer to u/${reply.author} first, or press Write with AI.`)
      return
    }
    setBusy({ replyId: reply.id, what: "send" })
    try {
      const { runAfter, handle } = await sendReply({
        commentId,
        replyId: reply.id,
        text,
        draftId: fromDraft[reply.id] ?? null,
      })
      setTexts((current) => ({ ...current, [reply.id]: "" }))
      setFromDraft((current) => ({ ...current, [reply.id]: null }))
      toast.success(
        runAfter
          ? waitingReplyText(new Date(runAfter), handle || null)
          : "Your answer is on its way. It takes a few minutes, because the account looks around Reddit first."
      )
      await reload(commentId)
    } catch (error) {
      showErrorToast(getReplyErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function cancel(reply: ReplyView) {
    if (!commentId) return
    setBusy({ replyId: reply.id, what: "cancel" })
    try {
      await cancelReply(commentId, reply.id)
      await reload(commentId)
    } catch (error) {
      showErrorToast(getReplyErrorMessage(error))
      await reload(commentId)
    } finally {
      setBusy(null)
    }
  }

  return (
    <FormDialog open={commentId !== null} dirty={dirty} busy={busy?.what === "send"} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Replies to your comment</DialogTitle>
            <DialogDescription>
              {data
                ? `On "${data.postTitle || "a post with no title"}" in r/${data.subreddit}. Answers go out from ${data.handle ? `u/${data.handle}` : "the account that sent it"}.`
                : "The replies directly under a comment you sent, and your answers."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {!ready ? (
              <div className="flex justify-center py-8">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
              </div>
            ) : state.error || !data ? (
              <Card size="sm">
                <CardContent className="grid gap-2">
                  <p className="text-sm">{state.error ?? "The replies could not be read."}</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-self-start"
                    onClick={() => commentId && void reload(commentId)}
                  >
                    Try again
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Your comment</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    <p className="text-sm whitespace-pre-wrap">{data.text}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {checking
                          ? "Reading the replies…"
                          : data.checkedAt
                            ? `Replies read ${formatTimeAgo(data.checkedAt)}`
                            : "Replies not read yet"}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={checking}
                        onClick={() => void onCheck(data.commentId)}
                      >
                        {checking ? (
                          <Loader2Icon className="animate-spin" />
                        ) : (
                          <RefreshCwIcon />
                        )}
                        Read again
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {data.replies === null ? (
                  <p className="text-sm text-muted-foreground">
                    The replies' words have not been read yet. Press Read again, and they show
                    here once the reader browser has been to Reddit.
                  </p>
                ) : data.replies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nobody has replied directly to this comment.
                  </p>
                ) : (
                  data.replies.map((reply) => (
                    <ReplyCard
                      key={reply.id}
                      reply={reply}
                      handle={data.handle}
                      text={texts[reply.id] ?? ""}
                      fromDraft={fromDraft[reply.id] ?? null}
                      invalid={invalid === reply.id}
                      busy={busy?.replyId === reply.id ? busy.what : null}
                      locked={busy !== null}
                      onText={(text, draftId) => {
                        setTexts((current) => ({ ...current, [reply.id]: text }))
                        setFromDraft((current) => ({ ...current, [reply.id]: draftId }))
                        if (invalid === reply.id) setInvalid(null)
                      }}
                      onDraft={() => void draft(reply)}
                      onSend={() => void send(reply)}
                      onCancel={() => void cancel(reply)}
                    />
                  ))
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={requestClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** One reply under the comment, and the answer to it in whichever state it is. */
function ReplyCard({
  reply,
  handle,
  text,
  fromDraft,
  invalid,
  busy,
  locked,
  onText,
  onDraft,
  onSend,
  onCancel,
}: {
  reply: ReplyView
  handle: string
  text: string
  fromDraft: string | null
  invalid: boolean
  busy: "draft" | "send" | "cancel" | null
  /** Something is on its way for one of the replies, so the buttons wait. */
  locked: boolean
  onText: (text: string, draftId: string | null) => void
  onDraft: () => void
  onSend: () => void
  onCancel: () => void
}) {
  const boxId = `reply-answer-${reply.id}`
  const posted = reply.postedAt ? new Date(reply.postedAt) : null

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <CardTitle className="truncate">u/{reply.author || "someone"}</CardTitle>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-0.5">
              <ArrowUpIcon className="size-3" aria-hidden="true" />
              {reply.score}
              <span className="sr-only">upvotes</span>
            </span>
            {posted ? <span>{postedDateText(posted)}</span> : null}
          </span>
        </div>
        <Hint label="Open this reply on Reddit">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Open u/${reply.author}'s reply on Reddit`}
            onClick={() => openOnReddit(reply.url)}
          >
            <ExternalLinkIcon className="size-4" />
          </Button>
        </Hint>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm whitespace-pre-wrap">{reply.text}</p>
        {reply.gone ? (
          <p className="text-xs text-muted-foreground">
            This reply is no longer under your comment. It read like this when you answered it.
          </p>
        ) : null}

        {reply.answer ? (
          <div className="grid gap-1 rounded-lg bg-muted/50 p-3">
            <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Your answer, sent {formatTimeAgo(reply.answer.postedAt)}</span>
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => openOnReddit(reply.answer?.url ?? "")}
              >
                Open on Reddit
              </button>
            </p>
            <p className="text-sm whitespace-pre-wrap">{reply.answer.text}</p>
          </div>
        ) : reply.pending ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-start gap-1.5">
              {reply.pending.running ? (
                <>
                  <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
                  Sending your answer now. It takes a few minutes.
                </>
              ) : (
                <>
                  <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {reply.pending.runAfter && new Date(reply.pending.runAfter) > new Date()
                    ? waitingReplyText(new Date(reply.pending.runAfter), handle || null)
                    : "Your answer is next in line for the browser."}
                </>
              )}
            </span>
            {reply.pending.running ? null : (
              <Button type="button" variant="outline" disabled={locked} onClick={onCancel}>
                {busy === "cancel" ? <Loader2Icon className="animate-spin" /> : null}
                Cancel answer
              </Button>
            )}
          </div>
        ) : (
          <Composer
            reply={reply}
            boxId={boxId}
            text={text}
            fromDraft={fromDraft}
            invalid={invalid}
            busy={busy}
            locked={locked}
            onText={onText}
            onDraft={onDraft}
            onSend={onSend}
          />
        )}
      </CardContent>
    </Card>
  )
}

/** The box under a reply nobody has answered: drafts, the words, and Reply. */
function Composer({
  reply,
  boxId,
  text,
  fromDraft,
  invalid,
  busy,
  locked,
  onText,
  onDraft,
  onSend,
}: {
  reply: ReplyView
  boxId: string
  text: string
  fromDraft: string | null
  invalid: boolean
  busy: "draft" | "send" | "cancel" | null
  locked: boolean
  onText: (text: string, draftId: string | null) => void
  onDraft: () => void
  onSend: () => void
}) {
  const over = text.trim().length > MAX_COMMENT_CHARS

  return (
    <div className="grid gap-2">
      {reply.failed ? (
        <div className="grid gap-1 rounded-lg border p-3 text-sm">
          <p className="flex items-start gap-1.5 font-medium">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            The last answer did not send.
          </p>
          <p className="text-muted-foreground">{reply.failed.error}</p>
          {reply.failed.text ? (
            <p className="text-xs whitespace-pre-wrap text-muted-foreground">
              The words tried: {reply.failed.text}
            </p>
          ) : null}
        </div>
      ) : null}

      <Label htmlFor={boxId}>Your answer to u/{reply.author || "someone"}</Label>
      {reply.drafts.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {reply.drafts.map((draft) => (
            <Hint key={draft.id} label={draft.text}>
              <button
                type="button"
                onClick={() => onText(draft.text, draft.id)}
                className={cn(
                  "h-16 overflow-hidden rounded-lg border bg-background p-2 text-left text-xs leading-relaxed",
                  fromDraft === draft.id ? "border-foreground bg-muted" : null
                )}
              >
                {draft.text}
              </button>
            </Hint>
          ))}
        </div>
      ) : null}
      <Textarea
        id={boxId}
        className="bg-background"
        value={text}
        aria-invalid={invalid || over || undefined}
        placeholder={
          reply.drafts.length
            ? "Pick a draft above, or write it yourself."
            : "Write it yourself, or press Write with AI."
        }
        onChange={(event) => {
          const next = event.target.value
          // Edited past the draft it came from, so the record stops claiming
          // the AI wrote what actually went out.
          const source = reply.drafts.find((draft) => draft.id === fromDraft)
          onText(next, source && source.text === next ? fromDraft : null)
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("text-xs tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
          {text.trim().length} of {MAX_COMMENT_CHARS}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={locked} onClick={onDraft}>
            {busy === "draft" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            Write with AI
          </Button>
          <Button type="button" disabled={locked} onClick={onSend}>
            {busy === "send" ? <Loader2Icon className="animate-spin" /> : null}
            Reply
          </Button>
        </div>
      </div>
    </div>
  )
}
