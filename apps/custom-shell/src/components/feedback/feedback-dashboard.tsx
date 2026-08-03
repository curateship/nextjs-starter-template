import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  GitMergeIcon,
  Loader2Icon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  SaveIcon,
  SettingsIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
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
  mergeFeedback,
  updateFeedback,
  type FeedbackItem,
  type FeedbackType,
} from "@/lib/api/feedback"
import { FeedbackCommentsModal } from "@/components/feedback/feedback-comments-modal"
import { FeedbackTagsSelect } from "@/components/feedback/feedback-tags-select"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { formatDateTime, formatRelativeTime } from "@/lib/format-time"
import { quoteOneLine } from "@/lib/quote-text"
import {
  FEEDBACK_STATUSES,
  feedbackStatusClassNames,
  feedbackStatusLabels,
  type FeedbackStatus,
} from "@/lib/feedback-status"
import { feedbackTagLabels, type FeedbackTag } from "@/lib/feedback-tags"
import {
  feedbackTypeBadgeVariants,
  feedbackTypeClassNames,
  feedbackTypeLabels,
} from "@/lib/feedback-type"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/list-search"
import { useOpenFromLink } from "@/lib/use-open-from-link"
import { useShellRuntime } from "@/components/shell/shell-layout"

const feedbackRoute = getRouteApi("/_authenticated/admin/feedback")

type FeedbackSortColumn =
  | "message"
  | "type"
  | "status"
  | "author"
  | "created"
  | "comments"
  | "votes"

type FeedbackDashboardProps = {
  refreshToken: number
  onOpenFeedback: () => void
  /** One piece of feedback named by the link that brought us here. */
  openId?: string
}

export function FeedbackDashboard({
  refreshToken,
  onOpenFeedback,
  openId,
}: FeedbackDashboardProps) {
  const { config } = useShellRuntime()
  const [feedback, setFeedback] = React.useState<FeedbackItem[]>([])
  // Search, filter, sort and page live in the address, so opening a record and
  // pressing Back returns this exact list — see `lib/list-search.ts`.
  const listSearch = feedbackRoute.useSearch()
  const setListSearch = useListSearchNavigate()
  const searchQuery = listSearch.q ?? ""
  const typeFilter: string = listSearch.type ?? "all"
  const sortColumn: FeedbackSortColumn = listSearch.sort ?? "created"
  const sortDirection: TableSortDirection = listSearch.direction ?? "desc"
  const currentPage = listSearch.page ?? 1
  const setCurrentPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [searchText, setSearchText] = useSearchBoxText(searchQuery, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [editingFeedback, setEditingFeedback] =
    React.useState<FeedbackItem | null>(null)
  const [viewingComments, setViewingComments] =
    React.useState<FeedbackItem | null>(null)
  const [deletingFeedback, setDeletingFeedback] =
    React.useState<FeedbackItem | null>(null)
  const [mergingFeedback, setMergingFeedback] =
    React.useState<FeedbackItem | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)
  const [quickDeleting, setQuickDeleting] = React.useState(false)
  const [reloadCount, setReloadCount] = React.useState(0)
  // Flips once, when the first load lands. After that every refetch already has
  // real numbers on screen, so the count and the footer never blank out again.
  const [firstLoadDone, setFirstLoadDone] = React.useState(false)

  // A link from elsewhere opens the conversation, which is where a reply is
  // written — it waits for the list below to arrive before it can.
  useOpenFromLink({ openId, records: feedback, onOpen: setViewingComments })

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
        setFirstLoadDone(true)
      })

    return () => {
      active = false
    }
  }, [refreshToken, reloadCount])

  // Until the first answer arrives there is no honest number to show: the list
  // is empty because nothing has come back, not because there is no feedback.
  const countsPending = loading && !firstLoadDone

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
      if (sortColumn === "message")
        return a.message.localeCompare(b.message) * direction
      if (sortColumn === "type")
        return (
          feedbackTypeLabels[a.type].localeCompare(feedbackTypeLabels[b.type]) *
          direction
        )
      if (sortColumn === "status")
        // Sorted by roadmap order, not alphabet — Open, Planned, In progress,
        // Done reads as a life; Done, In progress, Open does not.
        return (
          (FEEDBACK_STATUSES.indexOf(a.status) -
            FEEDBACK_STATUSES.indexOf(b.status)) *
          direction
        )
      if (sortColumn === "author")
        return a.author_name.localeCompare(b.author_name) * direction
      if (sortColumn === "comments")
        return (a.comment_count - b.comment_count) * direction
      if (sortColumn === "votes")
        return (a.vote_count - b.vote_count) * direction
      return (
        (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) *
        direction
      )
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

  // Changing how many rows fit can leave you past the end; the address already
  // drops the page when the search, filter or sort changes.
  React.useEffect(() => {
    setCurrentPage(1)
  }, [pageSize, setCurrentPage])

  useClearSelectionOnListChange(
    setSelectedIds,
    `${searchQuery}|${typeFilter}|${sortColumn}|${sortDirection}|${currentPage}|${pageSize}`
  )

  const toggleSort = (column: FeedbackSortColumn) => {
    setListSearch(
      sortColumn === column
        ? {
            direction: sortDirection === "asc" ? "desc" : "asc",
            page: undefined,
          }
        : { sort: column, direction: "asc", page: undefined }
    )
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
      setFeedback((current) =>
        current.filter((item) => !deletedIds.has(item.id))
      )
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
    <>
      <DashboardTable
        title="Feedback"
        icon={<MessageSquarePlusIcon className="text-muted-foreground" />}
        count={filteredFeedback.length}
        countsPending={countsPending}
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
        selectAll={{
          total: filteredFeedbackIds.length,
          onSelectAll: () => setSelectedIds(new Set(filteredFeedbackIds)),
        }}
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
              placeholder="Search feedback…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />

            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setListSearch({
                  type: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by type">
                <SelectValue placeholder="Type" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(feedbackTypeLabels).map(([type, label]) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DashboardToolbarButton type="button" onClick={onOpenFeedback}>
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
                <TableSortButton
                  active={sortColumn === "message"}
                  direction={sortDirection}
                  onClick={() => toggleSort("message")}
                >
                  Feedback
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "type"}
                  direction={sortDirection}
                  onClick={() => toggleSort("type")}
                >
                  Type
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden sm:table-cell">
                <TableSortButton
                  active={sortColumn === "status"}
                  direction={sortDirection}
                  onClick={() => toggleSort("status")}
                >
                  Status
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                <TableSortButton
                  active={sortColumn === "author"}
                  direction={sortDirection}
                  onClick={() => toggleSort("author")}
                >
                  Author
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                <TableSortButton
                  active={sortColumn === "created"}
                  direction={sortDirection}
                  onClick={() => toggleSort("created")}
                >
                  Created
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "comments"}
                  direction={sortDirection}
                  onClick={() => toggleSort("comments")}
                >
                  Comments
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "votes"}
                  direction={sortDirection}
                  onClick={() => toggleSort("votes")}
                >
                  Votes
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loading && paginatedFeedback.length === 0}
        emptyText="No feedback found matching your filters."
        emptyColSpan={9}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: filteredFeedback.length,
          totalPages,
          onPageChange: goToPage,
          onPageSizeChange: setPageSize,
        }}
      >
        {paginatedFeedback.map((item) => (
          <TableRow
            key={item.id}
            className="group"
            rowAction={() => setEditingFeedback(item)}
          >
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
                className="line-clamp-2 max-w-full text-left text-xs font-medium whitespace-normal group-hover:underline sm:text-sm"
                onClick={() => setEditingFeedback(item)}
                title={item.message}
              >
                {item.message}
              </button>
            </TableCell>
            <TableCell column="meta">
              <div className="flex flex-wrap items-center gap-1">
                <Badge
                  variant={feedbackTypeBadgeVariants[item.type]}
                  className={feedbackTypeClassNames[item.type]}
                >
                  {feedbackTypeLabels[item.type]}
                </Badge>
                {item.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {feedbackTagLabels[tag]}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell column="meta" className="hidden sm:table-cell">
              <Badge
                variant="outline"
                className={feedbackStatusClassNames[item.status]}
              >
                {feedbackStatusLabels[item.status]}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {item.author_name}
            </TableCell>
            <TableCell
              column="mutedMeta"
              className="hidden lg:table-cell"
              title={formatDateTime(item.created_at)}
            >
              {formatRelativeTime(item.created_at)}
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
            <TableCell column="actions">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setMergingFeedback(item)}
                  title="Merge into another item"
                  aria-label="Merge into another item"
                >
                  <GitMergeIcon className="h-4 w-4" />
                  <span className="sr-only">Merge into another item</span>
                </Button>
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
      <EditFeedbackModal
        feedback={editingFeedback}
        open={Boolean(editingFeedback)}
        onOpenChange={(open) => {
          if (!open) setEditingFeedback(null)
        }}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
      <MergeFeedbackDialog
        feedback={mergingFeedback}
        candidates={feedback}
        open={Boolean(mergingFeedback)}
        onOpenChange={(open) => {
          if (!open) setMergingFeedback(null)
        }}
        onMerged={(sourceId, target) => {
          handleDeleted(sourceId)
          handleUpdated(target)
        }}
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
                ? {
                    ...item,
                    comment_count: Math.max(0, item.comment_count - 1),
                  }
                : item
            )
          )
        }}
      />
      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} feedback item${selectedIds.size === 1 ? "" : "s"}?`}
        description="Their comments and votes go with them, and the people who wrote them are not told. This cannot be undone."
        confirmLabel={selectedIds.size === 1 ? "Delete item" : "Delete items"}
        loading={massDeleting}
        disabled={selectedIds.size === 0}
        onConfirm={handleMassDelete}
      />
      <ConfirmDialog
        open={Boolean(deletingFeedback)}
        onOpenChange={(open) => {
          if (!open) setDeletingFeedback(null)
        }}
        title="Delete this feedback item?"
        description={
          deletingFeedback
            ? `${quoteOneLine(deletingFeedback.message)} goes, along with its comments and votes. ${deletingFeedback.author_name} is not told. This cannot be undone.`
            : null
        }
        confirmLabel="Delete item"
        loading={quickDeleting}
        disabled={!deletingFeedback}
        onConfirm={handleQuickDelete}
      />
    </>
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
  const [feedbackStatus, setFeedbackStatus] =
    React.useState<FeedbackStatus>("open")
  const [feedbackTags, setFeedbackTags] = React.useState<FeedbackTag[]>([])
  const [message, setMessage] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  React.useEffect(() => {
    if (!feedback) return
    setFeedbackType(feedback.type)
    setFeedbackStatus(feedback.status)
    setFeedbackTags(feedback.tags)
    setMessage(feedback.message)
    setConfirmingDelete(false)
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
        status: feedbackStatus,
        tags: feedbackTags,
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
      setConfirmingDelete(false)
      onOpenChange(false)
    } catch (deleteError) {
      // The question stays up on a failure, so the answer is still one click
      // away once the error toast says what went wrong.
      showErrorToast(getFeedbackErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  const busy = saving || deleting
  const dirty = feedback
    ? message !== feedback.message ||
      feedbackType !== feedback.type ||
      feedbackStatus !== feedback.status ||
      // Compared as sets: picking the same tags in another order is no change.
      [...feedbackTags].sort().join() !== [...feedback.tags].sort().join()
    : false

  return (
    <>
      {/* A save or delete in flight holds the window open, and an edited message
          is asked about before the X, the overlay or Escape can drop it. */}
      <FormDialog
        open={open}
        dirty={dirty}
        busy={busy}
        onClose={() => onOpenChange(false)}
      >
        {(requestClose) => (
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>Edit feedback</DialogTitle>
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
                      onValueChange={(value) =>
                        setFeedbackType(value as FeedbackType)
                      }
                      disabled={busy}
                    >
                      <SelectTrigger
                        id="feedback-type"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(feedbackTypeLabels).map(
                          ([type, label]) => (
                            <SelectItem key={type} value={type}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="feedback-status">Status</Label>
                    <Select
                      value={feedbackStatus}
                      onValueChange={(value) =>
                        setFeedbackStatus(value as FeedbackStatus)
                      }
                      disabled={busy}
                    >
                      <SelectTrigger
                        id="feedback-status"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FEEDBACK_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {feedbackStatusLabels[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label id="feedback-tags-label">Tags</Label>
                    <FeedbackTagsSelect
                      value={feedbackTags}
                      onChange={setFeedbackTags}
                      disabled={busy}
                      className="w-full sm:w-fit"
                    />
                  </div>

                  {feedback?.attachment_url ? (
                    <div className="grid gap-2">
                      <Label>Screenshot</Label>
                      <a
                        href={feedback.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-fit rounded-lg"
                        title="Open the screenshot at full size"
                      >
                        <img
                          src={feedback.attachment_url}
                          alt="Screenshot attached to this feedback"
                          loading="lazy"
                          className="max-h-48 max-w-full rounded-lg border"
                        />
                      </a>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              {/* Delete asks first, exactly as the row's trash icon does — the
                  spinner lives on the confirmation that is running the delete. */}
              <Button
                type="button"
                variant="destructive"
                className="mr-auto"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
              >
                <Trash2Icon className="h-4 w-4" />
                Delete
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={busy}>
                {saving ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <SaveIcon className="h-4 w-4" />
                )}
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </FormDialog>
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this feedback item?"
        description={
          feedback
            ? `${quoteOneLine(feedback.message)} goes, along with its comments and votes. ${feedback.author_name} is not told. This cannot be undone.`
            : null
        }
        confirmLabel="Delete item"
        loading={deleting}
        disabled={!feedback}
        onConfirm={handleDelete}
      />
    </>
  )
}

/**
 * Folds a duplicate into the item it repeats. One window does the whole job:
 * pick the survivor, read exactly what will happen, and confirm — its votes
 * combine counting each person once, its comments move across, its author is
 * pointed at the surviving item, and the duplicate itself is deleted.
 */
function MergeFeedbackDialog({
  feedback,
  candidates,
  open,
  onOpenChange,
  onMerged,
}: {
  /** The duplicate that goes away. */
  feedback: FeedbackItem | null
  /** Everything on the board — the survivor is picked from these. */
  candidates: FeedbackItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onMerged: (sourceId: string, target: FeedbackItem) => void
}) {
  const [targetId, setTargetId] = React.useState("")
  const [merging, setMerging] = React.useState(false)

  // A fresh pick every time the window opens on a new duplicate — a survivor
  // chosen for one merge means nothing for the next. Adjusted during render
  // rather than in an effect so the stale pick never paints first.
  const [lastFeedbackId, setLastFeedbackId] = React.useState<string | null>(
    null
  )
  const feedbackId = feedback?.id ?? null
  if (feedbackId !== lastFeedbackId) {
    setLastFeedbackId(feedbackId)
    setTargetId("")
  }

  const targets = candidates.filter((item) => item.id !== feedback?.id)
  const target = targets.find((item) => item.id === targetId) ?? null

  const handleMerge = async () => {
    if (!feedback || !target) return

    setMerging(true)
    dismissErrorToast()
    try {
      const updated = await mergeFeedback({
        sourceId: feedback.id,
        targetId: target.id,
      })
      onMerged(feedback.id, updated)
      toast.success("Feedback merged.")
      onOpenChange(false)
    } catch (mergeError) {
      showErrorToast(getFeedbackErrorMessage(mergeError))
    } finally {
      setMerging(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // A merge in flight holds the window open, same as every save.
        if (!nextOpen && merging) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge this feedback into another item?</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {feedback?.message ?? ""}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Where it goes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="merge-target">Merge into</Label>
                <Select
                  value={targetId}
                  onValueChange={setTargetId}
                  disabled={merging || targets.length === 0}
                >
                  <SelectTrigger id="merge-target" className="w-full">
                    <SelectValue
                      placeholder={
                        targets.length
                          ? "Pick the item that stays"
                          : "There is no other feedback to merge into"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <span className="block max-w-96 truncate">
                          {`${feedbackTypeLabels[item.type]} · ${item.message}`}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">
                The votes from both items combine, counting each person once,
                and every comment moves across.{" "}
                {feedback ? `${feedback.author_name} is ` : "The author is "}
                sent a notice pointing at the surviving item, and this
                duplicate is deleted. This cannot be undone.
              </p>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={merging}
          >
            Cancel
          </Button>
          {/* Merging deletes the duplicate for good, so the button wears the
              irreversible colour — and stays quiet rather than greyed-out
              until a survivor is picked. */}
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (!target) {
                showErrorToast("Pick the item this one merges into first.")
                return
              }
              void handleMerge()
            }}
            disabled={merging}
          >
            {merging ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <GitMergeIcon className="h-4 w-4" />
            )}
            Merge items
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
