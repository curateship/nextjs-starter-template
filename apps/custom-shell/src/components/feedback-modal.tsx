import * as React from "react"
import {
  AlertCircleIcon,
  MessageSquareIcon,
  PencilIcon,
  SendIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  createFeedbackComment,
  createFeedback,
  deleteFeedbackComment,
  getFeedbackErrorMessage,
  listFeedback,
  listFeedbackComments,
  toggleFeedbackVote,
  updateFeedbackComment,
  type FeedbackCommentItem,
  type FeedbackItem,
  type FeedbackType,
} from "@/lib/api/feedback"
import { cn } from "@/lib/utils"

const feedbackTypes: Array<{ type: FeedbackType; label: string }> = [
  { type: "suggestion", label: "Suggestion" },
  { type: "bug_report", label: "Bug Report" },
  { type: "question", label: "Question" },
  { type: "praise", label: "Praise" },
]

const feedbackTypeLabels: Record<FeedbackType, string> = {
  suggestion: "Suggestion",
  bug_report: "Bug Report",
  question: "Question",
  praise: "Praise",
}

const feedbackTypeBadgeVariants: Record<
  FeedbackType,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  suggestion: "default",
  bug_report: "destructive",
  question: "outline",
  praise: "secondary",
}

const feedbackTypeClassNames: Record<FeedbackType, string> = {
  suggestion: "",
  bug_report: "",
  question:
    "border-yellow-200 bg-yellow-100 text-yellow-900 hover:bg-yellow-100 dark:border-yellow-900/50 dark:bg-yellow-950/50 dark:text-yellow-200",
  praise:
    "border-green-200 bg-green-100 text-green-900 hover:bg-green-100 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200",
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?"
}

type FeedbackFilter = "all" | FeedbackType
type FeedbackSort = "recent" | "most_votes" | "most_comments"

const feedbackSortLabels: Record<FeedbackSort, string> = {
  recent: "Recent",
  most_votes: "Most Votes",
  most_comments: "Most Comments",
}

type FeedbackModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetFeedbackId?: string | null
  onCreated?: (feedback: FeedbackItem) => void
}

export function FeedbackModal({
  open,
  onOpenChange,
  targetFeedbackId,
  onCreated,
}: FeedbackModalProps) {
  const [feedbackType, setFeedbackType] =
    React.useState<FeedbackType>("suggestion")
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [feedback, setFeedback] = React.useState<FeedbackItem[]>([])
  const [feedbackFilter, setFeedbackFilter] =
    React.useState<FeedbackFilter>("all")
  const [feedbackSort, setFeedbackSort] =
    React.useState<FeedbackSort>("recent")
  const [loadingFeedback, setLoadingFeedback] = React.useState(false)
  const [votingId, setVotingId] = React.useState<string | null>(null)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const [openThreadIds, setOpenThreadIds] = React.useState<Set<string>>(
    new Set()
  )
  const [commentThreads, setCommentThreads] = React.useState<
    Record<string, FeedbackCommentItem[]>
  >({})
  const [loadingThreadId, setLoadingThreadId] = React.useState<string | null>(
    null
  )
  const [commentInputs, setCommentInputs] = React.useState<
    Record<string, string>
  >({})
  const [submittingCommentId, setSubmittingCommentId] = React.useState<
    string | null
  >(null)
  const [editingCommentId, setEditingCommentId] = React.useState<string | null>(
    null
  )
  const [editingCommentMessage, setEditingCommentMessage] = React.useState("")
  const [busyCommentId, setBusyCommentId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return

    let active = true
    const targetId = targetFeedbackId ?? null

    setError(null)
    setExpandedIds(new Set(targetId ? [targetId] : []))
    setOpenThreadIds(new Set(targetId ? [targetId] : []))
    setCommentThreads({})
    setCommentInputs({})
    setEditingCommentId(null)
    setEditingCommentMessage("")
    setLoadingFeedback(true)
    setLoadingThreadId(targetId)
    if (targetId) {
      setFeedbackFilter("all")
      setFeedbackSort("recent")
    }

    const loadFeedback = async () => {
      try {
        const data = await listFeedback()
        if (!active) return
        setFeedback(data.feedback)
        if (!targetId) return

        const comments = await listFeedbackComments(targetId)
        if (!active) return
        setCommentThreads({ [targetId]: comments.comments })
      } catch (loadError) {
        if (!active) return
        setError(getFeedbackErrorMessage(loadError))
      } finally {
        if (!active) return
        setLoadingFeedback(false)
        setLoadingThreadId(null)
      }
    }

    void loadFeedback()

    return () => {
      active = false
    }
  }, [open, targetFeedbackId])

  const filteredFeedback = React.useMemo(() => {
    const matches =
      feedbackFilter === "all"
        ? feedback
        : feedback.filter((item) => item.type === feedbackFilter)

    const sorted = [...matches].sort((a, b) => {
      if (feedbackSort === "most_votes") {
        return b.vote_count - a.vote_count
      }
      if (feedbackSort === "most_comments") {
        return b.comment_count - a.comment_count
      }
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    })

    if (!targetFeedbackId) {
      return sorted
    }

    const targetIndex = sorted.findIndex((item) => item.id === targetFeedbackId)
    if (targetIndex < 1) {
      return sorted
    }

    const target = sorted[targetIndex]
    if (!target) {
      return sorted
    }

    sorted.splice(targetIndex, 1)
    return [target, ...sorted]
  }, [feedback, feedbackFilter, feedbackSort, targetFeedbackId])
  const feedbackListTitle =
    feedbackFilter === "all"
      ? "Feedback"
      : feedbackTypeLabels[feedbackFilter]

  const handleSubmit = async () => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage) {
      setError("Feedback message is required.")
      return
    }

    setError(null)
    setIsSubmitting(true)
    try {
      const created = await createFeedback({
        type: feedbackType,
        message: trimmedMessage,
      })
      setFeedback((current) => [created, ...current])
      setMessage("")
      setFeedbackType("suggestion")
      onCreated?.(created)
    } catch (submitError) {
      setError(getFeedbackErrorMessage(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVote = async (item: FeedbackItem) => {
    setVotingId(item.id)
    setError(null)
    try {
      const updated = await toggleFeedbackVote(item.id)
      setFeedback((current) =>
        current.map((currentItem) =>
          currentItem.id === updated.id ? updated : currentItem
        )
      )
    } catch (voteError) {
      setError(getFeedbackErrorMessage(voteError))
    } finally {
      setVotingId(null)
    }
  }

  const toggleExpanded = (feedbackId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(feedbackId)) {
        next.delete(feedbackId)
      } else {
        next.add(feedbackId)
      }
      return next
    })
  }

  const toggleThread = async (feedbackId: string) => {
    const shouldOpen = !openThreadIds.has(feedbackId)
    setOpenThreadIds((current) => {
      const next = new Set(current)
      if (next.has(feedbackId)) {
        next.delete(feedbackId)
      } else {
        next.add(feedbackId)
      }
      return next
    })

    if (!shouldOpen || commentThreads[feedbackId]) return

    setLoadingThreadId(feedbackId)
    setError(null)
    try {
      const data = await listFeedbackComments(feedbackId)
      setCommentThreads((current) => ({
        ...current,
        [feedbackId]: data.comments,
      }))
    } catch (loadError) {
      setError(getFeedbackErrorMessage(loadError))
    } finally {
      setLoadingThreadId(null)
    }
  }

  const handleCommentSubmit = async (feedbackId: string) => {
    const message = commentInputs[feedbackId]?.trim()
    if (!message) {
      setError("Comment is required.")
      return
    }

    setSubmittingCommentId(feedbackId)
    setError(null)
    try {
      const created = await createFeedbackComment({ feedbackId, message })
      setCommentThreads((current) => ({
        ...current,
        [feedbackId]: [...(current[feedbackId] ?? []), created],
      }))
      setCommentInputs((current) => ({ ...current, [feedbackId]: "" }))
      setFeedback((current) =>
        current.map((item) =>
          item.id === feedbackId
            ? { ...item, comment_count: item.comment_count + 1 }
            : item
        )
      )
    } catch (submitError) {
      setError(getFeedbackErrorMessage(submitError))
    } finally {
      setSubmittingCommentId(null)
    }
  }

  const startEditingComment = (comment: FeedbackCommentItem) => {
    setEditingCommentId(comment.id)
    setEditingCommentMessage(comment.message)
  }

  const handleCommentUpdate = async (comment: FeedbackCommentItem) => {
    const message = editingCommentMessage.trim()
    if (!message) {
      setError("Comment is required.")
      return
    }

    setBusyCommentId(comment.id)
    setError(null)
    try {
      const updated = await updateFeedbackComment({
        commentId: comment.id,
        message,
      })
      setCommentThreads((current) => ({
        ...current,
        [updated.feedback_id]: (current[updated.feedback_id] ?? []).map((item) =>
          item.id === updated.id ? updated : item
        ),
      }))
      setEditingCommentId(null)
      setEditingCommentMessage("")
    } catch (updateError) {
      setError(getFeedbackErrorMessage(updateError))
    } finally {
      setBusyCommentId(null)
    }
  }

  const handleCommentDelete = async (comment: FeedbackCommentItem) => {
    setBusyCommentId(comment.id)
    setError(null)
    try {
      await deleteFeedbackComment(comment.id)
      setCommentThreads((current) => ({
        ...current,
        [comment.feedback_id]: (current[comment.feedback_id] ?? []).filter(
          (item) => item.id !== comment.id
        ),
      }))
      setFeedback((current) =>
        current.map((item) =>
          item.id === comment.feedback_id
            ? { ...item, comment_count: Math.max(0, item.comment_count - 1) }
            : item
        )
      )
    } catch (deleteError) {
      setError(getFeedbackErrorMessage(deleteError))
    } finally {
      setBusyCommentId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            Share a request, report, question, or win.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
        <div className="space-y-2">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What's on your mind?"
            className="min-h-32 resize-none text-base"
            disabled={isSubmitting}
            autoFocus={!targetFeedbackId}
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {feedbackTypes.map((item) => (
                  <Button
                    key={item.type}
                    type="button"
                    variant={feedbackTypeBadgeVariants[item.type]}
                    size="sm"
                    className={cn(
                      feedbackTypeClassNames[item.type],
                      feedbackType === item.type
                        ? "ring-2 ring-ring ring-offset-2"
                        : "opacity-70 hover:opacity-100"
                    )}
                    onClick={() => setFeedbackType(item.type)}
                    disabled={isSubmitting}
                    aria-pressed={feedbackType === item.type}
                  >
                    {item.label}
                  </Button>
              ))}
            </div>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="self-start sm:self-auto"
            >
              <SendIcon className="h-4 w-4" />
              Send
            </Button>
          </div>
        </div>

        <Card className="rounded-md bg-muted/50">
          <CardHeader>
            <CardTitle>
              {feedbackListTitle}{" "}
              <Badge variant="secondary">{filteredFeedback.length}</Badge>
            </CardTitle>
            <CardAction className="flex gap-2">
              <Select
                value={feedbackFilter}
                onValueChange={(value) =>
                  setFeedbackFilter(value as FeedbackFilter)
                }
              >
                <SelectTrigger
                  className="h-8 text-xs"
                  aria-label="Filter feedback"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(feedbackTypeLabels).map(([type, label]) => (
                    <SelectItem key={type} value={type}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={feedbackSort}
                onValueChange={(value) => setFeedbackSort(value as FeedbackSort)}
              >
                <SelectTrigger className="h-8 text-xs" aria-label="Sort feedback">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(feedbackSortLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardAction>
          </CardHeader>

          <CardContent>
            {loadingFeedback ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Loading feedback
              </div>
            ) : filteredFeedback.length === 0 ? (
              <p className="text-sm text-muted-foreground">No feedback found.</p>
            ) : (
              <CardGroup>
                {filteredFeedback.map((item) => {
                  const words = item.message.trim().split(/\s+/)
                  const isLong = words.length > 40
                  const isExpanded = expandedIds.has(item.id)
                  const message =
                    isLong && !isExpanded
                      ? words.slice(0, 40).join(" ")
                      : item.message
                  const isThreadOpen = openThreadIds.has(item.id)
                  const comments = commentThreads[item.id] ?? []

                  return (
                    <Card
                      key={item.id}
                      className="rounded-md bg-card py-4 ring-foreground/10"
                    >
                      <CardHeader className="gap-4 px-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                            {getInitial(item.author_name)}
                          </div>
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {item.author_name}
                                </p>
                                <CardDescription>
                                  {dateFormatter.format(new Date(item.created_at))}
                                </CardDescription>
                              </div>
                              <Badge
                                variant={feedbackTypeBadgeVariants[item.type]}
                                className={cn(
                                  "shrink-0",
                                  feedbackTypeClassNames[item.type]
                                )}
                              >
                                {feedbackTypeLabels[item.type]}
                              </Badge>
                            </div>
                            <CardTitle className="max-w-3xl whitespace-pre-wrap text-sm leading-6 font-normal text-foreground">
                              {message}
                              {isLong && !isExpanded ? " " : null}
                              {isLong && !isExpanded ? (
                                <button
                                  type="button"
                                  className="ml-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                  onClick={() => toggleExpanded(item.id)}
                                >
                                  More...
                                </button>
                              ) : null}
                            </CardTitle>
                          </div>
                        </div>
                        <div className="ml-[52px] flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant={item.has_voted ? "default" : "secondary"}
                            size="sm"
                            className="h-8 w-auto rounded-md px-3"
                            onClick={() => handleVote(item)}
                            disabled={votingId === item.id}
                            aria-label={
                              item.has_voted
                                ? "Remove feedback vote"
                                : "Upvote feedback"
                            }
                          >
                            <ThumbsUpIcon className="h-3.5 w-3.5" />
                            {item.vote_count}
                          </Button>
                          <Button
                            type="button"
                            variant={isThreadOpen ? "default" : "secondary"}
                            size="sm"
                            className="h-8 w-auto rounded-md px-3"
                            onClick={() => void toggleThread(item.id)}
                            aria-label="Toggle feedback comments"
                          >
                            <MessageSquareIcon className="h-3.5 w-3.5" />
                            {item.comment_count} Comment
                            {item.comment_count === 1 ? "" : "s"}
                          </Button>
                        </div>
                      </CardHeader>
                      {isThreadOpen ? (
                        <CardContent className="mx-4 mt-1 space-y-4 border-t px-0 pt-4">
                          {loadingThreadId === item.id ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              Loading comments
                            </div>
                          ) : comments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No comments yet.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              <h3 className="text-sm font-medium text-foreground">
                                Comments
                              </h3>
                              {comments.map((comment) => (
                                <div
                                  key={comment.id}
                                  className="grid grid-cols-[2rem_1fr] gap-3"
                                >
                                  <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                                    {getInitial(comment.author_name)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="mb-2 flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-foreground">
                                          {comment.author_name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {dateFormatter.format(
                                            new Date(comment.created_at)
                                          )}
                                        </p>
                                      </div>
                                      {comment.can_edit || comment.can_delete ? (
                                        <div className="flex shrink-0 gap-1">
                                          {comment.can_edit ? (
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon-xs"
                                              className="rounded-md"
                                              onClick={() =>
                                                startEditingComment(comment)
                                              }
                                              disabled={
                                                busyCommentId === comment.id
                                              }
                                              aria-label="Edit comment"
                                            >
                                              <PencilIcon className="h-3.5 w-3.5" />
                                            </Button>
                                          ) : null}
                                          {comment.can_delete ? (
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon-xs"
                                              className="rounded-md"
                                              onClick={() =>
                                                void handleCommentDelete(comment)
                                              }
                                              disabled={
                                                busyCommentId === comment.id
                                              }
                                              aria-label="Delete comment"
                                            >
                                              <Trash2Icon className="h-3.5 w-3.5" />
                                            </Button>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>

                                    {editingCommentId === comment.id ? (
                                      <div className="space-y-2">
                                        <Textarea
                                          value={editingCommentMessage}
                                          onChange={(event) =>
                                            setEditingCommentMessage(
                                              event.target.value
                                            )
                                          }
                                          className="min-h-20 resize-none rounded-md text-sm"
                                          disabled={busyCommentId === comment.id}
                                        />
                                        <div className="flex justify-end gap-2">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="rounded-md"
                                            onClick={() => {
                                              setEditingCommentId(null)
                                              setEditingCommentMessage("")
                                            }}
                                            disabled={
                                              busyCommentId === comment.id
                                            }
                                          >
                                            Cancel
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            className="rounded-md"
                                            onClick={() =>
                                              void handleCommentUpdate(comment)
                                            }
                                            disabled={
                                              busyCommentId === comment.id
                                            }
                                          >
                                            Save
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="max-w-2xl whitespace-pre-wrap text-xs leading-5 text-foreground sm:text-sm">
                                        {comment.message}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="space-y-2">
                            <Textarea
                              value={commentInputs[item.id] ?? ""}
                              onChange={(event) =>
                                setCommentInputs((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                              placeholder="Add a comment..."
                              className="min-h-20 resize-none rounded-md bg-background text-sm"
                              disabled={submittingCommentId === item.id}
                            />
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                className="rounded-md"
                                onClick={() => void handleCommentSubmit(item.id)}
                                disabled={submittingCommentId === item.id}
                              >
                                <SendIcon className="h-3.5 w-3.5" />
                                Comment
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      ) : null}
                    </Card>
                  )
                })}
              </CardGroup>
            )}
          </CardContent>
        </Card>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
