import * as React from "react"
import {
  AlertCircleIcon,
  Loader2Icon,
  MessageSquareIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import {
  DashboardToolbarButton,
  dashboardToolbarSegmentedButtonActiveClassName,
  dashboardToolbarSegmentedButtonClassName,
  dashboardToolbarSegmentedButtonInactiveClassName,
  dashboardToolbarSegmentedGroupClassName,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { DashboardTable } from "@/components/dashboard-table"
import { FeedbackDeleteModal } from "@/components/feedback-delete-modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableSortButton,
  TableRow,
  type TableSortDirection,
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
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/ai-video"
import { useShellRuntime } from "@/components/shell-runtime"
import { cn } from "@/lib/utils"
import { dateFormatter } from "@/lib/dashboard-format"

type FeedbackPeriod = "1year" | "3months" | "30days"
type CommentSortColumn = "message" | "feedback" | "type" | "author" | "created"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

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
  question: "",
  praise: "",
}

export function FeedbackCommentsDashboard() {
  const { config } = useShellRuntime()
  const [comments, setComments] = React.useState<FeedbackCommentItem[]>([])
  const [searchQuery, setSearchQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
  const [periodFilter, setPeriodFilter] =
    React.useState<FeedbackPeriod>("1year")
  const [sortColumn, setSortColumn] = React.useState<CommentSortColumn>("created")
  const [sortDirection, setSortDirection] = React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [editingComment, setEditingComment] =
    React.useState<FeedbackCommentItem | null>(null)
  const [deletingComment, setDeletingComment] =
    React.useState<FeedbackCommentItem | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)
  const [quickDeleting, setQuickDeleting] = React.useState(false)

  React.useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    listFeedbackCommentDashboard()
      .then((data) => {
        if (!active) return
        setComments(data.comments)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getFeedbackErrorMessage(loadError))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const filteredComments = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const periodStart = getPeriodStart(periodFilter)
    const direction = sortDirection === "asc" ? 1 : -1
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
    }).sort((a, b) => {
      if (sortColumn === "message") return a.message.localeCompare(b.message) * direction
      if (sortColumn === "feedback") return a.feedback_message.localeCompare(b.feedback_message) * direction
      if (sortColumn === "type") return feedbackTypeLabels[a.feedback_type].localeCompare(feedbackTypeLabels[b.feedback_type]) * direction
      if (sortColumn === "author") return a.author_name.localeCompare(b.author_name) * direction
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
    })
  }, [comments, periodFilter, searchQuery, sortColumn, sortDirection, typeFilter])

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
  }, [searchQuery, periodFilter, sortColumn, sortDirection, typeFilter, pageSize])

  const toggleSort = (column: CommentSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortColumn(column)
    setSortDirection("asc")
  }

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
            {selectedIds.size ? (
              <DashboardToolbarButton
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
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="comment-search"
              aria-label="Search comments"
              placeholder="Search comments..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />

            <PeriodTabs
              activePeriod={periodFilter}
              onPeriodChange={setPeriodFilter}
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
                <TableHead column="main">
                  <TableSortButton active={sortColumn === "message"} direction={sortDirection} onClick={() => toggleSort("message")}>
                    Comment
                  </TableSortButton>
                </TableHead>
                <TableHead column="preview">
                  <TableSortButton active={sortColumn === "feedback"} direction={sortDirection} onClick={() => toggleSort("feedback")}>
                    Feedback
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "type"} direction={sortDirection} onClick={() => toggleSort("type")}>
                    Type
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortColumn === "author"} direction={sortDirection} onClick={() => toggleSort("author")}>
                    Author
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortColumn === "created"} direction={sortDirection} onClick={() => toggleSort("created")}>
                    Created
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
        }
        isEmpty={!loading && paginatedComments.length === 0}
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
                  size="icon"
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
                  size="icon"
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
      <FeedbackDeleteModal
        title={`Delete ${selectedIds.size} Comment${selectedIds.size === 1 ? "" : "s"}`}
        body={`Are you sure you want to delete ${selectedIds.size} comment${selectedIds.size === 1 ? "" : "s"}?`}
        deleting={massDeleting}
        confirmDisabled={selectedIds.size === 0}
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        onConfirm={handleMassDelete}
      />
      <FeedbackDeleteModal
        title="Delete Comment"
        body="Are you sure you want to delete this comment?"
        deleting={quickDeleting}
        confirmDisabled={!deletingComment}
        open={Boolean(deletingComment)}
        onOpenChange={(open) => {
          if (!open) setDeletingComment(null)
        }}
        onConfirm={handleQuickDelete}
      />
    </div>
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
          <Card size="sm">
            <CardHeader>
              <CardTitle>Comment</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {comment ? (
                <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  <span className="line-clamp-2">
                    {comment.feedback_message}
                  </span>
                </div>
              ) : null}
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="feedback-comment-message"
                  hint="Editing changes the comment for everyone in the thread."
                >
                  Comment
                </FieldLabel>
                <Textarea
                  id="feedback-comment-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={1}
                  className="resize-none"
                  disabled={busy}
                  autoFocus
                />
              </div>
            </CardContent>
          </Card>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={busy}
          >
            {deleting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {deleting ? "Deleting" : "Delete"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={busy}>
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {saving ? "Saving" : "Save"}
          </Button>
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
    <div className={dashboardToolbarSegmentedGroupClassName}>
      {(Object.keys(feedbackPeriodLabels) as FeedbackPeriod[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onPeriodChange(key)}
          className={cn(
            dashboardToolbarSegmentedButtonClassName,
            activePeriod === key
              ? dashboardToolbarSegmentedButtonActiveClassName
              : dashboardToolbarSegmentedButtonInactiveClassName
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
