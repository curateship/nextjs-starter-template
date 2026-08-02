import * as React from "react"
import {
  CheckIcon,
  Loader2Icon,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingRow } from "@/components/ui/loading-row"
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
  type FeedbackSort,
  type FeedbackType,
} from "@/lib/api/feedback"
import { FeedbackTagsSelect } from "@/components/feedback/feedback-tags-select"
import { ImageUpload } from "@/components/shared/image-upload"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import {
  FEEDBACK_STATUSES,
  feedbackStatusClassNames,
  feedbackStatusLabels,
  type FeedbackStatus,
} from "@/lib/feedback-status"
import {
  FEEDBACK_TAGS,
  feedbackTagLabels,
  type FeedbackTag,
} from "@/lib/feedback-tags"
import {
  FEEDBACK_TYPES,
  feedbackTypeBadgeVariants,
  feedbackTypeClassNames,
  feedbackTypeLabels,
} from "@/lib/feedback-type"
import { focusRing } from "@/lib/focus-ring"
import { formatDateTime, formatRelativeTime } from "@/lib/format-time"
import { quoteOneLine } from "@/lib/quote-text"
import { cn } from "@/lib/utils"

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?"
}

/**
 * The initial in a circle. Your own — your comments and the box you type a
 * reply into — is the dark one, so you can pick yourself out of a thread at a
 * glance.
 */
function Avatar({
  name,
  isOwn = false,
  className,
}: {
  name: string
  isOwn?: boolean
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
        isOwn
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground",
        className
      )}
    >
      {getInitial(name)}
    </div>
  )
}

/**
 * Ctrl+Enter (Cmd+Enter on a Mac) sends, the way every chat box does. Plain
 * Enter still starts a new line, because these are multi-line boxes.
 */
function submitOnCommandEnter(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
  submit: () => void
) {
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return
  event.preventDefault()
  submit()
}

type FeedbackFilter = "all" | FeedbackType
type FeedbackTagFilter = "all" | FeedbackTag
type FeedbackStatusFilter = "all" | FeedbackStatus

const feedbackSortLabels: Record<FeedbackSort, string> = {
  recent: "Recent",
  most_votes: "Most votes",
  most_comments: "Most comments",
}

/**
 * Nothing in the list, said the way the media gallery says it: an icon and a
 * line about what would be here. `filtered` separates a filter that matched
 * nothing from a board that is genuinely empty — only one of the two is fixed
 * by changing the dropdowns.
 */
function EmptyFeedback({ filtered }: { filtered: boolean }) {
  return (
    <div className="grid h-40 place-items-center text-center text-sm text-muted-foreground">
      <div>
        <MessageSquareIcon className="mx-auto mb-3 size-10" />
        <p className="font-medium text-foreground">
          {filtered ? "Nothing matches these filters" : "No feedback yet"}
        </p>
        <p className="mt-1">
          {filtered
            ? "Set the type, tag, and status back to All to see everything else."
            : "Be the first — say what you'd like changed in the box above."}
        </p>
      </div>
    </div>
  )
}

type FeedbackModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetFeedbackId?: string | null
  onMutated?: () => void
  /** Whoever is signed in — their initial sits on the reply box. */
  currentUserName: string
}

export function FeedbackModal({
  open,
  onOpenChange,
  targetFeedbackId,
  onMutated,
  currentUserName,
}: FeedbackModalProps) {
  const [feedbackType, setFeedbackType] =
    React.useState<FeedbackType>("suggestion")
  const [composerTags, setComposerTags] = React.useState<FeedbackTag[]>([])
  // The screenshot going along with the next post — a media URL the picker
  // already uploaded and persisted, or "" for none.
  const [composerAttachment, setComposerAttachment] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [feedback, setFeedback] = React.useState<FeedbackItem[]>([])
  const [feedbackFilter, setFeedbackFilter] =
    React.useState<FeedbackFilter>("all")
  const [feedbackTag, setFeedbackTag] = React.useState<FeedbackTagFilter>("all")
  const [feedbackStatus, setFeedbackStatus] =
    React.useState<FeedbackStatusFilter>("all")
  const [feedbackSort, setFeedbackSort] = React.useState<FeedbackSort>("recent")
  const [loadingFeedback, setLoadingFeedback] = React.useState(false)
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
  const [deletingComment, setDeletingComment] =
    React.useState<FeedbackCommentItem | null>(null)
  // The item just posted, pinned to the top of the list so filing a Bug report
  // while the list is sorted by votes still shows what you wrote.
  const [justPostedId, setJustPostedId] = React.useState<string | null>(null)
  // Bumped by "Try again" on a failed load. The deep link is unchanged, so the
  // retry is a plain reload: nothing you were typing is thrown away.
  const [reloads, setReloads] = React.useState(0)

  // The deep link the popup was last opened with. A different one means a
  // notification is pointing at one specific item and wants a clean view;
  // reopening the popup on your own keeps whatever you were typing.
  const lastTargetIdRef = React.useRef<string | null>(null)
  // Votes already on their way to the server, so a double-click cannot count twice.
  const votingIdsRef = React.useRef(new Set<string>())
  // Which threads are on screen, read by the open-effect without making it
  // re-run every time one is toggled. Declared before that effect so it is
  // already up to date when the effect below runs.
  const openThreadIdsRef = React.useRef(openThreadIds)
  React.useEffect(() => {
    openThreadIdsRef.current = openThreadIds
  })

  React.useEffect(() => {
    if (!open) return

    let active = true
    const targetId = targetFeedbackId ?? null
    const freshView = targetId !== null && targetId !== lastTargetIdRef.current
    lastTargetIdRef.current = targetId

    setLoadError(null)
    setLoadingFeedback(true)
    if (freshView) {
      setExpandedIds(new Set([targetId]))
      setOpenThreadIds(new Set([targetId]))
      setCommentThreads({})
      setCommentInputs({})
      setEditingCommentId(null)
      setEditingCommentMessage("")
      setDeletingComment(null)
      setJustPostedId(null)
      setFeedbackFilter("all")
      setFeedbackTag("all")
      setFeedbackStatus("all")
      setFeedbackSort("recent")
      setLoadingThreadId(targetId)
    }

    // Threads already on screen refresh in place, keeping the comments you can
    // already see until the new ones land — the standard for a surface that
    // refreshes on its own.
    // freshView is only true when there is a targetId, so the fresh case always
    // has exactly that one thread to fetch.
    const threadIds = freshView
      ? [targetId]
      : Array.from(openThreadIdsRef.current)

    // A comment someone else removed while the popup was shut must not leave a
    // half-open editor or an unanswered "delete this?" pointing at nothing.
    // Only the ids matter: the editor is hidden the moment its id clears, and
    // the draft it held is rewritten the next time editing starts.
    const dropVanishedComments = (comments: FeedbackCommentItem[]) => {
      const liveIds = new Set(comments.map((comment) => comment.id))
      setEditingCommentId((current) =>
        current !== null && !liveIds.has(current) ? null : current
      )
      setDeletingComment((current) =>
        current && !liveIds.has(current.id) ? null : current
      )
    }

    const loadFeedback = async () => {
      try {
        const [data, threads] = await Promise.all([
          // The order and both filters are the server's job: the database
          // counts the votes, so it decides what "most votes" means. A fresh
          // deep-linked view always asks for the clean defaults it just set.
          listFeedback(
            freshView
              ? {}
              : {
                  type: feedbackFilter,
                  tag: feedbackTag,
                  status: feedbackStatus,
                  sort: feedbackSort,
                }
          ),
          Promise.all(
            threadIds.map(
              async (id) =>
                [id, (await listFeedbackComments(id)).comments] as const
            )
          ),
        ])
        if (!active) return
        setFeedback(data.feedback)
        if (threads.length) {
          setCommentThreads((current) => ({
            ...current,
            ...Object.fromEntries(threads),
          }))
          dropVanishedComments(threads.flatMap(([, comments]) => comments))
        }
      } catch (feedbackLoadError) {
        if (!active) return
        setLoadError(getFeedbackErrorMessage(feedbackLoadError))
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
  }, [
    open,
    reloads,
    targetFeedbackId,
    feedbackFilter,
    feedbackTag,
    feedbackStatus,
    feedbackSort,
  ])

  // The server already filtered and ordered the list; the one thing decided
  // here is the pin. One item sits at the top whatever the order says: the one
  // a notification linked to, or the one just posted — without it a new Bug
  // report lands at the bottom under "Most votes" and looks like nothing
  // happened.
  const visibleFeedback = React.useMemo(() => {
    const pinnedId = targetFeedbackId ?? justPostedId
    if (!pinnedId) {
      return feedback
    }

    const pinnedIndex = feedback.findIndex((item) => item.id === pinnedId)
    if (pinnedIndex < 1) {
      return feedback
    }

    const pinned = feedback[pinnedIndex]
    if (!pinned) {
      return feedback
    }

    const rest = [...feedback]
    rest.splice(pinnedIndex, 1)
    return [pinned, ...rest]
  }, [feedback, targetFeedbackId, justPostedId])
  const feedbackListTitle =
    feedbackFilter === "all" ? "Feedback" : feedbackTypeLabels[feedbackFilter]

  const handleSubmit = async () => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage) {
      showErrorToast("Feedback message is required.")
      return
    }

    dismissErrorToast()
    setIsSubmitting(true)
    try {
      const created = await createFeedback({
        type: feedbackType,
        tags: composerTags,
        message: trimmedMessage,
        attachmentUrl: composerAttachment || undefined,
      })
      setFeedback((current) => [created, ...current])
      setMessage("")
      // The chosen type and tags stay put — filing three bug reports about
      // Media in a row should not mean picking them three times. The
      // screenshot clears: it belonged to the report just sent.
      setComposerAttachment("")
      setJustPostedId(created.id)
      // A filter that hides what was just written makes the post look lost.
      setFeedbackFilter((current) =>
        current === "all" || current === created.type ? current : "all"
      )
      setFeedbackTag((current) =>
        current === "all" || created.tags.includes(current) ? current : "all"
      )
      setFeedbackStatus((current) =>
        current === "all" || current === created.status ? current : "all"
      )
      onMutated?.()
    } catch (submitError) {
      showErrorToast(getFeedbackErrorMessage(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVote = async (item: FeedbackItem) => {
    // A second click while the first is still travelling would count twice.
    // This lives in a ref, not state, because two clicks in the same tick both
    // read the same state value and both get through.
    if (votingIdsRef.current.has(item.id)) return
    votingIdsRef.current.add(item.id)
    dismissErrorToast()

    // Flip the thumb and the count now. The database is a second or two away;
    // waiting for it to answer makes every vote feel broken.
    setFeedback((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              has_voted: !currentItem.has_voted,
              vote_count: Math.max(
                0,
                currentItem.vote_count + (currentItem.has_voted ? -1 : 1)
              ),
            }
          : currentItem
      )
    )

    try {
      const updated = await toggleFeedbackVote(item.id)
      // The server's answer wins — it also knows about votes from other people.
      setFeedback((current) =>
        current.map((currentItem) =>
          currentItem.id === updated.id ? updated : currentItem
        )
      )
      onMutated?.()
    } catch (voteError) {
      // Put it back exactly as it was before the click.
      setFeedback((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id ? item : currentItem
        )
      )
      showErrorToast(getFeedbackErrorMessage(voteError))
    } finally {
      votingIdsRef.current.delete(item.id)
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
    dismissErrorToast()
    try {
      const data = await listFeedbackComments(feedbackId)
      setCommentThreads((current) => ({
        ...current,
        [feedbackId]: data.comments,
      }))
    } catch (threadLoadError) {
      showErrorToast(getFeedbackErrorMessage(threadLoadError))
    } finally {
      setLoadingThreadId(null)
    }
  }

  const handleCommentSubmit = async (feedbackId: string) => {
    const message = commentInputs[feedbackId]?.trim()
    if (!message) {
      showErrorToast("Comment is required.")
      return
    }

    setSubmittingCommentId(feedbackId)
    dismissErrorToast()
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
      onMutated?.()
    } catch (submitError) {
      showErrorToast(getFeedbackErrorMessage(submitError))
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
      showErrorToast("Comment is required.")
      return
    }

    setBusyCommentId(comment.id)
    dismissErrorToast()
    try {
      const updated = await updateFeedbackComment({
        commentId: comment.id,
        message,
      })
      setCommentThreads((current) => ({
        ...current,
        [updated.feedback_id]: (current[updated.feedback_id] ?? []).map(
          (item) => (item.id === updated.id ? updated : item)
        ),
      }))
      setEditingCommentId(null)
      setEditingCommentMessage("")
      onMutated?.()
    } catch (updateError) {
      showErrorToast(getFeedbackErrorMessage(updateError))
    } finally {
      setBusyCommentId(null)
    }
  }

  const handleCommentDelete = async () => {
    const comment = deletingComment
    if (!comment) return

    setBusyCommentId(comment.id)
    dismissErrorToast()
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
      setDeletingComment(null)
      onMutated?.()
    } catch (deleteError) {
      // The question stays up on a failure, so the answer is still one click
      // away once the error toast says what went wrong.
      showErrorToast(getFeedbackErrorMessage(deleteError))
    } finally {
      setBusyCommentId(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Share a request, report, question, or win.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {/* This window is a writing box on top of a feed, not a form, so the
              compose area sits straight on the modal surface and sends from
              where you are typing. */}
            <div className="space-y-2">
              {/* One field, two things inside: the words on top, the
                screenshot in the bottom corner. The frame and the focus ring
                live on this wrapper — the box inside is borderless — so
                clicking or tabbing into either part lights up the whole
                field as one. */}
              <div className="rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="What's on your mind?"
                  aria-label="Your feedback"
                  className="min-h-32 resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
                  disabled={isSubmitting}
                  autoFocus={!targetFeedbackId}
                  onKeyDown={(event) =>
                    submitOnCommandEnter(event, () => void handleSubmit())
                  }
                />
                {/* A picture when words are not enough — one screenshot per
                  report, kept small so the writing stays the main thing.
                  Only the author and admins will ever see it on the board. */}
                <div className="px-3 pb-3">
                  <ImageUpload
                    label="Screenshot"
                    showLabel={false}
                    value={composerAttachment}
                    onChange={(url) => setComposerAttachment(url)}
                    emptyLabel="Screenshot"
                    disabled={isSubmitting}
                    className="max-w-24"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Every kind keeps its colour, so the colour still teaches
                    what it means, and the chosen one is marked with a tick. The
                    mark used to be `ring-ring` — the app's focus colour — so a
                    chosen chip and a keyboard-focused one looked alike. */}
                  <div
                    role="group"
                    aria-label="Feedback type"
                    className="flex flex-wrap gap-2"
                  >
                    {FEEDBACK_TYPES.map((type) => {
                      const chosen = feedbackType === type
                      return (
                        <Button
                          key={type}
                          type="button"
                          variant={feedbackTypeBadgeVariants[type]}
                          size="sm"
                          className={cn(
                            feedbackTypeClassNames[type],
                            !chosen && "opacity-60 hover:opacity-100"
                          )}
                          onClick={() => setFeedbackType(type)}
                          disabled={isSubmitting}
                          aria-pressed={chosen}
                        >
                          {chosen ? <CheckIcon className="size-3.5" /> : null}
                          {feedbackTypeLabels[type]}
                        </Button>
                      )
                    })}
                  </div>
                  {/* What the note is about, beside what kind of note it is. */}
                  <FeedbackTagsSelect
                    value={composerTags}
                    onChange={setComposerTags}
                    disabled={isSubmitting}
                    size="sm"
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="self-start sm:self-auto"
                >
                  {isSubmitting ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SendIcon className="size-4" />
                  )}
                  Send
                </Button>
              </div>
            </div>

            {/* The count strip is a card of its own and the messages are cards of
              their own, all sitting straight on the window's grey. Wrapping the
              lot in one more card only drew a box around a box. */}
            <CardGroup>
              <Card size="sm">
                {/* The header is a two-row grid because the action spans both
                rows. Left to itself the title sits in the short first row and
                rides above the dropdowns' middle, so it spans both rows too
                and centres against them. */}
                <CardHeader>
                  <CardTitle className="row-span-2 self-center">
                    {feedbackListTitle}{" "}
                    <Badge variant="secondary">{visibleFeedback.length}</Badge>
                  </CardTitle>
                  <CardAction className="flex flex-wrap justify-end gap-2 self-center">
                    <Select
                      value={feedbackFilter}
                      onValueChange={(value) =>
                        setFeedbackFilter(value as FeedbackFilter)
                      }
                    >
                      <SelectTrigger aria-label="Filter feedback">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {Object.entries(feedbackTypeLabels).map(
                          ([type, label]) => (
                            <SelectItem key={type} value={type}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                    <Select
                      value={feedbackTag}
                      onValueChange={(value) =>
                        setFeedbackTag(value as FeedbackTagFilter)
                      }
                    >
                      <SelectTrigger aria-label="Filter feedback by tag">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All tags</SelectItem>
                        {FEEDBACK_TAGS.map((tag) => (
                          <SelectItem key={tag} value={tag}>
                            {feedbackTagLabels[tag]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={feedbackStatus}
                      onValueChange={(value) =>
                        setFeedbackStatus(value as FeedbackStatusFilter)
                      }
                    >
                      <SelectTrigger aria-label="Filter feedback by status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {FEEDBACK_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {feedbackStatusLabels[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={feedbackSort}
                      onValueChange={(value) =>
                        setFeedbackSort(value as FeedbackSort)
                      }
                    >
                      <SelectTrigger aria-label="Sort feedback">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(feedbackSortLabels).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </CardAction>
                </CardHeader>
              </Card>

              {loadingFeedback && feedback.length === 0 ? (
                // With nothing on screen yet, a spinner is the honest state.
                // Changing the sort or a filter instead keeps the list that is
                // already showing until the reordered answer lands.
                <Card size="sm">
                  <CardContent>
                    <LoadingRow label="Loading feedback…" />
                  </CardContent>
                </Card>
              ) : loadError ? (
                // The banner is a flat, square band. On its own it would be the
                // one square-cornered thing among the cards, so it takes a card
                // of its own with no padding and is clipped to the same corners.
                <Card className="py-0">
                  <ErrorBanner
                    message={loadError}
                    onRetry={() => setReloads((count) => count + 1)}
                  />
                </Card>
              ) : visibleFeedback.length === 0 ? (
                <Card size="sm">
                  <CardContent>
                    <EmptyFeedback
                      filtered={
                        feedbackFilter !== "all" ||
                        feedbackTag !== "all" ||
                        feedbackStatus !== "all"
                      }
                    />
                  </CardContent>
                </Card>
              ) : (
                <>
                  {visibleFeedback.map((item) => {
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
                      <Card key={item.id} size="sm">
                        <CardContent>
                          <div className="flex min-w-0 items-start gap-3">
                            <Avatar
                              name={item.author_name}
                              className="size-10 text-sm"
                            />
                            <div className="min-w-0 flex-1 space-y-3">
                              {/* The top of the message opens its comments and
                                closes them again, so the whole block is a
                                target and not just the small button below.
                                The "N Comments" button is still the one that
                                a keyboard and a screen reader use, so this
                                adds a shortcut without taking one away. */}
                              <div
                                className="cursor-pointer space-y-3"
                                onClick={(event) => {
                                  // A click that landed on a control of its
                                  // own — "More…", the type badge's link — is
                                  // that control's, and highlighting the text
                                  // is reading, not clicking.
                                  if (
                                    (event.target as HTMLElement).closest(
                                      "button, a, input, textarea"
                                    ) ||
                                    window.getSelection()?.toString()
                                  ) {
                                    return
                                  }
                                  void toggleThread(item.id)
                                }}
                              >
                                <div className="flex min-w-0 items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">
                                      {item.author_name}
                                    </p>
                                    <CardDescription
                                      title={formatDateTime(item.created_at)}
                                    >
                                      {formatRelativeTime(item.created_at)}
                                    </CardDescription>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                                    {/* Where the item stands on the roadmap.
                                      "Open" is every item's resting state, so
                                      only movement earns a badge. */}
                                    {item.status !== "open" ? (
                                      <Badge
                                        variant="outline"
                                        className={
                                          feedbackStatusClassNames[item.status]
                                        }
                                      >
                                        {feedbackStatusLabels[item.status]}
                                      </Badge>
                                    ) : null}
                                    <Badge
                                      variant={
                                        feedbackTypeBadgeVariants[item.type]
                                      }
                                      className={
                                        feedbackTypeClassNames[item.type]
                                      }
                                    >
                                      {feedbackTypeLabels[item.type]}
                                    </Badge>
                                  </div>
                                </div>
                                <CardTitle className="max-w-3xl text-sm leading-6 font-normal whitespace-pre-wrap text-foreground">
                                  {message}
                                  {isLong ? (
                                    <button
                                      type="button"
                                      className={cn(
                                        "ml-1 rounded-sm text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground",
                                        focusRing
                                      )}
                                      onClick={() => toggleExpanded(item.id)}
                                      aria-expanded={isExpanded}
                                      aria-label={
                                        isExpanded
                                          ? "Show less of this message"
                                          : "Show the rest of this message"
                                      }
                                    >
                                      {isExpanded ? "Less" : "More…"}
                                    </button>
                                  ) : null}
                                </CardTitle>
                              </div>
                              {item.tags.length ? (
                                <div className="flex flex-wrap gap-1">
                                  {item.tags.map((tag) => (
                                    <Badge key={tag} variant="outline">
                                      {feedbackTagLabels[tag]}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                              {/* The server only sends this to the item's own
                                author and to admins; for everyone else it is
                                null and nothing renders. */}
                              {item.attachment_url ? (
                                <a
                                  href={item.attachment_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={cn(
                                    "block w-fit rounded-lg",
                                    focusRing
                                  )}
                                  title="Open the screenshot at full size"
                                >
                                  <img
                                    src={item.attachment_url}
                                    alt="Screenshot attached to this feedback"
                                    loading="lazy"
                                    className="max-h-48 max-w-full rounded-lg border"
                                  />
                                </a>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-2">
                                {/* Never disabled: the count has already moved,
                                  so greying the button out would be the only
                                  slow part left. A repeat click is dropped in
                                  the handler instead. */}
                                <Button
                                  type="button"
                                  variant={
                                    item.has_voted ? "default" : "secondary"
                                  }
                                  onClick={() => void handleVote(item)}
                                  aria-pressed={item.has_voted}
                                  aria-label={
                                    item.has_voted
                                      ? "Remove feedback vote"
                                      : "Upvote feedback"
                                  }
                                >
                                  <ThumbsUpIcon className="size-4" />
                                  {item.vote_count}
                                </Button>
                                <Button
                                  type="button"
                                  variant={
                                    isThreadOpen ? "default" : "secondary"
                                  }
                                  onClick={() => void toggleThread(item.id)}
                                  aria-expanded={isThreadOpen}
                                  aria-label="Toggle feedback comments"
                                >
                                  <MessageSquareIcon className="size-4" />
                                  {item.comment_count} Comment
                                  {item.comment_count === 1 ? "" : "s"}
                                </Button>
                              </div>
                              {isThreadOpen ? (
                                // The thread hangs off a line down the left, so
                                // a reply is visibly part of the message above
                                // it and not the next one along. The line is a
                                // gradient rather than a border so it fades in
                                // and out at both ends instead of stopping
                                // dead against the buttons above and the reply
                                // box below.
                                <div
                                  role="group"
                                  aria-label="Comments"
                                  className="relative space-y-4 pl-4 before:absolute before:top-0 before:left-0 before:h-full before:w-px before:bg-linear-to-b before:from-transparent before:via-border before:to-transparent before:content-['']"
                                >
                                  {loadingThreadId === item.id ? (
                                    <LoadingRow label="Loading comments…" />
                                  ) : comments.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                      No comments yet.
                                    </p>
                                  ) : (
                                    <div className="space-y-4">
                                      {comments.map((comment) => (
                                        <div
                                          key={comment.id}
                                          className="grid grid-cols-[1.75rem_1fr] gap-3"
                                        >
                                          <Avatar
                                            name={comment.author_name}
                                            isOwn={comment.is_own}
                                          />
                                          <div className="min-w-0">
                                            {/* As tall as the avatar beside it, so
                                              the two share a middle line. */}
                                            <div className="mb-1 flex min-h-7 min-w-0 items-center gap-2">
                                              <p className="truncate text-sm font-medium text-foreground">
                                                {comment.author_name}
                                              </p>
                                              {comment.is_own ? (
                                                <Badge
                                                  variant="secondary"
                                                  className="shrink-0"
                                                >
                                                  You
                                                </Badge>
                                              ) : null}
                                              <p
                                                className="shrink-0 text-xs text-muted-foreground"
                                                title={formatDateTime(
                                                  comment.created_at
                                                )}
                                              >
                                                {formatRelativeTime(
                                                  comment.created_at
                                                )}
                                              </p>
                                              {comment.can_edit ||
                                              comment.can_delete ? (
                                                <div className="ml-auto flex shrink-0 gap-1">
                                                  {comment.can_edit ? (
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="icon-xs"
                                                      className="rounded-md"
                                                      onClick={() =>
                                                        startEditingComment(
                                                          comment
                                                        )
                                                      }
                                                      disabled={
                                                        busyCommentId ===
                                                        comment.id
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
                                                        setDeletingComment(
                                                          comment
                                                        )
                                                      }
                                                      disabled={
                                                        busyCommentId ===
                                                        comment.id
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
                                                  rows={1}
                                                  disabled={
                                                    busyCommentId === comment.id
                                                  }
                                                  onKeyDown={(event) =>
                                                    submitOnCommandEnter(
                                                      event,
                                                      () =>
                                                        void handleCommentUpdate(
                                                          comment
                                                        )
                                                    )
                                                  }
                                                />
                                                <div className="flex justify-end gap-2">
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                      setEditingCommentId(null)
                                                      setEditingCommentMessage(
                                                        ""
                                                      )
                                                    }}
                                                    disabled={
                                                      busyCommentId ===
                                                      comment.id
                                                    }
                                                  >
                                                    Cancel
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    onClick={() =>
                                                      void handleCommentUpdate(
                                                        comment
                                                      )
                                                    }
                                                    disabled={
                                                      busyCommentId ===
                                                      comment.id
                                                    }
                                                  >
                                                    {busyCommentId ===
                                                    comment.id ? (
                                                      <Loader2Icon className="animate-spin" />
                                                    ) : null}
                                                    Save
                                                  </Button>
                                                </div>
                                              </div>
                                            ) : (
                                              <p className="max-w-2xl text-xs leading-5 whitespace-pre-wrap text-foreground sm:text-sm">
                                                {comment.message}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Your avatar, then one line to type on. The box
                                    still grows with a long reply; the send button
                                    rides its bottom-right corner. */}
                                  <div className="grid grid-cols-[1.75rem_1fr] gap-3">
                                    {/* Centred on the box's first line — as tall as
                                      the box is at rest — so it stays put rather
                                      than drifting down as a long reply grows. */}
                                    <div className="flex h-9 items-center">
                                      <Avatar name={currentUserName} isOwn />
                                    </div>
                                    <div className="relative">
                                      <Textarea
                                        rows={1}
                                        value={commentInputs[item.id] ?? ""}
                                        onChange={(event) =>
                                          setCommentInputs((current) => ({
                                            ...current,
                                            [item.id]: event.target.value,
                                          }))
                                        }
                                        placeholder="Add a comment…"
                                        aria-label="Add a comment"
                                        className="resize-none rounded-3xl bg-background py-1.5 pr-11 pl-4"
                                        disabled={
                                          submittingCommentId === item.id
                                        }
                                        onKeyDown={(event) =>
                                          submitOnCommandEnter(
                                            event,
                                            () =>
                                              void handleCommentSubmit(item.id)
                                          )
                                        }
                                      />
                                      <Button
                                        type="button"
                                        size="icon"
                                        className="absolute right-1 bottom-1 size-7 rounded-full"
                                        onClick={() =>
                                          void handleCommentSubmit(item.id)
                                        }
                                        disabled={
                                          submittingCommentId === item.id
                                        }
                                        title="Post comment"
                                        aria-label="Post comment"
                                      >
                                        {submittingCommentId === item.id ? (
                                          <Loader2Icon className="size-4 animate-spin" />
                                        ) : (
                                          <SendIcon className="size-4" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </>
              )}
            </CardGroup>
          </DialogBody>
        </DialogContent>
      </Dialog>
      {/* The same question the admin table asks, worded the same way, so a
          comment cannot go on one click here either. */}
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
        loading={
          busyCommentId !== null && busyCommentId === deletingComment?.id
        }
        onConfirm={handleCommentDelete}
      />
    </>
  )
}
