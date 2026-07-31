import * as React from "react"
import { toast } from "sonner"
import {
  MessageSquareIcon,
  SaveIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import {
  feedbackTypeBadgeVariants,
  feedbackTypeClassNames,
  feedbackTypeLabels,
} from "@/lib/feedback-type"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useShellRuntime } from "@/components/shell/shell-layout"

type CommentSortColumn = "message" | "feedback" | "type" | "author" | "created"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

type FeedbackCommentsDashboardProps = {
  refreshToken: number
}

export function FeedbackCommentsDashboard({
  refreshToken,
}: FeedbackCommentsDashboardProps) {
  const { config } = useShellRuntime()
  const [comments, setComments] = React.useState<FeedbackCommentItem[]>([])
  const [searchQuery, setSearchQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
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
  const [reloadCount, setReloadCount] = React.useState(0)

  React.useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    listFeedbackCommentDashboard()
      .then((data) => {
        if (!active) return
        setComments(data.comments)
        // The shell's feedback modal can delete a comment that is selected
        // here, so drop selections the refreshed list no longer contains.
        const commentIds = new Set(data.comments.map((comment) => comment.id))
        setSelectedIds((current) => {
          const next = new Set(
            [...current].filter((id) => commentIds.has(id))
          )
          return next.size === current.size ? current : next
        })
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
  }, [refreshToken, reloadCount])

  const filteredComments = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1
    return comments.filter((comment) => {
      const matchesSearch =
        !query ||
        comment.message.toLowerCase().includes(query) ||
        comment.feedback_message.toLowerCase().includes(query) ||
        comment.author_name.toLowerCase().includes(query)
      const matchesType =
        typeFilter === "all" || comment.feedback_type === typeFilter
      return matchesSearch && matchesType
    }).sort((a, b) => {
      if (sortColumn === "message") return a.message.localeCompare(b.message) * direction
      if (sortColumn === "feedback") return a.feedback_message.localeCompare(b.feedback_message) * direction
      if (sortColumn === "type") return feedbackTypeLabels[a.feedback_type].localeCompare(feedbackTypeLabels[b.feedback_type]) * direction
      if (sortColumn === "author") return a.author_name.localeCompare(b.author_name) * direction
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
    })
  }, [comments, searchQuery, sortColumn, sortDirection, typeFilter])

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
  }, [searchQuery, sortColumn, sortDirection, typeFilter, pageSize])

  useClearSelectionOnListChange(
    setSelectedIds,
    `${searchQuery}|${typeFilter}|${sortColumn}|${sortDirection}|${currentPage}|${pageSize}`
  )

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
    dismissErrorToast()
    try {
      const result = await deleteFeedbackCommentsMany(ids)
      const deletedIds = new Set(result.commentIds)
      setComments((current) =>
        current.filter((comment) => !deletedIds.has(comment.id))
      )
      toast.success("Comments deleted.")
      setSelectedIds(new Set())
      setMassDeleteOpen(false)
    } catch (deleteError) {
      showErrorToast(getFeedbackErrorMessage(deleteError))
    } finally {
      setMassDeleting(false)
    }
  }

  const handleQuickDelete = async () => {
    if (!deletingComment) return

    setQuickDeleting(true)
    dismissErrorToast()
    try {
      await deleteFeedbackComment(deletingComment.id)
      handleDeleted(deletingComment)
      toast.success("Comment deleted.")
      setDeletingComment(null)
    } catch (deleteError) {
      showErrorToast(getFeedbackErrorMessage(deleteError))
    } finally {
      setQuickDeleting(false)
    }
  }

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Comments"
        icon={<MessageSquareIcon className="text-muted-foreground" />}
        count={filteredComments.length}
        error={
          error
            ? {
                message: error,
                onRetry: () => setReloadCount((count) => count + 1),
              }
            : null
        }
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
                <Trash2Icon className="size-4" />
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

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <DashboardToolbarSelectTrigger
                aria-label="Filter by feedback type"
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
              <span className="block truncate" title={comment.feedback_message}>
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
      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} Comment${selectedIds.size === 1 ? "" : "s"}`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        loading={massDeleting}
        disabled={selectedIds.size === 0}
        onConfirm={handleMassDelete}
      />
      <ConfirmDialog
        open={Boolean(deletingComment)}
        onOpenChange={(open) => {
          if (!open) setDeletingComment(null)
        }}
        title="Delete Comment"
        description="This action cannot be undone."
        confirmLabel="Delete"
        loading={quickDeleting}
        disabled={!deletingComment}
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
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    if (!comment) return
    setMessage(comment.message)
  }, [comment])

  const handleSave = async () => {
    if (!comment) return
    const trimmedMessage = message.trim()
    if (!trimmedMessage) {
      showErrorToast("Comment is required.")
      return
    }

    setSaving(true)
    dismissErrorToast()
    try {
      const updated = await updateFeedbackComment({
        commentId: comment.id,
        message: trimmedMessage,
      })
      onUpdated(updated)
      toast.success("Comment updated.")
      onOpenChange(false)
    } catch (saveError) {
      showErrorToast(getFeedbackErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!comment) return

    setDeleting(true)
    dismissErrorToast()
    try {
      await deleteFeedbackComment(comment.id)
      onDeleted(comment)
      toast.success("Comment deleted.")
      onOpenChange(false)
    } catch (deleteError) {
      showErrorToast(getFeedbackErrorMessage(deleteError))
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
              {comment ? (
                <CardDescription className="line-clamp-2">
                  On: {comment.feedback_message}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="feedback-comment-message">Comment</Label>
                <Textarea
                  id="feedback-comment-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={1}
                  disabled={busy}
                  autoFocus
                />
              </div>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={busy}
            >
              <Trash2Icon className="h-4 w-4" />
              Delete
            </Button>
            <Button type="button" onClick={handleSave} disabled={busy}>
              <SaveIcon className="h-4 w-4" />
              Save
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
