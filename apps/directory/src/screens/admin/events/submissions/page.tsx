"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import CalendarPlus from "lucide-react/dist/esm/icons/calendar-plus.js"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Clock3 from "lucide-react/dist/esm/icons/clock-3.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import XCircle from "lucide-react/dist/esm/icons/circle-x.js"

import {
  getEventSubmissionListAction,
  reviewEventSubmissionAction,
  type EventSubmissionListItem,
  type EventSubmissionStatus,
} from "@/lib/actions/events/event-submission-actions"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger,
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import {
  AdminListFooter,
  AdminListPending,
  AdminSortableHead,
  AdminTableShell,
  RelativeDate,
  useAdminSort,
} from "@/components/admin/layout/list"
import Link from "@/components/app-link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"

const STATUS_FILTERS = [
  { value: "pending", label: "Pending Review", icon: Clock3 },
  { value: "approved", label: "Approved", icon: CheckCircle2 },
  { value: "rejected", label: "Rejected", icon: XCircle },
] as const

type SubmissionSortColumn = "event" | "submitter" | "when" | "status"

function statusBadge(status: EventSubmissionStatus) {
  switch (status) {
    case "pending":
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Pending Review</Badge>
    case "approved":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Approved</Badge>
    default:
      return <Badge variant="destructive">Rejected</Badge>
  }
}

export default function EventSubmissionsPage() {
  const { currentSite, loading: siteLoading, pageSize } = useSiteSwitcher()
  const [activeStatus, setActiveStatus] = useState<EventSubmissionStatus>("pending")
  const [submissions, setSubmissions] = useState<EventSubmissionListItem[]>([])
  const [counts, setCounts] = useState<Record<EventSubmissionStatus, number>>({
    pending: 0,
    approved: 0,
    rejected: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<EventSubmissionListItem | null>(null)
  const [reviewNote, setReviewNote] = useState("")
  const [savingStatus, setSavingStatus] = useState<"approved" | "rejected" | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  // Queue screens open oldest-first: within one status filter every row shares
  // the status, so the created-at tiebreak puts the longest-waiting one on top.
  const submissionSort = useAdminSort<SubmissionSortColumn>("status", "asc")

  const loadRows = useCallback(async () => {
    if (!currentSite?.id) {
      setSubmissions([])
      setLoading(siteLoading)
      return
    }

    setLoading(true)
    setError(null)
    const result = await getEventSubmissionListAction({ data: { siteId: currentSite.id, status: activeStatus } })
    setLoading(false)

    if (result.error) {
      setError(result.error)
      setSubmissions([])
      setCounts(result.counts)
      return
    }

    setSubmissions(result.data)
    setCounts(result.counts)
  }, [activeStatus, currentSite?.id, siteLoading])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    setReviewNote(selected?.review_note || "")
  }, [selected])

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  const emptyText = useMemo(() => {
    if (normalizedSearchQuery) return "No submissions found matching your search."
    const tab = STATUS_FILTERS.find((item) => item.value === activeStatus)
    return `No ${tab?.label.toLowerCase() || "event"} submissions.`
  }, [activeStatus, normalizedSearchQuery])

  const filteredSubmissions = useMemo(() => {
    if (!normalizedSearchQuery) return submissions
    return submissions.filter((submission) => [
      submission.event_name,
      submission.description,
      submission.submitter_email,
      submission.date_time_text,
      submission.location
    ].join(" ").toLowerCase().includes(normalizedSearchQuery))
  }, [normalizedSearchQuery, submissions])

  const sortedSubmissions = useMemo(() => {
    return [...filteredSubmissions].sort((a, b) => {
      if (!submissionSort.sortColumn) return 0

      const dir = submissionSort.sortDirection === "asc" ? 1 : -1
      if (submissionSort.sortColumn === "event") return a.event_name.localeCompare(b.event_name) * dir
      if (submissionSort.sortColumn === "submitter")
        return (a.submitter_email || "").localeCompare(b.submitter_email || "") * dir
      // "When" is the submitter's free text, so this is a plain text sort.
      if (submissionSort.sortColumn === "when")
        return (
          ((a.date_time_text || "").localeCompare(b.date_time_text || "") ||
            (a.location || "").localeCompare(b.location || "")) * dir
        )

      return (
        (a.status.localeCompare(b.status) ||
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
      )
    })
  }, [filteredSubmissions, submissionSort.sortColumn, submissionSort.sortDirection])

  // Searching, switching status or re-sorting from a later page would
  // otherwise land you past the end of the shorter result.
  useResetPageOnListChange(
    setCurrentPage,
    `${currentSite?.id}|${activeStatus}|${normalizedSearchQuery}|${submissionSort.sortColumn}|${submissionSort.sortDirection}`
  )

  const pagedSubmissions = useMemo(
    () => sortedSubmissions.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, sortedSubmissions]
  )

  const handleReview = async (status: "approved" | "rejected") => {
    if (!selected) return

    setSavingStatus(status)
    const result = await reviewEventSubmissionAction({ data: { input: {
      submissionId: selected.id,
      status,
      note: reviewNote,
    } } })
    setSavingStatus(null)

    if (result.error) {
      setError(result.error)
      return
    }

    setSelected(null)
    await loadRows()
    showActionSuccess(status === "approved" ? "Submission approved." : "Submission rejected.")
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[{ label: "Events", href: "/admin/events" }, { label: "Submissions" }]} />

          <AdminTableShell
            error={error ? { message: error, onRetry: loadRows } : null}
            title="Event Submissions"
            icon={<CalendarPlus className="text-muted-foreground" />}
            count={filteredSubmissions.length}
            loading={loading}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search submissions"
                />
                <Select value={activeStatus} onValueChange={(value) => setActiveStatus(value as EventSubmissionStatus)}>
                  <TableRightActionsSelectTrigger aria-label="Submission status filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label} ({counts[item.value] || 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableRightActions>
            }
            footer={!loading ? <AdminListFooter currentPage={currentPage} pageSize={pageSize} total={filteredSubmissions.length} onPageChange={setCurrentPage} /> : null}
          >
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <AdminSortableHead column="main" sort={submissionSort} sortKey="event">Event</AdminSortableHead>
                    <AdminSortableHead column="content" sort={submissionSort} sortKey="submitter">Submitter</AdminSortableHead>
                    <AdminSortableHead column="content" sort={submissionSort} sortKey="when">When &amp; Where</AdminSortableHead>
                    <AdminSortableHead column="meta" sort={submissionSort} sortKey="status">Status</AdminSortableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && filteredSubmissions.length === 0 ? (
                    <AdminListPending />
                  ) : filteredSubmissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <CalendarPlus className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">{emptyText}</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedSubmissions.map((submission) => (
                      <TableRow key={submission.id} className="group">
                        <TableCell column="main">
                          <button
                            type="button"
                            onClick={() => setSelected(submission)}
                            className="block text-left hover:opacity-80"
                          >
                            <h4 className="truncate font-medium hover:underline" title={submission.event_name}>{submission.event_name}</h4>
                            {submission.description ? (
                              <p className="truncate text-sm text-muted-foreground" title={submission.description}>{submission.description}</p>
                            ) : null}
                          </button>
                        </TableCell>
                        <TableCell column="content">
                          <div className="truncate text-sm" title={submission.submitter_email}>{submission.submitter_email}</div>
                        </TableCell>
                        <TableCell column="content">
                          <div className="truncate text-sm" title={submission.date_time_text || "—"}>{submission.date_time_text || "—"}</div>
                          <div className="truncate text-sm text-muted-foreground" title={submission.location || "—"}>{submission.location || "—"}</div>
                        </TableCell>
                        <TableCell column="meta">
                          <div className="space-y-2">
                            {statusBadge(submission.status)}
                            <div className="text-sm text-muted-foreground"><RelativeDate date={submission.created_at} /></div>
                          </div>
                        </TableCell>
                        <TableCell column="meta">
                          <Button variant="outline" size="sm" onClick={() => setSelected(submission)}>
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>
        </div>
      </AdminLayout>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Event Submission</DialogTitle>
            <DialogDescription>Approving creates a draft event pre-filled with these details. Nothing goes live until you publish it.</DialogDescription>
          </DialogHeader>

          {selected ? (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">Event</div>
                  <div className="font-medium">{selected.event_name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div>{statusBadge(selected.status)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Submitter</div>
                  <div className="break-all">{selected.submitter_email}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">When</div>
                  <div>{selected.date_time_text || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Location</div>
                  <div>{selected.location || "—"}</div>
                </div>
              </div>

              {selected.description ? (
                <div className="space-y-1">
                  <Label>Description</Label>
                  <p className="whitespace-pre-wrap rounded-lg border p-3 text-sm text-muted-foreground">{selected.description}</p>
                </div>
              ) : null}

              {selected.status === "approved" && selected.created_event_slug ? (
                <Button variant="outline" asChild>
                  <Link href="/admin/events">
                    Open draft event in Events
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : null}

              {selected.status === "pending" ? (
                <div className="space-y-2">
                  <Label htmlFor="submission-review-note">Review Note</Label>
                  <Textarea
                    id="submission-review-note"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    rows={3}
                    placeholder="Optional note for your records."
                  />
                </div>
              ) : selected.review_note ? (
                <div className="space-y-1">
                  <Label>Review Note</Label>
                  <p className="rounded-lg border p-3 text-sm text-muted-foreground">{selected.review_note}</p>
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                {selected.status === "pending" ? (
                  <>
                    <Button variant="outline" onClick={() => handleReview("rejected")} disabled={!!savingStatus}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                    <Button onClick={() => handleReview("approved")} disabled={!!savingStatus}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve &amp; Create Draft
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => setSelected(null)}>
                    Done
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
