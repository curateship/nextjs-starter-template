import * as React from "react"
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  SaveIcon,
  Loader2Icon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  SettingsIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DashboardToolbar,
  DashboardToolbarControls,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
  DashboardToolbarTitle,
} from "@/components/dashboard-toolbar"
import { TableRowsSkeleton } from "@/components/loading-skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Dialog } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AdminModalContent } from "@/pages/shared/admin-modal"
import {
  deleteFeedback,
  deleteFeedbackMany,
  deleteFeedbackComment,
  deleteFeedbackCommentsMany,
  getFeedbackErrorMessage,
  listFeedback,
  listFeedbackCommentDashboard,
  updateFeedbackComment,
  type FeedbackCommentItem,
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

const feedbackSkeletonColumns = [
  { skeletonClassName: "h-4 w-4" },
  { skeletonClassName: "h-4 w-56" },
  { skeletonClassName: "h-5 w-20" },
  { cellClassName: "hidden md:table-cell", skeletonClassName: "h-4 w-24" },
  { cellClassName: "hidden lg:table-cell", skeletonClassName: "h-4 w-20" },
  { skeletonClassName: "h-5 w-14" },
  { skeletonClassName: "h-5 w-14" },
  { skeletonClassName: "h-8 w-8" },
]

const commentSkeletonColumns = [
  { skeletonClassName: "h-4 w-4" },
  { skeletonClassName: "h-4 w-64" },
  { cellClassName: "hidden md:table-cell", skeletonClassName: "h-4 w-32" },
  { skeletonClassName: "h-5 w-20" },
  { cellClassName: "hidden lg:table-cell", skeletonClassName: "h-4 w-24" },
  { cellClassName: "hidden lg:table-cell", skeletonClassName: "h-4 w-20" },
  { skeletonClassName: "h-8 w-8" },
]

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

type FeedbackPageProps = {
  refreshToken: number
  onOpenFeedback: () => void
  view?: "feedback" | "comments"
}

export function FeedbackPage({
  refreshToken,
  onOpenFeedback,
  view = "feedback",
}: FeedbackPageProps) {
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
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)

  React.useEffect(() => {
    if (view !== "feedback") {
      setFeedback([])
      setSelectedIds(new Set())
      setLoading(false)
      setError(null)
      return
    }

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
  }, [refreshToken, view])

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

  return (
    <div className="w-full pb-8">
      {view === "feedback" ? (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
            <PeriodTabs
              activePeriod={periodFilter}
              onPeriodChange={setPeriodFilter}
            />
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {selectedIds.size ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8 w-fit gap-2 sm:h-9"
                  onClick={() => setMassDeleteOpen(true)}
                  disabled={massDeleting}
                >
                  {massDeleting ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <Trash2Icon className="size-4" />
                  )}
                  Delete ({selectedIds.size})
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="h-8 w-fit gap-2 sm:h-9"
                onClick={onOpenFeedback}
              >
                <MessageSquarePlusIcon className="size-4" />
                New feedback
              </Button>
            </div>
          </div>
          {error ? (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

      <div className="overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10">
        <DashboardToolbar>
          <DashboardToolbarTitle>
            <span className="flex size-7 shrink-0 items-center justify-center sm:size-8">
              <MessageSquarePlusIcon className="size-4 text-muted-foreground sm:size-[18px]" />
            </span>
            <span className="text-sm font-medium sm:text-base">Feedback</span>
            <Badge variant="secondary">{filteredFeedback.length}</Badge>
            {selectedIds.size ? (
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear {selectedIds.size} selected
              </button>
            ) : null}
          </DashboardToolbarTitle>

          <DashboardToolbarControls>
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
          </DashboardToolbarControls>
        </DashboardToolbar>

        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 min-w-12">
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
            <TableBody>
              {loading ? (
                <TableRowsSkeleton columns={feedbackSkeletonColumns} />
              ) : paginatedFeedback.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    No feedback found matching your filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedFeedback.map((item) => (
                  <TableRow key={item.id} className="group">
                    <TableCell>
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setEditingFeedback(item)}
                        title="Feedback settings"
                        aria-label="Feedback settings"
                      >
                        <SettingsIcon className="h-4 w-4" />
                        <span className="sr-only">Feedback settings</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <div className="flex flex-col justify-between gap-3 bg-muted/50 p-4 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <span className="hidden sm:inline">Rows per page:</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              {filteredFeedback.length === 0
                ? "0"
                : `${(currentPage - 1) * pageSize + 1}-${Math.min(
                    currentPage * pageSize,
                    filteredFeedback.length
                  )}`}{" "}
              of {filteredFeedback.length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              aria-label="Go to first page"
            >
              <ChevronsLeftIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Go to previous page"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages || totalPages === 0}
              aria-label="Go to next page"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              aria-label="Go to last page"
            >
              <ChevronsRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      </div>
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
        </>
      ) : (
        <FeedbackCommentsDashboard />
      )}
    </div>
  )
}

function FeedbackCommentsDashboard() {
  const [comments, setComments] = React.useState<FeedbackCommentItem[]>([])
  const [searchQuery, setSearchQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
  const [periodFilter, setPeriodFilter] =
    React.useState<FeedbackPeriod>("1year")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[0])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [editingComment, setEditingComment] =
    React.useState<FeedbackCommentItem | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [massDeleting, setMassDeleting] = React.useState(false)

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PeriodTabs
          activePeriod={periodFilter}
          onPeriodChange={setPeriodFilter}
        />
        {selectedIds.size ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-8 w-fit gap-2 sm:h-9"
            onClick={() => setMassDeleteOpen(true)}
            disabled={massDeleting}
          >
            {massDeleting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <Trash2Icon className="size-4" />
            )}
            Delete ({selectedIds.size})
          </Button>
        ) : null}
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

      <div className="overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10">
        <DashboardToolbar>
          <DashboardToolbarTitle>
            <span className="flex size-7 shrink-0 items-center justify-center sm:size-8">
              <MessageSquareIcon className="size-4 text-muted-foreground sm:size-[18px]" />
            </span>
            <span className="text-sm font-medium sm:text-base">Comments</span>
            <Badge variant="secondary">{filteredComments.length}</Badge>
            {selectedIds.size ? (
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear {selectedIds.size} selected
              </button>
            ) : null}
          </DashboardToolbarTitle>

          <DashboardToolbarControls>
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
          </DashboardToolbarControls>
        </DashboardToolbar>

        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 min-w-12">
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
                  Comment
                </TableHead>
                <TableHead column="preview">
                  Feedback
                </TableHead>
                <TableHead column="meta">
                  Type
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  Author
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  Created
                </TableHead>
                <TableHead column="meta">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRowsSkeleton columns={commentSkeletonColumns} />
              ) : paginatedComments.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    No comments found matching your filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedComments.map((comment) => (
                  <TableRow key={comment.id} className="group">
                    <TableCell>
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
                        className={
                          feedbackTypeClassNames[comment.feedback_type]
                        }
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <div className="flex flex-col justify-between gap-3 bg-muted/50 p-4 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <span className="hidden sm:inline">Rows per page:</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              {filteredComments.length === 0
                ? "0"
                : `${(currentPage - 1) * pageSize + 1}-${Math.min(
                    currentPage * pageSize,
                    filteredComments.length
                  )}`}{" "}
              of {filteredComments.length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              aria-label="Go to first page"
            >
              <ChevronsLeftIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Go to previous page"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages || totalPages === 0}
              aria-label="Go to next page"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              aria-label="Go to last page"
            >
              <ChevronsRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {visibleSelected &&
      filteredCommentIds.length > paginatedCommentIds.length ? (
        <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
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
    </div>
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
      <AdminModalContent
        title={`Delete ${count} Feedback Item${count === 1 ? "" : "s"}`}
        description="This action cannot be undone."
        bodyClassName="space-y-3"
        footer={
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
        }
      >
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete {count} feedback item
          {count === 1 ? "" : "s"}?
        </p>
      </AdminModalContent>
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
      <AdminModalContent
        title={`Delete ${count} Comment${count === 1 ? "" : "s"}`}
        description="This action cannot be undone."
        bodyClassName="space-y-3"
        footer={
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
        }
      >
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete {count} comment
          {count === 1 ? "" : "s"}?
        </p>
      </AdminModalContent>
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
      <AdminModalContent
        title="Edit Comment"
        description="Update the comment or remove it from the thread."
        footer={
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
        }
      >
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
      </AdminModalContent>
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
      <AdminModalContent
        title="Edit Feedback"
        description="Update the message and feedback type."
        footer={
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
        }
      >
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
      </AdminModalContent>
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
