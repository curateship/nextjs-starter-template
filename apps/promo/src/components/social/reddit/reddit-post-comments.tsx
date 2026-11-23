import * as React from "react"
import { AlertTriangleIcon, ArrowUpIcon, ClockIcon, ExternalLinkIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { answerOnOwnPost, checkOwnPosts, getOwnPostErrorMessage, type OwnPostRow } from "@/lib/api/social/reddit/own-posts"
import { formatTimeAgo } from "@/lib/format/format-time"
import { MAX_COMMENT_CHARS } from "@/lib/social/options"
import { waitingReplyText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

import { Hint } from "../hint"

type PostComment = NonNullable<OwnPostRow["comments"]>[number]

function openOnReddit(url: string) {
  if (url.startsWith("https://www.reddit.com/")) window.open(url, "_blank", "noopener,noreferrer")
}

/**
 * The comments directly under one of your own Reddit posts, as the last
 * Check read them, each with your answer, the answer on its way, or a box to
 * write one (part 6 of `workspace/tasks/New features/new-features-18-nov.md`).
 * Answer queues it from the account that posted, under every rule a comment
 * follows; nothing goes out by itself. The Replies window on the Sent tab is
 * the same shape for comments you sent.
 */
export function RedditPostCommentsDialog({
  post,
  guest,
  onClose,
  onChanged,
}: {
  /** The post whose comments are open, or null for the window shut. */
  post: OwnPostRow | null
  /** A guest sent from Project reads the comments but doesn't check or answer them. */
  guest: boolean
  onClose: () => void
  /** Something was queued, so the list is read again. */
  onChanged: () => Promise<void>
}) {
  const [texts, setTexts] = React.useState<Record<string, string>>({})
  const [tried, setTried] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const dirty = Object.values(texts).some((text) => text.trim())
  const handle = post?.account.handle ? `u/${post.account.handle}` : "the account that posted it"

  async function check() {
    if (!post) return
    setBusy("check")
    try {
      await checkOwnPosts([post.id])
      await onChanged()
    } catch (error) {
      showErrorToast(getOwnPostErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function answer(comment: PostComment) {
    if (!post) return
    const text = (texts[comment.url] ?? "").trim()
    setTried(comment.url)
    if (!text) {
      showErrorToast("Write the answer first.")
      return
    }
    setBusy(comment.url)
    try {
      await answerOnOwnPost({ postId: post.id, commentUrl: comment.url, text })
      setTexts((current) => ({ ...current, [comment.url]: "" }))
      setTried(null)
      await onChanged()
    } catch (error) {
      showErrorToast(getOwnPostErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const comments = post?.comments ?? null
  const others = comments?.filter((comment) => !comment.own) ?? []

  return (
    <FormDialog
      open={post !== null}
      dirty={dirty}
      busy={busy !== null && busy !== "check"}
      onClose={() => {
        setTexts({})
        setTried(null)
        onClose()
      }}
    >
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Comments on your post</DialogTitle>
            <DialogDescription>
              {post
                ? `"${post.title}" in r/${post.subreddit}. Answers go out from ${handle}.`
                : "The comments directly under a post of yours, and your answers."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {post ? (
              <Card size="sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {post.checking
                      ? "Reading the post now."
                      : post.checkedAt
                        ? `${post.upvotes ?? 0} upvotes and ${post.commentCount ?? 0} comments, read ${formatTimeAgo(post.checkedAt)}.`
                        : "Not read yet. Check reads the upvotes and the comments under it."}
                    {post.checkError ? <span className="block text-amber-700 dark:text-amber-400">{post.checkError}</span> : null}
                  </span>
                  {guest ? null : (
                    <Button type="button" variant="outline" disabled={post.checking || busy === "check"} onClick={() => void check()}>
                      {post.checking || busy === "check" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                      {post.checkedAt ? "Read again" : "Check"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : null}
            {comments === null ? null : others.length ? (
              others.map((comment) => (
                <CommentCard
                  key={comment.url}
                  comment={comment}
                  handle={post?.account.handle ?? ""}
                  text={texts[comment.url] ?? ""}
                  invalid={tried === comment.url && !(texts[comment.url] ?? "").trim()}
                  busy={busy === comment.url}
                  locked={busy !== null}
                  canAnswer={!guest}
                  onText={(text) => setTexts((current) => ({ ...current, [comment.url]: text }))}
                  onAnswer={() => void answer(comment)}
                />
              ))
            ) : (
              <Card size="sm">
                <CardContent className="text-sm text-muted-foreground">Nobody has commented on it yet.</CardContent>
              </Card>
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

/** One comment: who, its upvotes, its words, then the answer, the one on its way, or the box. */
function CommentCard({
  comment,
  handle,
  text,
  invalid,
  busy,
  locked,
  canAnswer,
  onText,
  onAnswer,
}: {
  comment: PostComment
  handle: string
  text: string
  invalid: boolean
  busy: boolean
  locked: boolean
  canAnswer: boolean
  onText: (text: string) => void
  onAnswer: () => void
}) {
  const boxId = `post-answer-${comment.url}`
  const answer = comment.answer
  const over = text.trim().length > MAX_COMMENT_CHARS

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <CardTitle className="truncate">u/{comment.author || "someone"}</CardTitle>
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            <ArrowUpIcon className="size-3" aria-hidden="true" />
            {comment.score}
            <span className="sr-only">upvotes</span>
          </span>
        </div>
        <Hint label="Open this comment on Reddit">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Open u/${comment.author}'s comment on Reddit`}
            onClick={() => openOnReddit(comment.url)}
          >
            <ExternalLinkIcon className="size-4" />
          </Button>
        </Hint>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm whitespace-pre-wrap">{comment.text}</p>
        {answer && "url" in answer ? (
          <div className="grid gap-1 rounded-lg bg-muted/50 p-3">
            <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Your answer, sent {formatTimeAgo(answer.postedAt)}</span>
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => openOnReddit(answer.url)}>
                Open on Reddit
              </button>
            </p>
            <p className="text-sm whitespace-pre-wrap">{answer.text}</p>
          </div>
        ) : answer && "waiting" in answer ? (
          <p className="flex items-start gap-1.5 text-sm">
            <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {answer.runAfter && new Date(answer.runAfter) > new Date()
              ? waitingReplyText(new Date(answer.runAfter), handle || null)
              : "Your answer is next in line for the browser."}
          </p>
        ) : !canAnswer ? null : (
          <div className="grid gap-2">
            {answer && "failed" in answer ? (
              <div className="grid gap-1 rounded-lg border p-3 text-sm">
                <p className="flex items-start gap-1.5 font-medium">
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  The last answer did not send.
                </p>
                <p className="text-muted-foreground">{answer.reason}</p>
                {answer.text ? <p className="text-xs whitespace-pre-wrap text-muted-foreground">The words tried: {answer.text}</p> : null}
              </div>
            ) : null}
            <Label htmlFor={boxId}>Your answer to u/{comment.author || "someone"}</Label>
            <Textarea
              id={boxId}
              rows={1}
              value={text}
              aria-invalid={invalid || over || undefined}
              onChange={(event) => onText(event.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {text.trim().length} of {MAX_COMMENT_CHARS}
              </span>
              <Button type="button" disabled={locked} onClick={onAnswer}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Answer
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
