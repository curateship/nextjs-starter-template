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
  TableRightActionsSelectTrigger,
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { AdminTableShell, AdminListPending, AdminTableSummaryFooter, formatShortDate as formatDate } from "@/components/admin/layout/list"
import Link from "@/components/app-link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"

const STATUS_FILTERS = [
  { value: "pending", label: "Pending Review", icon: Clock3 },
  { value: "approved", label: "Approved", icon: CheckCircle2 },
  { value: "rejected", label: "Rejected", icon: XCircle },
] as const

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
  const { currentSite, loading: siteLoading } = useSiteSwitcher()
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

  const emptyText = useMemo(() => {
    const tab = STATUS_FILTERS.find((item) => item.value === activeStatus)
    return `No ${tab?.label.toLowerCase() || "event"} submissions.`
  }, [activeStatus])

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
            count={submissions.length}
            loading={loading}
            controls={
              <TableRightActions>
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
            footer={!loading ? <AdminTableSummaryFooter count={submissions.length} label="submissions" /> : null}
          >
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="main">Event</TableHead>
                    <TableHead column="content">Submitter</TableHead>
                    <TableHead column="content">When &amp; Where</TableHead>
                    <TableHead column="meta">Status</TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && submissions.length === 0 ? (
                    <AdminListPending />
                  ) : submissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <CalendarPlus className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">{emptyText}</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    submissions.map((submission) => (
                      <TableRow key={submission.id} className="group">
                        <TableCell column="main">
                          <button
                            type="button"
                            onClick={() => setSelected(submission)}
                            className="block text-left hover:opacity-80"
                          >
                            <h4 className="truncate font-medium hover:underline">{submission.event_name}</h4>
                            {submission.description ? (
                              <p className="truncate text-sm text-muted-foreground">{submission.description}</p>
                            ) : null}
                          </button>
                        </TableCell>
                        <TableCell column="content">
                          <div className="truncate text-sm">{submission.submitter_email}</div>
                        </TableCell>
                        <TableCell column="content">
                          <div className="truncate text-sm">{submission.date_time_text || "—"}</div>
                          <div className="truncate text-sm text-muted-foreground">{submission.location || "—"}</div>
                        </TableCell>
                        <TableCell column="meta">
                          <div className="space-y-2">
                            {statusBadge(submission.status)}
                            <div className="text-sm text-muted-foreground">{formatDate(submission.created_at)}</div>
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
