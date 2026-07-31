"use client"

import { useEffect, useState } from "react"
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardGroup, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Pagination, PaginationInfo } from "@/components/ui/pagination"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { getNewsletterStatusEvents } from "@/lib/actions/newsletters/newsletter-actions"
import { getAutomationStepStatusEvents } from "@/lib/actions/newsletters/automation-actions"
import type { NewsletterStatusEvent, NewsletterStatusEventFilter } from "@/lib/actions/newsletters/status-events-query"
import { cn } from "@/lib/utils/tailwind"

type NewsletterStatusEventsModalProps = {
  automationId?: string
  newsletterId?: string | null
  onError: (message: string) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  showRateCards?: boolean
  stepOrder?: number | null
}

type EventRates = {
  openRate: number
  clickRate: number
  unsubscribeRate: number
}

const STATUS_EVENTS_PAGE_SIZE = 50
const emptyRates: EventRates = {
  openRate: 0,
  clickRate: 0,
  unsubscribeRate: 0
}

const statusEventFilterOptions: {
  value: NewsletterStatusEventFilter
  label: string
}[] = [
  { value: "all", label: "All events" },
  { value: "bounced", label: "Bounced" },
  { value: "unsubscribed", label: "Unsubscribes" },
  { value: "opened", label: "Opened" },
  { value: "clicked", label: "Clicks" },
  { value: "duplicates", label: "Duplicates" }
]

function getStatusEventLabel(event: string) {
  const labels: Record<string, string> = {
    duplicate: "Duplicate",
    bounced: "Bounced",
    unsubscribed: "Unsubscribed",
    opened: "Opened",
    clicked: "Clicked",
    sent: "Sent",
    delivered: "Delivered",
    complained: "Complained"
  }

  return labels[event] ?? event.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

function getStatusEventBadge(event: NewsletterStatusEvent["event"]) {
  const label = getStatusEventLabel(event)
  if (event === "duplicate")
    return (
      <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-400">
        {label}
      </Badge>
    )
  if (event === "bounced")
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
        {label}
      </Badge>
    )
  if (event === "unsubscribed")
    return (
      <Badge variant="outline" className="border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/50 dark:text-yellow-300">
        {label}
      </Badge>
    )
  if (event === "opened")
    return (
      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 dark:text-green-300 dark:border-green-900 dark:bg-green-950/50 dark:text-green-400">
        {label}
      </Badge>
    )
  if (event === "clicked")
    return (
      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-400">
        {label}
      </Badge>
    )
  return <Badge variant="secondary">{label}</Badge>
}

function formatStatusEventDate(dateString: string) {
  return new Date(dateString).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })
}

function hasRates(result: unknown): result is { stats: EventRates } {
  if (!result || typeof result !== "object" || !("stats" in result)) return false
  const stats = (result as { stats?: Partial<EventRates> }).stats
  return (
    typeof stats?.openRate === "number" &&
    typeof stats.clickRate === "number" &&
    typeof stats.unsubscribeRate === "number"
  )
}

export function NewsletterStatusEventsModal({
  automationId,
  newsletterId,
  onError,
  onOpenChange,
  open,
  showRateCards = false,
  stepOrder
}: NewsletterStatusEventsModalProps) {
  const [events, setEvents] = useState<NewsletterStatusEvent[]>([])
  const [rates, setRates] = useState(emptyRates)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [eventFilter, setEventFilter] = useState<NewsletterStatusEventFilter>("all")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || (!newsletterId && (!automationId || !stepOrder))) {
      setEvents([])
      setRates(emptyRates)
      setTotal(0)
      return
    }

    let cancelled = false
    setLoading(true)

    const request =
      automationId && stepOrder
        ? getAutomationStepStatusEvents({ data: { automationId: automationId, stepOrder: stepOrder, options: {
            page,
            pageSize: STATUS_EVENTS_PAGE_SIZE,
            eventFilter
          } } })
        : getNewsletterStatusEvents({ data: { newsletterId: newsletterId!, options: {
            page,
            pageSize: STATUS_EVENTS_PAGE_SIZE,
            eventFilter
          } } })

    request.then((result) => {
      if (cancelled) return
      if (result.error) {
        onError(result.error)
        setEvents([])
        setRates(emptyRates)
        setTotal(0)
      } else {
        setEvents(result.data ?? [])
        setRates(hasRates(result) ? result.stats : emptyRates)
        setTotal(result.total)
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [automationId, eventFilter, newsletterId, onError, open, page, stepOrder])

  function resetState() {
    setEvents([])
    setRates(emptyRates)
    setTotal(0)
    setPage(1)
    setEventFilter("all")
    setLoading(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetState()
    onOpenChange(nextOpen)
  }

  function handleFilterChange(value: NewsletterStatusEventFilter) {
    setEventFilter(value)
    setPage(1)
  }

  const activeFilter =
    statusEventFilterOptions.find((option) => option.value === eventFilter) ?? statusEventFilterOptions[0]
  const totalPages = Math.max(1, Math.ceil(total / STATUS_EVENTS_PAGE_SIZE))

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DashboardModalContent
        className="h-[calc(100vh-4rem)] max-w-[960px]"
        title={
          <div className="flex items-center gap-3">
            Events
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Filter events">
                  <span>{activeFilter.label}</span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44 space-y-1">
                {statusEventFilterOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => handleFilterChange(option.value)}
                    className={cn(option.value === eventFilter && "bg-accent text-accent-foreground")}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
        footer={total > 0 ? (
          <>
            <PaginationInfo currentPage={page} pageSize={STATUS_EVENTS_PAGE_SIZE} total={total} />
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} showFirstLast={false} />
          </>
        ) : undefined}
        footerClassName="gap-3 justify-between"
      >
        {showRateCards && (
          <CardGroup className="grid sm:grid-cols-3">
            {[
              ["Open percentage", rates.openRate],
              ["Click percentage", rates.clickRate],
              ["Unsub percentage", rates.unsubscribeRate]
            ].map(([label, rate]) => (
              <Card key={String(label)}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">{String(label)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{Number(rate).toLocaleString()}%</p>
                </CardContent>
              </Card>
            ))}
          </CardGroup>
        )}

        <Card>
          <ScrollArea>
            <table className="w-full min-w-[720px] table-fixed caption-bottom border-separate border-spacing-0 text-sm">
              <TableHeader className="sticky top-0 z-20 bg-background">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="relative h-12 w-[48%] bg-muted/50 px-4 text-left text-sm font-medium select-none first:rounded-tl-lg first:pl-5">
                    Email
                  </TableHead>
                  <TableHead className="relative h-12 w-[22%] bg-muted/50 px-4 text-left text-sm font-medium select-none">
                    Event
                  </TableHead>
                  <TableHead className="relative h-12 w-[30%] bg-muted/50 px-4 text-left text-sm font-medium select-none last:rounded-tr-lg last:pr-5">
                    Date
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={index} className="border-0 hover:bg-transparent">
                      <TableCell className="px-3 py-2 first:pl-3 sm:px-4 sm:py-3 sm:first:pl-5">
                      </TableCell>
                      <TableCell className="px-3 py-2 sm:px-4 sm:py-3">
                      </TableCell>
                      <TableCell className="px-3 py-2 sm:px-4 sm:py-3 sm:last:pr-5">
                      </TableCell>
                    </TableRow>
                  ))
                ) : events.length === 0 ? (
                  <TableRow className="border-0">
                    <TableCell colSpan={3} className="h-24 px-4 text-center text-sm text-muted-foreground">
                      No events found.
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => (
                    <TableRow key={event.id} className="border-0 hover:bg-muted/50">
                      <TableCell className="min-w-0 px-3 py-2 text-xs first:pl-3 sm:px-4 sm:py-3 sm:text-sm sm:first:pl-5">
                        <div className="truncate" title={event.email}>{event.email}</div>
                      </TableCell>
                      <TableCell className="px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm">
                        {getStatusEventBadge(event.event)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-xs text-muted-foreground sm:px-4 sm:py-3 sm:text-sm sm:last:pr-5">
                        {formatStatusEventDate(event.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </Card>
      </DashboardModalContent>
    </Dialog>
  )
}
