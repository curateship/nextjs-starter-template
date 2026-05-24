import * as React from "react"
import {
  AlertCircleIcon,
  Loader2Icon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  SaveIcon,
  SettingsIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  dashboardToolbarSegmentedButtonActiveClassName,
  dashboardToolbarSegmentedButtonClassName,
  dashboardToolbarSegmentedButtonInactiveClassName,
  dashboardToolbarSegmentedGroupClassName,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
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
  TableRow,
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
import { cn } from "@/lib/utils"

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

const pageSizeOptions = [10, 25, 50]

type FeedbackPeriod = "1year" | "3months" | "30days"
type FeedbackSort = "recent" | "most_votes" | "most_comments"

const feedbackPeriodLabels: Record<FeedbackPeriod, string> = {
  "1year": "1 Year",
  "3months": "3 Months",
  "30days": "30 Days",
}

const feedbackSortLabels: Record<FeedbackSort, string> = {
  recent: "Recent",
  most_votes: "Most Votes",
  most_comments: "Most Comments",
}

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
  const [feedback, setFeedback] = React.useState<FeedbackItem[]>([])
  const [searchQuery, setSearchQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
  const [sortFilter, setSortFilter] = React.useState<FeedbackSort>("recent")
  const [periodFilter, setPeriodFilter] =
    React.useState<FeedbackPeriod>("1year")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[0])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [editingFeedback, setEditingFeedback] =
    React.useState<FeedbackItem | null>(null)
  const [deletingFeedback, setDeletingFeedback] =
    React.useState<FeedbackItem | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
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
    const periodStart = getPeriodStart(periodFilter)
    const matches = feedback.filter((item) => {
      const matchesSearch =
        !query ||
        item.message.toLowerCase().includes(query) ||
        item.author_name.toLowerCase().includes(query)
      const matchesType = typeFilter === "all" || item.type === typeFilter
      const matchesPeriod = new Date(item.created_at) >= periodStart
      return matchesSearch && matchesType && matchesPeriod
    })

    return matches.sort((a, b) => {
      if (sortFilter === "most_votes") {
        return b.vote_count - a.vote_count
      }
      if (sortFilter === "most_comments") {
        return b.comment_count - a.comment_count
      }
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    })
  }, [feedback, periodFilter, searchQuery, sortFilter, typeFilter])

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
  }, [searchQuery, periodFilter, sortFilter, typeFilter, pageSize])

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
        title="Feedback"
        icon={<MessageSquarePlusIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={filteredFeedback.length}
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
            <PeriodTabs
              activePeriod={periodFilter}
              onPeriodChange={setPeriodFilter}
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

            <Select
              value={sortFilter}
              onValueChange={(value) => setSortFilter(value as FeedbackSort)}
            >
              <DashboardToolbarSelectTrigger
                aria-label="Sort feedback"
                labels={Object.values(feedbackSortLabels)}
              >
                <SelectValue placeholder="Sort" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                {Object.entries(feedbackSortLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
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
                  Feedback
                </TableHead>
                <TableHead column="meta">
                  Type
                </TableHead>
                <TableHead column="meta" className="hidden md:table-cell">
                  Author
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  Created
                </TableHead>
                <TableHead column="meta">
                  Comments
                </TableHead>
                <TableHead column="meta">
                  Votes
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
                  className="text-destructive hover:text-destructive"
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
      <MassDeleteFeedbackModal
        count={selectedIds.size}
        deleting={massDeleting}
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        onConfirm={handleMassDelete}
      />
      <DeleteFeedbackModal
        feedback={deletingFeedback}
        deleting={quickDeleting}
        open={Boolean(deletingFeedback)}
        onOpenChange={(open) => {
          if (!open) setDeletingFeedback(null)
        }}
        onConfirm={handleQuickDelete}
      />
    </div>
  )
}

function DeleteFeedbackModal({
  feedback,
  deleting,
  open,
  onOpenChange,
  onConfirm,
}: {
  feedback: FeedbackItem | null
  deleting: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Delete Feedback Item</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this feedback item?
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
              disabled={deleting || !feedback}
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

function MassDeleteFeedbackModal({
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
            Delete {count} Feedback Item{count === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete {count} feedback item
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
