import * as React from "react"
import { MessageSquareIcon } from "lucide-react"

import {
  dashboardToolbarSegmentedButtonActiveClassName,
  dashboardToolbarSegmentedButtonClassName,
  dashboardToolbarSegmentedButtonInactiveClassName,
  dashboardToolbarSegmentedGroupClassName,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { DashboardTable } from "@/components/dashboard-table"
import {
  ConfirmDeleteDialog,
  DeleteSaveFooter,
  ErrorAlert,
  FeedbackTypeBadge,
  MassDeleteToolbarButton,
  RowActions,
  RowMessageButton,
  SelectAllBanner,
  SelectVisibleHead,
} from "@/components/feedback-shared"
import {
  feedbackDateFormatter,
  feedbackTypeLabels,
} from "@/lib/feedback-meta"
import { useRowSelection } from "@/lib/use-row-selection"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
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
} from "@/lib/api/feedback"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { useShellRuntime } from "@/components/shell-layout"
import { cn } from "@/lib/utils"

type FeedbackPeriod = "1year" | "3months" | "30days"
type CommentSortColumn = "message" | "feedback" | "type" | "author" | "created"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

const feedbackPeriodLabels: Record<FeedbackPeriod, string> = {
  "1year": "1 Year",
  "3months": "3 Months",
  "30days": "30 Days",
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
  const selection = useRowSelection(paginatedCommentIds)
  const { selectedIds, setSelectedIds } = selection

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
    selection.removeId(comment.id)
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
      <ErrorAlert error={error} className="mt-4" />

      <DashboardTable
        title="Comments"
        icon={<MessageSquareIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={filteredComments.length}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={
          <>
            <MassDeleteToolbarButton
              count={selectedIds.size}
              deleting={massDeleting}
              onClick={() => setMassDeleteOpen(true)}
            />
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
          </>
        }
        header={
            <TableHeader>
              <TableRow>
                <SelectVisibleHead
                  allSelected={selection.visibleSelected}
                  partiallySelected={selection.visiblePartiallySelected}
                  onToggle={selection.toggleVisible}
                  ariaLabel="Select visible comments"
                />
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
        isEmpty={loading || paginatedComments.length === 0}
        emptyText={loading ? "Loading comments..." : "No comments found matching your filters."}
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
                onCheckedChange={() => selection.toggleRow(comment.id)}
                aria-label={`Select comment ${comment.message}`}
              />
            </TableCell>
            <TableCell column="main">
              <RowMessageButton
                message={comment.message}
                onClick={() => setEditingComment(comment)}
              />
            </TableCell>
            <TableCell column="preview">
              <span className="line-clamp-1 max-w-44">
                {comment.feedback_message}
              </span>
            </TableCell>
            <TableCell column="meta">
              <FeedbackTypeBadge type={comment.feedback_type} />
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {comment.author_name}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {feedbackDateFormatter.format(new Date(comment.created_at))}
            </TableCell>
            <TableCell column="meta">
              <RowActions
                editLabel="Comment settings"
                deleteLabel="Delete comment"
                onEdit={() => setEditingComment(comment)}
                onDelete={() => setDeletingComment(comment)}
              />
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {selection.visibleSelected &&
      filteredCommentIds.length > paginatedCommentIds.length ? (
        <SelectAllBanner
          visibleCount={paginatedCommentIds.length}
          totalCount={filteredCommentIds.length}
          noun="comment"
          onSelectAll={() => setSelectedIds(new Set(filteredCommentIds))}
        />
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
      <ConfirmDeleteDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} Comment${selectedIds.size === 1 ? "" : "s"}`}
        body={`Are you sure you want to delete ${selectedIds.size} comment${selectedIds.size === 1 ? "" : "s"}?`}
        deleting={massDeleting}
        confirmDisabled={selectedIds.size === 0}
        onConfirm={handleMassDelete}
      />
      <ConfirmDeleteDialog
        open={Boolean(deletingComment)}
        onOpenChange={(open) => {
          if (!open) setDeletingComment(null)
        }}
        title="Delete Comment"
        body="Are you sure you want to delete this comment?"
        deleting={quickDeleting}
        confirmDisabled={!deletingComment}
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

          <ErrorAlert error={error} />
        </DialogBody>
        <DeleteSaveFooter
          saving={saving}
          deleting={deleting}
          onSave={handleSave}
          onDelete={handleDelete}
        />
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
