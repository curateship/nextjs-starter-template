import * as React from "react"
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  SaveIcon,
  Loader2Icon,
  MessageSquarePlusIcon,
  SettingsIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FeedbackTableSkeleton } from "@/components/loading-skeleton"
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
  getFeedbackErrorMessage,
  listFeedback,
  updateFeedback,
  type FeedbackItem,
  type FeedbackType,
} from "@/lib/feedback-api"
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

const pageSizeOptions = [10, 25, 50]

type FeedbackPeriod = "1year" | "3months" | "30days"

const feedbackPeriodLabels: Record<FeedbackPeriod, string> = {
  "1year": "1 Year",
  "3months": "3 Months",
  "30days": "30 Days",
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

type FeedbackPageProps = {
  refreshToken: number
  onOpenFeedback: () => void
}

export function FeedbackPage({
  refreshToken,
  onOpenFeedback,
}: FeedbackPageProps) {
  const [feedback, setFeedback] = React.useState<FeedbackItem[]>([])
  const [searchQuery, setSearchQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<string>("all")
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
    return feedback.filter((item) => {
      const matchesSearch =
        !query ||
        item.message.toLowerCase().includes(query) ||
        item.author_name.toLowerCase().includes(query)
      const matchesType = typeFilter === "all" || item.type === typeFilter
      const matchesPeriod = new Date(item.created_at) >= periodStart
      return matchesSearch && matchesType && matchesPeriod
    })
  }, [feedback, periodFilter, searchQuery, typeFilter])

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
  }, [searchQuery, periodFilter, typeFilter, pageSize])

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
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-1 items-center gap-2 sm:gap-2.5">
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
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <SearchIcon
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground sm:size-5"
                aria-hidden="true"
              />
              <Input
                type="search"
                name="feedback-search"
                inputMode="search"
                autoComplete="off"
                aria-label="Search feedback"
                placeholder="Search feedback..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-8 w-full pl-9 text-sm sm:h-9 sm:w-[180px] sm:pl-10 lg:w-[240px]"
              />
            </div>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger
                className="h-8 w-[150px] text-xs sm:h-9 sm:text-sm"
                aria-label="Filter by type"
              >
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(feedbackTypeLabels).map(([type, label]) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ScrollArea className="w-full">
          <Table className="[&_tbody_tr:first-child_td]:pt-4 [&_tbody_tr:hover]:bg-transparent [&_tbody_tr:last-child_td]:pb-4 [&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6 [&_tr]:border-0">
            <TableHeader className="[&_tr]:border-b-0">
              <TableRow className="bg-muted/50">
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
                <TableHead className="w-full min-w-[260px] text-xs font-medium text-muted-foreground sm:text-sm">
                  Feedback
                </TableHead>
                <TableHead className="w-px whitespace-nowrap text-right text-xs font-medium text-muted-foreground sm:text-sm">
                  Type
                </TableHead>
                <TableHead className="hidden w-px whitespace-nowrap text-right text-xs font-medium text-muted-foreground sm:text-sm md:table-cell">
                  Author
                </TableHead>
                <TableHead className="hidden w-px whitespace-nowrap text-right text-xs font-medium text-muted-foreground sm:text-sm lg:table-cell">
                  Created
                </TableHead>
                <TableHead className="w-px whitespace-nowrap text-right text-xs font-medium text-muted-foreground sm:text-sm">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <FeedbackTableSkeleton />
              ) : paginatedFeedback.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
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
                    <TableCell className="min-w-[260px]">
                      <button
                        type="button"
                        className="line-clamp-2 max-w-full whitespace-normal text-left text-xs font-medium group-hover:underline sm:text-sm"
                        onClick={() => setEditingFeedback(item)}
                        title={item.message}
                      >
                        {item.message}
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Badge variant={feedbackTypeBadgeVariants[item.type]}>
                        {feedbackTypeLabels[item.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-right text-xs text-muted-foreground sm:text-sm md:table-cell">
                      {item.author_name}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-right text-xs text-muted-foreground sm:text-sm lg:table-cell">
                      {dateFormatter.format(new Date(item.created_at))}
                    </TableCell>
                    <TableCell className="text-right">
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
