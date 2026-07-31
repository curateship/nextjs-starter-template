import * as React from "react"
import { toast } from "sonner"
import {
  MessageSquareIcon,
  MessageSquarePlusIcon,
  SaveIcon,
  SettingsIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableSortButton,
  TableRow,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  deleteFeedback,
  deleteFeedbackMany,
  getFeedbackErrorMessage,
  listFeedback,
  updateFeedback,
  type FeedbackItem,
  type FeedbackType,
} from "@/lib/api/feedback"
import { FeedbackCommentsModal } from "@/components/feedback/feedback-comments-modal"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import {
  feedbackTypeBadgeVariants,
  feedbackTypeClassNames,
  feedbackTypeLabels,
} from "@/lib/feedback-type"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useShellRuntime } from "@/components/shell/shell-layout"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

type FeedbackSortColumn = "message" | "type" | "author" | "created" | "comments" | "votes"

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

type FeedbackDashboardProps = {
  refreshToken: number
  onOpenFeedback: () => void
}

export function FeedbackDashboard({
  refreshToken,
  onOpenFeedback,
}: FeedbackDashboardProps) {
  const { config } = useShellRuntime()
  const [feedback, setFeedback] = React.useState<FeedbackItem[]>([])
  const [searchQuery, setSearchQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
  const [sortColumn, setSortColumn] = React.useState<FeedbackSortColumn>("created")
  const [sortDirection, setSortDirection] = React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [editingFeedback, setEditingFeedback] =
    React.useState<FeedbackItem | null>(null)
  const [viewingComments, setViewingComments] =
    React.useState<FeedbackItem | null>(null)
  const [deletingFeedback, setDeletingFeedback] =
    React.useState<FeedbackItem | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)
  const [quickDeleting, setQuickDeleting] = React.useState(false)
  const [reloadCount, setReloadCount] = React.useState(0)

  React.useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    listFeedback()
      .then((data) => {
        if (!active) return
        setFeedback(data.feedback)
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

  const filteredFeedback = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const matches = feedback.filter((item) => {
      const matchesSearch =
        !query ||
        item.message.toLowerCase().includes(query) ||
        item.author_name.toLowerCase().includes(query)
      const matchesType = typeFilter === "all" || item.type === typeFilter
      return matchesSearch && matchesType
    })

    const direction = sortDirection === "asc" ? 1 : -1
    return matches.sort((a, b) => {
      if (sortColumn === "message") return a.message.localeCompare(b.message) * direction
      if (sortColumn === "type") return feedbackTypeLabels[a.type].localeCompare(feedbackTypeLabels[b.type]) * direction
      if (sortColumn === "author") return a.author_name.localeCompare(b.author_name) * direction
      if (sortColumn === "comments") return (a.comment_count - b.comment_count) * direction
      if (sortColumn === "votes") return (a.vote_count - b.vote_count) * direction
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction
    })
  }, [feedback, searchQuery, sortColumn, sortDirection, typeFilter])

  const totalPages = Math.ceil(filteredFeedback.length / pageSize)
  const paginatedFeedback = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredFeedback.slice(startIndex, startIndex + pageSize)
  }, [filteredFeedback, currentPage, pageSize])
  const paginatedFeedbackIds = React.useMemo(
    () => paginatedFeedback.map((item) => item.id),
    [paginatedFeedback]
  )
  const filteredFeedbackIds = React.useMemo(
    () => filteredFeedback.map((item) => item.id),
    [filteredFeedback]
  )
  const visibleSelected =
    paginatedFeedbackIds.length > 0 &&
    paginatedFeedbackIds.every((id) => selectedIds.has(id))
  const visiblePartiallySelected =
    !visibleSelected && paginatedFeedbackIds.some((id) => selectedIds.has(id))

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, sortColumn, sortDirection, typeFilter, pageSize])

  useClearSelectionOnListChange(
    setSelectedIds,
    `${searchQuery}|${typeFilter}|${sortColumn}|${sortDirection}|${currentPage}|${pageSize}`
  )

  const toggleSort = (column: FeedbackSortColumn) => {
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

  const handleUpdated = (updated: FeedbackItem) => {
    setFeedback((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    )
  }

  const handleDeleted = (feedbackId: string) => {
    setFeedback((current) => current.filter((item) => item.id !== feedbackId))
    setSelectedIds((current) => {
      const next = new Set(current)
      next.delete(feedbackId)
      return next
    })
  }

  const toggleFeedbackSelection = (feedbackId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(feedbackId)) {
        next.delete(feedbackId)
      } else {
        next.add(feedbackId)
      }
      return next
    })
  }

  const toggleVisibleSelection = () => {
    setSelectedIds((current) => {
      if (visibleSelected) {
        const next = new Set(current)
        paginatedFeedbackIds.forEach((id) => next.delete(id))
        return next
      }

      return new Set([...current, ...paginatedFeedbackIds])
    })
  }

  const handleMassDelete = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length) return

    setMassDeleting(true)
    dismissErrorToast()
    try {
      const result = await deleteFeedbackMany(ids)
      const deletedIds = new Set(result.feedbackIds)
      setFeedback((current) => current.filter((item) => !deletedIds.has(item.id)))
      toast.success("Feedback deleted.")
      setSelectedIds(new Set())
      setMassDeleteOpen(false)
    } catch (deleteError) {
      showErrorToast(getFeedbackErrorMessage(deleteError))
    } finally {
      setMassDeleting(false)
    }
  }

  const handleQuickDelete = async () => {
    if (!deletingFeedback) return

    setQuickDeleting(true)
    dismissErrorToast()
    try {
      await deleteFeedback(deletingFeedback.id)
      handleDeleted(deletingFeedback.id)
      toast.success("Feedback deleted.")
      setDeletingFeedback(null)
    } catch (deleteError) {
      showErrorToast(getFeedbackErrorMessage(deleteError))
    } finally {
      setQuickDeleting(false)
    }
  }

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Feedback"
        icon={<MessageSquarePlusIcon className="text-muted-foreground" />}
        count={filteredFeedback.length}
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
              name="feedback-search"
              aria-label="Search feedback"
              placeholder="Search feedback..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <DashboardToolbarSelectTrigger
                aria-label="Filter by type"
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

            <DashboardToolbarButton
              type="button"
              onClick={onOpenFeedback}
            >
              <MessageSquarePlusIcon className="size-4" />
              New feedback
            </DashboardToolbarButton>
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
                    aria-label="Select visible feedback"
                  />
                </TableHead>
                <TableHead column="main">
                  <TableSortButton active={sortColumn === "message"} direction={sortDirection} onClick={() => toggleSort("message")}>
                    Feedback
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "type"} direction={sortDirection} onClick={() => toggleSort("type")}>
                    Type
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden md:table-cell">
                  <TableSortButton active={sortColumn === "author"} direction={sortDirection} onClick={() => toggleSort("author")}>
                    Author
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton active={sortColumn === "created"} direction={sortDirection} onClick={() => toggleSort("created")}>
                    Created
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "comments"} direction={sortDirection} onClick={() => toggleSort("comments")}>
                    Comments
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton active={sortColumn === "votes"} direction={sortDirection} onClick={() => toggleSort("votes")}>
                    Votes
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
        }
        isEmpty={!loading && paginatedFeedback.length === 0}
        emptyText="No feedback found matching your filters."
        emptyColSpan={8}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: filteredFeedback.length,
          totalPages,
          pageSizeOptions,
          onPageChange: goToPage,
          onPageSizeChange: setPageSize,
        }}
      >
        {paginatedFeedback.map((item) => (
          <TableRow key={item.id} className="group">
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(item.id)}
                onCheckedChange={() => toggleFeedbackSelection(item.id)}
                aria-label={`Select feedback ${item.message}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="line-clamp-2 max-w-full whitespace-normal text-left text-xs font-medium group-hover:underline sm:text-sm"
                onClick={() => setEditingFeedback(item)}
                title={item.message}
              >
                {item.message}
              </button>
            </TableCell>
            <TableCell column="meta">
              <Badge
                variant={feedbackTypeBadgeVariants[item.type]}
                className={feedbackTypeClassNames[item.type]}
              >
                {feedbackTypeLabels[item.type]}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {item.author_name}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {dateFormatter.format(new Date(item.created_at))}
            </TableCell>
            <TableCell column="meta">
              <button
                type="button"
                className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => setViewingComments(item)}
                title="View comments"
                aria-label={`View ${item.comment_count} comment${item.comment_count === 1 ? "" : "s"}`}
              >
                <Badge
                  variant="secondary"
                  className="transition-colors hover:bg-accent"
                >
                  <MessageSquareIcon className="h-3.5 w-3.5" />
                  {item.comment_count}
                </Badge>
              </button>
            </TableCell>
            <TableCell column="meta">
              <Badge variant="secondary">
                <ThumbsUpIcon className="h-3.5 w-3.5" />
                {item.vote_count}
              </Badge>
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditingFeedback(item)}
                  title="Feedback settings"
                  aria-label="Feedback settings"
                >
                  <SettingsIcon className="h-4 w-4" />
                  <span className="sr-only">Feedback settings</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeletingFeedback(item)}
                  title="Delete feedback"
                  aria-label="Delete feedback"
                >
                  <Trash2Icon className="h-4 w-4" />
                  <span className="sr-only">Delete feedback</span>
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
      {visibleSelected &&
      filteredFeedbackIds.length > paginatedFeedbackIds.length ? (
        <div className="mt-3 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {paginatedFeedbackIds.length} feedback item
          {paginatedFeedbackIds.length === 1 ? "" : "s"} on this page are
          selected.{" "}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-2"
            onClick={() => setSelectedIds(new Set(filteredFeedbackIds))}
          >
            Select all {filteredFeedbackIds.length}
          </button>
        </div>
      ) : null}
      <EditFeedbackModal
        feedback={editingFeedback}
        open={Boolean(editingFeedback)}
        onOpenChange={(open) => {
          if (!open) setEditingFeedback(null)
        }}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
      <FeedbackCommentsModal
        feedback={viewingComments}
        open={Boolean(viewingComments)}
        onOpenChange={(open) => {
          if (!open) setViewingComments(null)
        }}
        onCommentDeleted={(feedbackId) => {
          setFeedback((current) =>
            current.map((item) =>
              item.id === feedbackId
                ? { ...item, comment_count: Math.max(0, item.comment_count - 1) }
                : item
            )
          )
        }}
      />
      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} Feedback Item${selectedIds.size === 1 ? "" : "s"}`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        loading={massDeleting}
        disabled={selectedIds.size === 0}
        onConfirm={handleMassDelete}
      />
      <ConfirmDialog
        open={Boolean(deletingFeedback)}
        onOpenChange={(open) => {
          if (!open) setDeletingFeedback(null)
        }}
        title="Delete Feedback Item"
        description="This action cannot be undone."
        confirmLabel="Delete"
        loading={quickDeleting}
        disabled={!deletingFeedback}
        onConfirm={handleQuickDelete}
      />
    </div>
  )
}

function EditFeedbackModal({
  feedback,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: {
  feedback: FeedbackItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (feedback: FeedbackItem) => void
  onDeleted: (feedbackId: string) => void
}) {
  const [feedbackType, setFeedbackType] =
    React.useState<FeedbackType>("suggestion")
  const [message, setMessage] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    if (!feedback) return
    setFeedbackType(feedback.type)
    setMessage(feedback.message)
  }, [feedback])

  const handleSave = async () => {
    if (!feedback) return
    const trimmedMessage = message.trim()
    if (!trimmedMessage) {
      showErrorToast("Feedback message is required.")
      return
    }

    setSaving(true)
    dismissErrorToast()
    try {
      const updated = await updateFeedback({
        feedbackId: feedback.id,
        type: feedbackType,
        message: trimmedMessage,
      })
      onUpdated(updated)
      toast.success("Feedback updated.")
      onOpenChange(false)
    } catch (saveError) {
      showErrorToast(getFeedbackErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!feedback) return

    setDeleting(true)
    dismissErrorToast()
    try {
      await deleteFeedback(feedback.id)
      onDeleted(feedback.id)
      toast.success("Feedback deleted.")
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
          <DialogTitle>Edit Feedback</DialogTitle>
          <DialogDescription>
            Update the message and feedback type.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Feedback</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="feedback-message">Feedback</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={1}
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="feedback-type">Type</Label>
            <Select
              value={feedbackType}
              onValueChange={(value) => setFeedbackType(value as FeedbackType)}
              disabled={busy}
            >
              <SelectTrigger id="feedback-type" className="w-full sm:w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(feedbackTypeLabels).map(([type, label]) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
