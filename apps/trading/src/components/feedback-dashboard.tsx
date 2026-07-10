import * as React from "react"
import {
  MessageSquareIcon,
  MessageSquarePlusIcon,
  ThumbsUpIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
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
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { useShellRuntime } from "@/components/shell-layout"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

type FeedbackSortColumn = "message" | "type" | "author" | "created" | "comments" | "votes"

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
  const [deletingFeedback, setDeletingFeedback] =
    React.useState<FeedbackItem | null>(null)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)
  const [quickDeleting, setQuickDeleting] = React.useState(false)

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
  }, [refreshToken])

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
  const selection = useRowSelection(paginatedFeedbackIds)
  const { selectedIds, setSelectedIds } = selection

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, sortColumn, sortDirection, typeFilter, pageSize])

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
    selection.removeId(feedbackId)
  }

  const handleMassDelete = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length) return

    setMassDeleting(true)
    setError(null)
    try {
      const result = await deleteFeedbackMany(ids)
      const deletedIds = new Set(result.feedbackIds)
      setFeedback((current) => current.filter((item) => !deletedIds.has(item.id)))
      setSelectedIds(new Set())
      setMassDeleteOpen(false)
    } catch (deleteError) {
      setError(getFeedbackErrorMessage(deleteError))
    } finally {
      setMassDeleting(false)
    }
  }

  const handleQuickDelete = async () => {
    if (!deletingFeedback) return

    setQuickDeleting(true)
    setError(null)
    try {
      await deleteFeedback(deletingFeedback.id)
      handleDeleted(deletingFeedback.id)
      setDeletingFeedback(null)
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
        title="Feedback"
        icon={<MessageSquarePlusIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={filteredFeedback.length}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={
          <>
            <MassDeleteToolbarButton
              count={selectedIds.size}
              deleting={massDeleting}
              onClick={() => setMassDeleteOpen(true)}
            />
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
                <SelectVisibleHead
                  allSelected={selection.visibleSelected}
                  partiallySelected={selection.visiblePartiallySelected}
                  onToggle={selection.toggleVisible}
                  ariaLabel="Select visible feedback"
                />
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
        isEmpty={loading || paginatedFeedback.length === 0}
        emptyText={loading ? "Loading feedback..." : "No feedback found matching your filters."}
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
                onCheckedChange={() => selection.toggleRow(item.id)}
                aria-label={`Select feedback ${item.message}`}
              />
            </TableCell>
            <TableCell column="main">
              <RowMessageButton
                message={item.message}
                onClick={() => setEditingFeedback(item)}
              />
            </TableCell>
            <TableCell column="meta">
              <FeedbackTypeBadge type={item.type} />
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {item.author_name}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {feedbackDateFormatter.format(new Date(item.created_at))}
            </TableCell>
            <TableCell column="meta">
              <Badge variant="secondary">
                <MessageSquareIcon className="h-3.5 w-3.5" />
                {item.comment_count}
              </Badge>
            </TableCell>
            <TableCell column="meta">
              <Badge variant="secondary">
                <ThumbsUpIcon className="h-3.5 w-3.5" />
                {item.vote_count}
              </Badge>
            </TableCell>
            <TableCell column="meta">
              <RowActions
                editLabel="Feedback settings"
                deleteLabel="Delete feedback"
                onEdit={() => setEditingFeedback(item)}
                onDelete={() => setDeletingFeedback(item)}
              />
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
      {selection.visibleSelected &&
      filteredFeedbackIds.length > paginatedFeedbackIds.length ? (
        <SelectAllBanner
          visibleCount={paginatedFeedbackIds.length}
          totalCount={filteredFeedbackIds.length}
          noun="feedback item"
          onSelectAll={() => setSelectedIds(new Set(filteredFeedbackIds))}
        />
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
      <ConfirmDeleteDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} Feedback Item${selectedIds.size === 1 ? "" : "s"}`}
        body={`Are you sure you want to delete ${selectedIds.size} feedback item${selectedIds.size === 1 ? "" : "s"}?`}
        deleting={massDeleting}
        confirmDisabled={selectedIds.size === 0}
        onConfirm={handleMassDelete}
      />
      <ConfirmDeleteDialog
        open={Boolean(deletingFeedback)}
        onOpenChange={(open) => {
          if (!open) setDeletingFeedback(null)
        }}
        title="Delete Feedback Item"
        body="Are you sure you want to delete this feedback item?"
        deleting={quickDeleting}
        confirmDisabled={!deletingFeedback}
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
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    if (!feedback) return
    setFeedbackType(feedback.type)
    setMessage(feedback.message)
    setError(null)
  }, [feedback])

  const handleSave = async () => {
    if (!feedback) return
    const trimmedMessage = message.trim()
    if (!trimmedMessage) {
      setError("Feedback message is required.")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const updated = await updateFeedback({
        feedbackId: feedback.id,
        type: feedbackType,
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
    if (!feedback) return

    setDeleting(true)
    setError(null)
    try {
      await deleteFeedback(feedback.id)
      onDeleted(feedback.id)
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
          <DialogTitle>Edit Feedback</DialogTitle>
          <DialogDescription>
            Update the message and feedback type.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-2">
            <Label htmlFor="feedback-message">Feedback</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-40 resize-none text-base"
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-type">Type</Label>
            <Select
              value={feedbackType}
              onValueChange={(value) => setFeedbackType(value as FeedbackType)}
              disabled={busy}
            >
              <SelectTrigger id="feedback-type" className="h-9 w-[180px]">
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
