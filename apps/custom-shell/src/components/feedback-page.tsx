import * as React from "react"
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Loader2Icon,
  MessageSquarePlusIcon,
  SearchIcon,
  ThumbsUpIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FeedbackTableSkeleton } from "@/components/loading-skeleton"
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getFeedbackErrorMessage,
  listFeedback,
  toggleFeedbackVote,
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
  const [votingId, setVotingId] = React.useState<string | null>(null)

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

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, periodFilter, typeFilter, pageSize])

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)))
  }

  const handleVote = async (item: FeedbackItem) => {
    if (item.type !== "suggestion") {
      return
    }

    setVotingId(item.id)
    setError(null)
    try {
      const updated = await toggleFeedbackVote(item.id)
      setFeedback((current) =>
        current.map((currentItem) =>
          currentItem.id === updated.id ? updated : currentItem
        )
      )
    } catch (voteError) {
      setError(getFeedbackErrorMessage(voteError))
    } finally {
      setVotingId(null)
    }
  }

  return (
    <div className="w-full pb-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PeriodTabs
          activePeriod={periodFilter}
          onPeriodChange={setPeriodFilter}
        />
        <Button
          type="button"
          size="sm"
          className="h-8 w-fit gap-2 self-start sm:h-9 sm:self-auto"
          onClick={onOpenFeedback}
        >
          <MessageSquarePlusIcon className="size-4" />
          New feedback
        </Button>
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

      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-1 items-center gap-2 sm:gap-2.5">
            <Button
              variant="outline"
              size="icon"
              className="size-7 shrink-0 sm:size-8"
              aria-label="Feedback"
            >
              <MessageSquarePlusIcon className="size-4 text-muted-foreground sm:size-[18px]" />
            </Button>
            <span className="text-sm font-medium sm:text-base">Feedback</span>
            <Badge variant="secondary">{filteredFeedback.length}</Badge>
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
        </CardContent>

        <CardContent className="overflow-x-auto">
          <Table className="[&_tr]:border-0">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="min-w-[260px] text-xs font-medium text-muted-foreground sm:text-sm">
                  Feedback
                </TableHead>
                <TableHead className="min-w-[120px] text-xs font-medium text-muted-foreground sm:text-sm">
                  Type
                </TableHead>
                <TableHead className="hidden min-w-[140px] text-xs font-medium text-muted-foreground sm:text-sm md:table-cell">
                  Author
                </TableHead>
                <TableHead className="hidden min-w-[120px] text-xs font-medium text-muted-foreground sm:text-sm lg:table-cell">
                  Created
                </TableHead>
                <TableHead className="min-w-[100px] text-xs font-medium text-muted-foreground sm:text-sm">
                  Votes
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <FeedbackTableSkeleton />
              ) : paginatedFeedback.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    No feedback found matching your filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedFeedback.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-[360px]">
                      <div className="truncate text-xs font-medium sm:text-sm">
                        {item.message}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={feedbackTypeBadgeVariants[item.type]}>
                        {feedbackTypeLabels[item.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:text-sm md:table-cell">
                      {item.author_name}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:text-sm lg:table-cell">
                      {dateFormatter.format(new Date(item.created_at))}
                    </TableCell>
                    <TableCell>
                      {item.type === "suggestion" ? (
                        <Button
                          type="button"
                          variant={item.has_voted ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            "h-8 gap-1.5",
                            item.has_voted && "text-primary-foreground"
                          )}
                          onClick={() => handleVote(item)}
                          disabled={votingId === item.id}
                          aria-label={
                            item.has_voted
                              ? "Remove suggestion vote"
                              : "Upvote suggestion"
                          }
                        >
                          {votingId === item.id ? (
                            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ThumbsUpIcon className="h-3.5 w-3.5" />
                          )}
                          {item.vote_count}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground sm:text-sm">
                          -
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>

        <CardFooter className="flex-col justify-between gap-3 border-t-0 sm:flex-row">
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
        </CardFooter>
      </Card>
    </div>
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
