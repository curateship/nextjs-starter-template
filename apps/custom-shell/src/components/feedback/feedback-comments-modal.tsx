import * as React from "react"
import { toast } from "sonner"
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
import {
  deleteFeedbackComment,
  getFeedbackErrorMessage,
  listFeedbackComments,
  type FeedbackCommentItem,
  type FeedbackItem,
} from "@/lib/api/feedback"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

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
  const [deleting, setDeleting] = React.useState(false)

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
    dismissErrorToast()
    setDeleting(true)
    try {
      await deleteFeedbackComment(deletingComment.id)
      setComments((current) =>
        current.filter((comment) => comment.id !== deletingComment.id)
      )
      if (feedbackId) onCommentDeleted(feedbackId)
      setDeletingComment(null)
      toast.success("Comment deleted.")
    } catch (deleteError) {
      showErrorToast(getFeedbackErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
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
                      : `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Loading comments…
                    </p>
                  ) : comments.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No comments yet.
                    </p>
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
                              <span className="text-xs text-muted-foreground">
                                {dateTimeFormatter.format(
                                  new Date(comment.created_at)
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
          <DialogFooter variant="plain">
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
        description="This action cannot be undone."
        confirmLabel="Delete comment"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  )
}
