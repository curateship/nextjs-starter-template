"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Store from "lucide-react/dist/esm/icons/store.js"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Clock3 from "lucide-react/dist/esm/icons/clock-3.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import TriangleAlert from "lucide-react/dist/esm/icons/triangle-alert.js"
import XCircle from "lucide-react/dist/esm/icons/circle-x.js"

import {
  getDirectorySubmissionListAction,
  reviewDirectorySubmissionAction,
  type DirectorySubmissionListItem,
  type DirectorySubmissionStatus,
} from "@/lib/actions/directories/directory-submission-actions"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger,
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { AdminTableShell, AdminListPending, AdminListFooter, RelativeDate } from "@/components/admin/layout/list"
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

type ReviewStatus = Exclude<DirectorySubmissionStatus, "pending_email">

const STATUS_FILTERS = [
  { value: "pending_review", label: "Pending Review", icon: Clock3 },
  { value: "approved", label: "Approved", icon: CheckCircle2 },
  { value: "rejected", label: "Rejected", icon: XCircle },
] as const

function statusBadge(status: DirectorySubmissionStatus) {
  switch (status) {
    case "pending_review":
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Pending Review</Badge>
    case "approved":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Approved</Badge>
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>
    default:
      return <Badge variant="secondary">Unverified</Badge>
  }
}

export default function DirectorySubmissionsPage() {
  const { currentSite, loading: siteLoading, pageSize } = useSiteSwitcher()
  const [activeStatus, setActiveStatus] = useState<ReviewStatus>("pending_review")
  const [submissions, setSubmissions] = useState<DirectorySubmissionListItem[]>([])
  const [counts, setCounts] = useState<Record<DirectorySubmissionStatus, number>>({
    pending_email: 0,
    pending_review: 0,
    approved: 0,
    rejected: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DirectorySubmissionListItem | null>(null)
  const [reviewNote, setReviewNote] = useState("")
  const [savingStatus, setSavingStatus] = useState<"approved" | "rejected" | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)

  const loadRows = useCallback(async () => {
    if (!currentSite?.id) {
      setSubmissions([])
      setLoading(siteLoading)
      return
    }

    setLoading(true)
    setError(null)
    const result = await getDirectorySubmissionListAction({ data: { siteId: currentSite.id, status: activeStatus } })
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
    return `No ${tab?.label.toLowerCase() || "listing"} submissions.`
  }, [activeStatus, normalizedSearchQuery])

  const filteredSubmissions = useMemo(() => {
    if (!normalizedSearchQuery) return submissions
    return submissions.filter((submission) => [
      submission.business_name,
      submission.description,
      submission.contact_email,
      submission.category_title,
      submission.address
    ].join(" ").toLowerCase().includes(normalizedSearchQuery))
  }, [normalizedSearchQuery, submissions])

  // Searching or switching status from a later page would otherwise land you
  // past the end of the shorter result.
  useResetPageOnListChange(
    setCurrentPage,
    `${currentSite?.id}|${activeStatus}|${normalizedSearchQuery}`
  )

  const pagedSubmissions = useMemo(
    () => filteredSubmissions.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredSubmissions, pageSize]
  )

  const handleReview = async (status: "approved" | "rejected") => {
    if (!selected) return

    setSavingStatus(status)
    const result = await reviewDirectorySubmissionAction({ data: { input: {
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
          <DashboardSubheader items={[{ label: "Directory", href: "/admin/directory" }, { label: "Submissions" }]} />

          <AdminTableShell
            error={error ? { message: error, onRetry: loadRows } : null}
            title="Listing Submissions"
            icon={<Store className="text-muted-foreground" />}
            count={filteredSubmissions.length}
            loading={loading}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search submissions"
                />
                <Select value={activeStatus} onValueChange={(value) => setActiveStatus(value as ReviewStatus)}>
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
                    <TableHead column="main">Business</TableHead>
                    <TableHead column="content">Submitter</TableHead>
                    <TableHead column="content">Category &amp; Address</TableHead>
                    <TableHead column="meta">Status</TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && filteredSubmissions.length === 0 ? (
                    <AdminListPending />
                  ) : filteredSubmissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <Store className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
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
                            <h4
                              className="flex items-center gap-2 truncate font-medium hover:underline"
                              title={submission.business_name}
                            >
                              {submission.business_name}
                              {submission.possible_duplicate ? (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                                  <TriangleAlert className="h-3 w-3" />
                                  Possible duplicate
                                </span>
                              ) : null}
                            </h4>
                            {submission.description ? (
                              <p className="truncate text-sm text-muted-foreground" title={submission.description}>{submission.description}</p>
                            ) : null}
                          </button>
                        </TableCell>
                        <TableCell column="content">
                          <div className="truncate text-sm" title={submission.contact_email ?? undefined}>{submission.contact_email}</div>
                        </TableCell>
                        <TableCell column="content">
                          <div className="truncate text-sm" title={submission.category_title || "—"}>{submission.category_title || "—"}</div>
                          <div className="truncate text-sm text-muted-foreground" title={submission.address || "—"}>{submission.address || "—"}</div>
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
            <DialogTitle>Review Listing Submission</DialogTitle>
            <DialogDescription>Approving publishes a new listing built from these details. Rejecting keeps it out of the directory.</DialogDescription>
          </DialogHeader>

          {selected ? (
            <div className="space-y-5">
              {selected.possible_duplicate ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                  A listing with this name already exists on the site. Check for a duplicate before approving.
                </div>
              ) : null}

              <div className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">Business</div>
                  <div className="font-medium">{selected.business_name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div>{statusBadge(selected.status)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Contact email</div>
                  <div className="break-all">{selected.contact_email}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Category</div>
                  <div>{selected.category_title || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Address</div>
                  <div>{selected.address || "—"}</div>
                </div>
                {selected.image_url ? (
                  <div className="sm:col-span-2">
                    <div className="text-xs text-muted-foreground">Image link</div>
                    <a href={selected.image_url} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
                      {selected.image_url}
                    </a>
                  </div>
                ) : null}
              </div>

              {selected.description ? (
                <div className="space-y-1">
                  <Label>Description</Label>
                  <p className="whitespace-pre-wrap rounded-lg border p-3 text-sm text-muted-foreground">{selected.description}</p>
                </div>
              ) : null}

              {selected.status === "approved" && selected.created_directory_slug ? (
                <Button variant="outline" asChild>
                  <Link href={`/directory/${selected.created_directory_slug}`}>
                    View published listing
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : null}

              {selected.status === "pending_review" ? (
                <div className="space-y-2">
                  <Label htmlFor="submission-review-note">Review Note</Label>
                  <Textarea
                    id="submission-review-note"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    rows={3}
                    placeholder="Optional note (included in the email to the submitter if you reject)."
                  />
                </div>
              ) : selected.review_note ? (
                <div className="space-y-1">
                  <Label>Review Note</Label>
                  <p className="rounded-lg border p-3 text-sm text-muted-foreground">{selected.review_note}</p>
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                {selected.status === "pending_review" ? (
                  <>
                    <Button variant="outline" onClick={() => handleReview("rejected")} disabled={!!savingStatus}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                    <Button onClick={() => handleReview("approved")} disabled={!!savingStatus}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve &amp; Publish
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
