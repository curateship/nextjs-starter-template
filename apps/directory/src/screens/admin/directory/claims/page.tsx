"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "@/components/app-link"
import Ban from "lucide-react/dist/esm/icons/ban.js"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Clock3 from "lucide-react/dist/esm/icons/clock-3.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import FilePenLine from "lucide-react/dist/esm/icons/file-pen-line.js"
import MailCheck from "lucide-react/dist/esm/icons/mail-check.js"
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check.js"
import XCircle from "lucide-react/dist/esm/icons/circle-x.js"

import {
  getDirectoryClaimListAction,
  getDirectoryOwnerEditRequestListAction,
  reviewDirectoryClaimAction,
  reviewDirectoryOwnerEditRequestAction,
  type DirectoryClaimListItem,
  type DirectoryClaimStatus,
  type DirectoryOwnerEditRequestListItem,
  type DirectoryOwnerEditRequestStatus
} from "@/lib/actions/directories/directory-claim-actions"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { AdminTableShell, AdminListPending, AdminTableSummaryFooter, formatShortDate as formatDate } from "@/components/admin/layout/list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

const CLAIM_FILTERS = [
  { value: "pending_email", label: "Pending Email", icon: MailCheck },
  { value: "pending_review", label: "Pending Review", icon: Clock3 },
  { value: "approved", label: "Approved", icon: CheckCircle2 },
  { value: "rejected", label: "Rejected", icon: XCircle },
  { value: "revoked", label: "Revoked", icon: Ban }
]

const OWNER_EDIT_FILTERS = [
  { value: "pending", label: "Pending Review", icon: Clock3 },
  { value: "approved", label: "Approved", icon: CheckCircle2 },
  { value: "rejected", label: "Rejected", icon: XCircle },
]

function statusBadge(status: DirectoryClaimStatus) {
  switch (status) {
    case "pending_email":
      return <Badge variant="secondary">Pending Email</Badge>
    case "pending_review":
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Pending Review</Badge>
    case "approved":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Approved</Badge>
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>
    default:
      return <Badge variant="secondary">Revoked</Badge>
  }
}

function ownerEditStatusBadge(status: DirectoryOwnerEditRequestStatus) {
  switch (status) {
    case "pending":
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Pending Review</Badge>
    case "approved":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Approved</Badge>
    default:
      return <Badge variant="destructive">Rejected</Badge>
  }
}

function describeOwnerEdit(request: DirectoryOwnerEditRequestListItem) {
  const blockCount = Object.values(request.content_blocks || {}).filter((block: any) => block?.type).length
  return [
    request.listing_values?.title ? `Title: ${request.listing_values.title}` : null,
    request.listing_values?.slug ? `Slug: ${request.listing_values.slug}` : null,
    `${request.category_ids.length} categories`,
    `${blockCount} content blocks`,
  ].filter(Boolean).join(" · ")
}

function ViewListingButton({ slug }: { slug: string }) {
  return (
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
      <a
        href={`/directory/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        title="View Listing"
      >
        <ExternalLink className="h-4 w-4" />
        <span className="sr-only">View Listing</span>
      </a>
    </Button>
  )
}

export default function DirectoryClaimsPage() {
  const { currentSite, loading: siteLoading } = useSiteSwitcher()
  const [activeView, setActiveView] = useState<"claims" | "owner_edits">("claims")
  const [activeStatus, setActiveStatus] = useState<DirectoryClaimStatus>("pending_review")
  const [ownerEditStatus, setOwnerEditStatus] = useState<DirectoryOwnerEditRequestStatus>("pending")
  const [claims, setClaims] = useState<DirectoryClaimListItem[]>([])
  const [ownerEdits, setOwnerEdits] = useState<DirectoryOwnerEditRequestListItem[]>([])
  const [counts, setCounts] = useState<Record<DirectoryClaimStatus, number>>({
    pending_email: 0,
    pending_review: 0,
    approved: 0,
    rejected: 0,
    revoked: 0
  })
  const [ownerEditCounts, setOwnerEditCounts] = useState<Record<DirectoryOwnerEditRequestStatus, number>>({
    pending: 0,
    approved: 0,
    rejected: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedClaim, setSelectedClaim] = useState<DirectoryClaimListItem | null>(null)
  const [selectedOwnerEdit, setSelectedOwnerEdit] = useState<DirectoryOwnerEditRequestListItem | null>(null)
  const [reviewNote, setReviewNote] = useState("")
  const [ownerEditReviewNote, setOwnerEditReviewNote] = useState("")
  const [savingStatus, setSavingStatus] = useState<DirectoryClaimStatus | null>(null)
  const [savingOwnerEditStatus, setSavingOwnerEditStatus] = useState<DirectoryOwnerEditRequestStatus | null>(null)

  const loadRows = useCallback(async () => {
    if (!currentSite?.id) {
      setClaims([])
      setOwnerEdits([])
      setLoading(siteLoading)
      return
    }

    setLoading(true)
    setError(null)
    const result = activeView === "claims"
      ? await getDirectoryClaimListAction({ data: { siteId: currentSite.id, status: activeStatus } })
      : await getDirectoryOwnerEditRequestListAction({ data: { siteId: currentSite.id, status: ownerEditStatus } })
    setLoading(false)

    if (result.error) {
      setError(result.error)
      if (activeView === "claims") {
        setClaims([])
        setCounts(result.counts as Record<DirectoryClaimStatus, number>)
      } else {
        setOwnerEdits([])
        setOwnerEditCounts(result.counts as Record<DirectoryOwnerEditRequestStatus, number>)
      }
      return
    }

    if (activeView === "claims") {
      setClaims(result.data as DirectoryClaimListItem[])
      setCounts(result.counts as Record<DirectoryClaimStatus, number>)
    } else {
      setOwnerEdits(result.data as DirectoryOwnerEditRequestListItem[])
      setOwnerEditCounts(result.counts as Record<DirectoryOwnerEditRequestStatus, number>)
    }
  }, [activeStatus, activeView, currentSite?.id, ownerEditStatus, siteLoading])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    setReviewNote(selectedClaim?.review_note || "")
  }, [selectedClaim])

  useEffect(() => {
    setOwnerEditReviewNote(selectedOwnerEdit?.review_note || "")
  }, [selectedOwnerEdit])

  const emptyText = useMemo(() => {
    if (activeView === "owner_edits") {
      const tab = OWNER_EDIT_FILTERS.find((item) => item.value === ownerEditStatus)
      return `No ${tab?.label.toLowerCase() || "owner edit"} requests.`
    }

    const tab = CLAIM_FILTERS.find((item) => item.value === activeStatus)
    return `No ${tab?.label.toLowerCase() || "claim"} requests.`
  }, [activeStatus, activeView, ownerEditStatus])

  const handleReview = async (status: "approved" | "rejected" | "revoked") => {
    if (!selectedClaim) return

    setSavingStatus(status)
    const result = await reviewDirectoryClaimAction({ data: { input: {
      claimId: selectedClaim.id,
      status,
      note: reviewNote
    } } })
    setSavingStatus(null)

    if (result.error) {
      setError(result.error)
      return
    }

    setSelectedClaim(null)
    await loadRows()
  }

  const handleOwnerEditReview = async (status: "approved" | "rejected") => {
    if (!selectedOwnerEdit) return

    setSavingOwnerEditStatus(status)
    const result = await reviewDirectoryOwnerEditRequestAction({ data: { input: {
      requestId: selectedOwnerEdit.id,
      status,
      note: ownerEditReviewNote
    } } })
    setSavingOwnerEditStatus(null)

    if (result.error) {
      setError(result.error)
      return
    }

    setSelectedOwnerEdit(null)
    await loadRows()
  }

  const activeRowsCount = activeView === "claims" ? claims.length : ownerEdits.length

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[{ label: "Directory", href: "/admin/directory" }, { label: "Claims" }]} />

          <AdminTableShell
            title={activeView === "claims" ? "Claims" : "Owner Edits"}
            icon={activeView === "claims"
              ? <ShieldCheck className="text-muted-foreground" />
              : <FilePenLine className="text-muted-foreground" />
            }
            count={activeRowsCount}
            loading={loading}
            controls={
              <TableRightActions>
                <Button
                  type="button"
                  variant={activeView === "claims" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveView("claims")}
                >
                  Claims
                </Button>
                <Button
                  type="button"
                  variant={activeView === "owner_edits" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveView("owner_edits")}
                >
                  Owner Edits
                </Button>
                {activeView === "claims" ? (
                  <Select value={activeStatus} onValueChange={(value) => setActiveStatus(value as DirectoryClaimStatus)}>
                    <TableRightActionsSelectTrigger aria-label="Claim status filter">
                      <SelectValue />
                    </TableRightActionsSelectTrigger>
                    <SelectContent>
                      {CLAIM_FILTERS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label} ({counts[item.value as DirectoryClaimStatus] || 0})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={ownerEditStatus} onValueChange={(value) => setOwnerEditStatus(value as DirectoryOwnerEditRequestStatus)}>
                    <TableRightActionsSelectTrigger aria-label="Owner edit status filter">
                      <SelectValue />
                    </TableRightActionsSelectTrigger>
                    <SelectContent>
                      {OWNER_EDIT_FILTERS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label} ({ownerEditCounts[item.value as DirectoryOwnerEditRequestStatus] || 0})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </TableRightActions>
            }
            footer={!loading ? <AdminTableSummaryFooter count={activeRowsCount} label={activeView === "claims" ? "claims" : "owner edits"} /> : null}
          >
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  {activeView === "claims" ? (
                    <TableRow>
                      <TableHead column="main">Listing</TableHead>
                      <TableHead column="content">Claimant</TableHead>
                      <TableHead column="content">Business Email</TableHead>
                      <TableHead column="meta">Status</TableHead>
                      <TableHead column="meta">Actions</TableHead>
                    </TableRow>
                  ) : (
                    <TableRow>
                      <TableHead column="main">Listing</TableHead>
                      <TableHead column="content">Owner</TableHead>
                      <TableHead column="content">Submitted Changes</TableHead>
                      <TableHead column="meta">Status</TableHead>
                      <TableHead column="meta">Actions</TableHead>
                    </TableRow>
                  )}
                </TableHeader>
                <TableBody>
                  {loading && activeRowsCount === 0 ? (
                    <AdminListPending />
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <p className="mb-4 text-red-600">{error}</p>
                        <Button onClick={loadRows} variant="outline" size="sm">
                          Try Again
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : activeRowsCount === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        {activeView === "claims"
                          ? <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                          : <FilePenLine className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        }
                        <p className="text-muted-foreground">{emptyText}</p>
                      </TableCell>
                    </TableRow>
                  ) : activeView === "owner_edits" ? (
                    ownerEdits.map((request) => (
                      <TableRow key={request.id} className="group">
                        <TableCell column="main">
                          <Link href={`/directory/${request.directory_slug}`} className="block hover:opacity-80">
                            <h4 className="truncate font-medium hover:underline">{request.directory_title}</h4>
                            <p className="truncate text-sm text-muted-foreground">/directory/{request.directory_slug}</p>
                          </Link>
                        </TableCell>
                        <TableCell column="content">
                          <div className="truncate text-sm">{request.claimant_display_name || "Unknown"}</div>
                          <div className="truncate text-sm text-muted-foreground">{request.claimant_account_email}</div>
                        </TableCell>
                        <TableCell column="content">
                          <div className="line-clamp-2 text-sm text-muted-foreground">{describeOwnerEdit(request)}</div>
                        </TableCell>
                        <TableCell column="meta">
                          <div className="space-y-2">
                            {ownerEditStatusBadge(request.status)}
                            <div className="text-sm text-muted-foreground">{formatDate(request.created_at)}</div>
                          </div>
                        </TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center gap-1">
                            <ViewListingButton slug={request.directory_slug} />
                            <Button variant="outline" size="sm" onClick={() => setSelectedOwnerEdit(request)}>
                              Review
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    claims.map((claim) => (
                      <TableRow key={claim.id} className="group">
                        <TableCell column="main">
                          <Link href={`/directory/${claim.directory_slug}`} className="block hover:opacity-80">
                            <h4 className="truncate font-medium hover:underline">{claim.directory_title}</h4>
                            <p className="truncate text-sm text-muted-foreground">/directory/{claim.directory_slug}</p>
                          </Link>
                        </TableCell>
                        <TableCell column="content">
                          <div className="truncate text-sm">{claim.claimant_name || claim.claimant_display_name || "Unknown"}</div>
                          <div className="truncate text-sm text-muted-foreground">{claim.claimant_account_email}</div>
                        </TableCell>
                        <TableCell column="content">
                          <div className="truncate text-sm">{claim.business_email}</div>
                          <div className="mt-1">
                            {claim.domain_matches ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Domain Match</Badge>
                            ) : (
                              <Badge variant="secondary">Domain Mismatch</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell column="meta">
                          <div className="space-y-2">
                            {statusBadge(claim.status)}
                            <div className="text-sm text-muted-foreground">{formatDate(claim.created_at)}</div>
                          </div>
                        </TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center gap-1">
                            <ViewListingButton slug={claim.directory_slug} />
                            <Button variant="outline" size="sm" onClick={() => setSelectedClaim(claim)}>
                              Review
                            </Button>
                          </div>
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

      <Dialog open={!!selectedClaim} onOpenChange={(open) => !open && setSelectedClaim(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Claim</DialogTitle>
            <DialogDescription>Confirm the business email and proof before granting edit access.</DialogDescription>
          </DialogHeader>

          {selectedClaim ? (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Listing</div>
                  <div className="font-medium">{selectedClaim.directory_title}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div>{statusBadge(selectedClaim.status)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Account Email</div>
                  <div>{selectedClaim.claimant_account_email}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Business Email</div>
                  <div>{selectedClaim.business_email}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Name</div>
                  <div>{selectedClaim.claimant_name || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Role</div>
                  <div>{selectedClaim.role_title || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Phone</div>
                  <div>{selectedClaim.phone || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Domain Check</div>
                  <div>{selectedClaim.domain_matches ? "Matches listing website" : "Does not match listing website"}</div>
                </div>
              </div>

              {selectedClaim.message ? (
                <div className="space-y-1">
                  <Label>Message</Label>
                  <p className="rounded-lg border p-3 text-sm text-muted-foreground">{selectedClaim.message}</p>
                </div>
              ) : null}

              {selectedClaim.proof_url ? (
                <Button variant="outline" asChild>
                  <a href={selectedClaim.proof_url} target="_blank" rel="noopener noreferrer">
                    View Proof Link
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="review-note">Review Note</Label>
                <Textarea id="review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={3} />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {selectedClaim.status === "approved" ? (
                  <Button variant="outline" onClick={() => handleReview("revoked")} disabled={!!savingStatus}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Revoke
                  </Button>
                ) : null}
                {selectedClaim.status !== "approved" ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleReview("rejected")}
                      disabled={!!savingStatus || selectedClaim.status === "pending_email"}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                    <Button onClick={() => handleReview("approved")} disabled={!!savingStatus || selectedClaim.status !== "pending_review"}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => setSelectedClaim(null)}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Done
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedOwnerEdit} onOpenChange={(open) => !open && setSelectedOwnerEdit(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Owner Edit</DialogTitle>
            <DialogDescription>Approve to apply these submitted changes to the public listing.</DialogDescription>
          </DialogHeader>

          {selectedOwnerEdit ? (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Listing</div>
                  <div className="font-medium">{selectedOwnerEdit.directory_title}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div>{ownerEditStatusBadge(selectedOwnerEdit.status)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Owner</div>
                  <div>{selectedOwnerEdit.claimant_display_name || "Unknown"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Account Email</div>
                  <div>{selectedOwnerEdit.claimant_account_email}</div>
                </div>
              </div>

              <div className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Submitted Title</div>
                  <div>{selectedOwnerEdit.listing_values.title || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Submitted Slug</div>
                  <div>{selectedOwnerEdit.listing_values.slug || "-"}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">Featured Image URL</div>
                  <div className="break-all">{selectedOwnerEdit.listing_values.featured_image || "-"}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">Meta Description</div>
                  <div>{selectedOwnerEdit.listing_values.meta_description || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Categories</div>
                  <div>{selectedOwnerEdit.category_ids.length}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Primary Category</div>
                  <div className="break-all">{selectedOwnerEdit.primary_category_id || "-"}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Submitted Content Blocks</Label>
                <div className="max-h-40 overflow-auto rounded-lg border p-3 text-sm text-muted-foreground">
                  {Object.entries(selectedOwnerEdit.content_blocks).length > 0 ? (
                    <ul className="space-y-1">
                      {Object.entries(selectedOwnerEdit.content_blocks).map(([id, block]: [string, any]) => (
                        <li key={id}>{block?.title || block?.type || id}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No content block values submitted.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner-edit-review-note">Review Note</Label>
                <Textarea
                  id="owner-edit-review-note"
                  value={ownerEditReviewNote}
                  onChange={(event) => setOwnerEditReviewNote(event.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {selectedOwnerEdit.status === "pending" ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleOwnerEditReview("rejected")}
                      disabled={!!savingOwnerEditStatus}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => handleOwnerEditReview("approved")}
                      disabled={!!savingOwnerEditStatus}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => setSelectedOwnerEdit(null)}>
                    <FilePenLine className="mr-2 h-4 w-4" />
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
