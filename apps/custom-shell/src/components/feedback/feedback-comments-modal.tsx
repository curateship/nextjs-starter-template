import * as React from "react"
import { Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyRow } from "@/components/shared/feed-card"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  deleteFeedbackComment,
  getFeedbackErrorMessage,
  listFeedbackComments,
  type FeedbackCommentItem,
  type FeedbackItem,
} from "@/lib/api/feedback"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { quoteOneLine } from "@/lib/quote-text"
import { plural } from "@/lib/format/plural"

/**
 * The comments behind one feedback row, opened from its Comments count. The
 * standalone comments page folded into this: reading and pruning a thread
 * happens right where the feedback already is.
 */
export function FeedbackCommentsModal({
  feedback,
  open,
  onOpenChange,
  onCommentDeleted,
}: {
  feedback: FeedbackItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Tells the table a comment is gone so the row's count stays honest. */
  onCommentDeleted: (feedbackId: string) => void
}) {
  const [comments, setComments] = React.useState<FeedbackCommentItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadCount, setReloadCount] = React.useState(0)
  const [deletingComment, setDeletingComment] =
    React.useState<FeedbackCommentItem | null>(null)
  const [runDelete, deleting] = useAsyncAction(getFeedbackErrorMessage)

  const feedbackId = feedback?.id ?? null

  React.useEffect(() => {
    if (!open || !feedbackId) return
    let active = true
    setLoading(true)
    setError(null)
    setComments([])

    listFeedbackComments(feedbackId)
      .then((data) => {
        if (active) setComments(data.comments)
      })
      .catch((loadError) => {
        if (active) setError(getFeedbackErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [open, feedbackId, reloadCount])

  const handleDelete = async () => {
    if (!deletingComment) return
    await runDelete(async () => {
      await deleteFeedbackComment(deletingComment.id)
      setComments((current) =>
        current.filter((comment) => comment.id !== deletingComment.id)
      )
      if (feedbackId) onCommentDeleted(feedbackId)
      setDeletingComment(null)
    }, "Comment deleted.")
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Comments</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {feedback?.message ?? ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {error ? (
              <ErrorBanner
                message={error}
                onRetry={() => setReloadCount((count) => count + 1)}
              />
            ) : (
              /* The thread sits in its own card, the way every admin modal
                 groups its body. */
              <Card size="sm">
                <CardHeader>
                  <CardTitle>
                    {loading || comments.length === 0
                      ? "Comments"
                      : `${comments.length} ${plural(comments.length, "comment", "comments")}`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <LoadingRow label="Loading comments…" />
                  ) : comments.length === 0 ? (
                    <EmptyRow>No comments yet.</EmptyRow>
                  ) : (
                    <ul className="flex flex-col divide-y">
                      {comments.map((comment) => (
                        <li
                          key={comment.id}
                          className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <span
                            className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-medium text-muted-foreground"
                            aria-hidden
                          >
                            {comment.author_name
                              .trim()
                              .charAt(0)
                              .toUpperCase() || "?"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">
                              <span className="font-medium">
                                {comment.author_name}
                              </span>{" "}
                              <span
                                className="text-xs text-muted-foreground"
                                title={formatDateTime(comment.created_at)}
                              >
                                {formatRelativeTime(
                                  comment.created_at,
                                  formatDateTime
                                )}
                              </span>
                            </p>
                            <p className="mt-0.5 text-sm whitespace-pre-wrap">
                              {comment.message}
                            </p>
                          </div>
                          {comment.can_delete ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingComment(comment)}
                              title="Delete comment"
                              aria-label="Delete comment"
                            >
                              <Trash2Icon className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </DialogBody>
          {/* Comments save themselves as they are added or deleted, so there is
              nothing to cancel — a single Done closes the window. */}
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deletingComment)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeletingComment(null)
        }}
        title="Delete this comment?"
        description={
          deletingComment
            ? `${quoteOneLine(deletingComment.message)} by ${deletingComment.author_name} goes. This cannot be undone.`
            : null
        }
        confirmLabel="Delete comment"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  )
}
