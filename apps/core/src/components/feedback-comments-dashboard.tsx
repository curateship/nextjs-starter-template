import * as React from "react"
import {
  AlertCircleIcon,
  Loader2Icon,
  MessageSquareIcon,
  SaveIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import {
  DashboardSelectedActionButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { DashboardTable } from "@/components/dashboard-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  deleteFeedbackComment,
  deleteFeedbackCommentsMany,
  getFeedbackErrorMessage,
  listFeedbackCommentDashboard,
  updateFeedbackComment,
  type FeedbackCommentItem,
  type FeedbackType,
} from "@/lib/api/feedback"
import { cn } from "@/lib/utils"

type FeedbackPeriod = "1year" | "3months" | "30days"

const pageSizeOptions = [10, 25, 50]

const feedbackPeriodLabels: Record<FeedbackPeriod, string> = {
  "1year": "1 Year",
  "3months": "3 Months",
  "30days": "30 Days",
}

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
    "border-yellow-200 bg-yellow-100 text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/50 dark:text-yellow-200",
  praise:
    "border-green-200 bg-green-100 text-green-900 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200",
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

export function FeedbackCommentsDashboard({
  initialComments,
}: {
  initialComments: FeedbackCommentItem[]
}) {
  const [comments, setComments] = React.useState<FeedbackCommentItem[]>(initialComments)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
  const [periodFilter, setPeriodFilter] =
    React.useState<FeedbackPeriod>("1year")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[0])
  const [error, setError] = React.useState<string | null>(null)
  const [editingComment, setEditingComment] =
    React.useState<FeedbackCommentItem | null>(null)
  const [deletingComment, setDeletingComment] =
    React.useState<FeedbackCommentItem | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)
  const [quickDeleting, setQuickDeleting] = React.useState(false)

  const filteredComments = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const periodStart = getPeriodStart(periodFilter)
    return comments.filter((comment) => {
      const matchesSearch =
        !query ||
        comment.message.toLowerCase().includes(query) ||
        comment.feedback_message.toLowerCase().includes(query) ||
        comment.author_name.toLowerCase().includes(query)
      const matchesType =
        typeFilter === "all" || comment.feedback_type === typeFilter
      const matchesPeriod = new Date(comment.created_at) >= periodStart
      return matchesSearch && matchesType && matchesPeriod
    })
  }, [comments, periodFilter, searchQuery, typeFilter])

  const totalPages = Math.ceil(filteredComments.length / pageSize)
  const paginatedComments = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredComments.slice(startIndex, startIndex + pageSize)
  }, [filteredComments, currentPage, pageSize])
  const paginatedCommentIds = React.useMemo(
    () => paginatedComments.map((comment) => comment.id),
    [paginatedComments]
  )
  const filteredCommentIds = React.useMemo(
    () => filteredComments.map((comment) => comment.id),
    [filteredComments]
  )
  const visibleSelected =
    paginatedCommentIds.length > 0 &&
    paginatedCommentIds.every((id) => selectedIds.has(id))
  const visiblePartiallySelected =
    !visibleSelected && paginatedCommentIds.some((id) => selectedIds.has(id))

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, periodFilter, typeFilter, pageSize])

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)))
  }

  const handleUpdated = (updated: FeedbackCommentItem) => {
    setComments((current) =>
      current.map((comment) => (comment.id === updated.id ? updated : comment))
    )
  }

  const handleDeleted = (comment: FeedbackCommentItem) => {
    setComments((current) => current.filter((item) => item.id !== comment.id))
    setSelectedIds((current) => {
      const next = new Set(current)
      next.delete(comment.id)
      return next
    })
  }

  const toggleCommentSelection = (commentId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(commentId)) {
        next.delete(commentId)
      } else {
        next.add(commentId)
      }
      return next
    })
  }

  const toggleVisibleSelection = () => {
    setSelectedIds((current) => {
      if (visibleSelected) {
        const next = new Set(current)
        paginatedCommentIds.forEach((id) => next.delete(id))
        return next
      }

      return new Set([...current, ...paginatedCommentIds])
    })
  }

  const handleMassDelete = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length) return

    setMassDeleting(true)
    setError(null)
    try {
      const result = await deleteFeedbackCommentsMany(ids)
      const deletedIds = new Set(result.commentIds)
      setComments((current) =>
        current.filter((comment) => !deletedIds.has(comment.id))
      )
      setSelectedIds(new Set())
      setMassDeleteOpen(false)
    } catch (deleteError) {
      setError(getFeedbackErrorMessage(deleteError))
    } finally {
      setMassDeleting(false)
    }
  }

  const handleQuickDelete = async () => {
    if (!deletingComment) return

    setQuickDeleting(true)
    setError(null)
    try {
      await deleteFeedbackComment(deletingComment.id)
      handleDeleted(deletingComment)
      setDeletingComment(null)
    } catch (deleteError) {
      setError(getFeedbackErrorMessage(deleteError))
    } finally {
      setQuickDeleting(false)
    }
  }

  return (
    <div className="w-full pb-8">
      {error ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <DashboardTable
        title="Comments"
        icon={<MessageSquareIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={filteredComments.length}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={
          <>
            <PeriodTabs
              activePeriod={periodFilter}
              onPeriodChange={setPeriodFilter}
            />

            <DashboardToolbarSearch
              name="comment-search"
              aria-label="Search comments"
              placeholder="Search comments..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <DashboardToolbarSelectTrigger
                aria-label="Filter by feedback type"
                labels={["All Types", ...Object.values(feedbackTypeLabels)]}
              >
                <SelectValue placeholder="Type" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(feedbackTypeLabels).map(([type, label]) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedIds.size ? (
              <DashboardSelectedActionButton
                type="button"
                variant="destructive"
                onClick={() => setMassDeleteOpen(true)}
                disabled={massDeleting}
              >
                {massDeleting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
                Delete ({selectedIds.size})
              </DashboardSelectedActionButton>
            ) : null}
          </>
        }
        header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={
                      visibleSelected
                        ? true
                        : visiblePartiallySelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleVisibleSelection}
                    aria-label="Select visible comments"
                  />
                </TableHead>
                <TableHead column="main">Comment</TableHead>
                <TableHead column="preview">Feedback</TableHead>
                <TableHead column="meta">Type</TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  Author
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  Created
                </TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
        }
        isEmpty={paginatedComments.length === 0}
        emptyText="No comments found matching your filters."
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: filteredComments.length,
          totalPages,
          pageSizeOptions,
          onPageChange: goToPage,
          onPageSizeChange: setPageSize,
        }}
      >
        {paginatedComments.map((comment) => (
          <TableRow key={comment.id} className="group">
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(comment.id)}
                onCheckedChange={() => toggleCommentSelection(comment.id)}
                aria-label={`Select comment ${comment.message}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="line-clamp-2 max-w-full whitespace-normal text-left text-xs font-medium group-hover:underline sm:text-sm"
                onClick={() => setEditingComment(comment)}
                title={comment.message}
              >
                {comment.message}
              </button>
            </TableCell>
            <TableCell column="preview">
              <span className="line-clamp-1 max-w-44">
                {comment.feedback_message}
              </span>
            </TableCell>
            <TableCell column="meta">
              <Badge
                variant={feedbackTypeBadgeVariants[comment.feedback_type]}
                className={feedbackTypeClassNames[comment.feedback_type]}
              >
                {feedbackTypeLabels[comment.feedback_type]}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {comment.author_name}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {dateFormatter.format(new Date(comment.created_at))}
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setEditingComment(comment)}
                  title="Comment settings"
                  aria-label="Comment settings"
                >
                  <SettingsIcon className="h-4 w-4" />
                  <span className="sr-only">Comment settings</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => setDeletingComment(comment)}
                  title="Delete comment"
                  aria-label="Delete comment"
                >
                  <Trash2Icon className="h-4 w-4" />
                  <span className="sr-only">Delete comment</span>
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {visibleSelected &&
      filteredCommentIds.length > paginatedCommentIds.length ? (
        <div className="mt-3 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {paginatedCommentIds.length} comment
          {paginatedCommentIds.length === 1 ? "" : "s"} on this page are
          selected.{" "}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-2"
            onClick={() => setSelectedIds(new Set(filteredCommentIds))}
          >
            Select all {filteredCommentIds.length}
          </button>
        </div>
      ) : null}

      <EditFeedbackCommentModal
        comment={editingComment}
        open={Boolean(editingComment)}
        onOpenChange={(open) => {
          if (!open) setEditingComment(null)
        }}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
      <MassDeleteFeedbackCommentsModal
        count={selectedIds.size}
        deleting={massDeleting}
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        onConfirm={handleMassDelete}
      />
      <DeleteFeedbackCommentModal
        comment={deletingComment}
        deleting={quickDeleting}
        open={Boolean(deletingComment)}
        onOpenChange={(open) => {
          if (!open) setDeletingComment(null)
        }}
        onConfirm={handleQuickDelete}
      />
    </div>
  )
}

function DeleteFeedbackCommentModal({
  comment,
  deleting,
  open,
  onOpenChange,
  onConfirm,
}: {
  comment: FeedbackCommentItem | null
  deleting: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Delete Comment</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this comment?
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={deleting || !comment}
            >
              {deleting ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2Icon className="h-4 w-4" />
              )}
              Delete
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MassDeleteFeedbackCommentsModal({
  count,
  deleting,
  open,
  onOpenChange,
  onConfirm,
}: {
  count: number
  deleting: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>
            Delete {count} Comment{count === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete {count} comment
            {count === 1 ? "" : "s"}?
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={deleting || count === 0}
            >
              {deleting ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2Icon className="h-4 w-4" />
              )}
              Delete
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditFeedbackCommentModal({
  comment,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: {
  comment: FeedbackCommentItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (comment: FeedbackCommentItem) => void
  onDeleted: (comment: FeedbackCommentItem) => void
}) {
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    if (!comment) return
    setMessage(comment.message)
    setError(null)
  }, [comment])

  const handleSave = async () => {
    if (!comment) return
    const trimmedMessage = message.trim()
    if (!trimmedMessage) {
      setError("Comment is required.")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const updated = await updateFeedbackComment({
        commentId: comment.id,
        message: trimmedMessage,
      })
      onUpdated(updated)
      onOpenChange(false)
    } catch (saveError) {
      setError(getFeedbackErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!comment) return

    setDeleting(true)
    setError(null)
    try {
      await deleteFeedbackComment(comment.id)
      onDeleted(comment)
      onOpenChange(false)
    } catch (deleteError) {
      setError(getFeedbackErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  const busy = saving || deleting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Edit Comment</DialogTitle>
          <DialogDescription>
            Update the comment or remove it from the thread.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {comment ? (
            <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <span className="line-clamp-2">{comment.feedback_message}</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="feedback-comment-message">Comment</Label>
            <Textarea
              id="feedback-comment-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-40 resize-none text-base"
              disabled={busy}
              autoFocus
            />
          </div>

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
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={busy}
            >
              {deleting ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2Icon className="h-4 w-4" />
              )}
              Delete
            </Button>
            <Button type="button" onClick={handleSave} disabled={busy}>
              {saving ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SaveIcon className="h-4 w-4" />
              )}
              Save
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PeriodTabs({
  activePeriod,
  onPeriodChange,
}: {
  activePeriod: FeedbackPeriod
  onPeriodChange: (period: FeedbackPeriod) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {(Object.keys(feedbackPeriodLabels) as FeedbackPeriod[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onPeriodChange(key)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-all sm:text-sm",
            activePeriod === key
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {feedbackPeriodLabels[key]}
        </button>
      ))}
    </div>
  )
}

function getPeriodStart(period: FeedbackPeriod) {
  const date = new Date()

  if (period === "30days") {
    date.setDate(date.getDate() - 30)
    return date
  }

  if (period === "3months") {
    date.setMonth(date.getMonth() - 3)
    return date
  }

  date.setFullYear(date.getFullYear() - 1)
  return date
}
