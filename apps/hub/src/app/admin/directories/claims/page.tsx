"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Ban, CheckCircle2, Clock3, ExternalLink, MailCheck, ShieldCheck, XCircle } from "lucide-react"

import {
  getDirectoryClaimListAction,
  reviewDirectoryClaimAction,
  type DirectoryClaimListItem,
  type DirectoryClaimStatus
} from "@/lib/actions/directories/directory-claim-actions"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { AdminListSkeleton } from "@/components/admin/layout/list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardTableHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const CLAIM_FILTERS = [
  { value: "pending_email", label: "Pending Email", icon: MailCheck },
  { value: "pending_review", label: "Pending Review", icon: Clock3 },
  { value: "approved", label: "Approved", icon: CheckCircle2 },
  { value: "rejected", label: "Rejected", icon: XCircle },
  { value: "revoked", label: "Revoked", icon: Ban }
]

function formatDate(value: string) {
  return value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      })
    : "-"
}

function statusBadge(status: DirectoryClaimStatus) {
  switch (status) {
    case "pending_email":
      return <Badge variant="secondary">Pending Email</Badge>
    case "pending_review":
      return <Badge className="bg-amber-100 text-amber-800">Pending Review</Badge>
    case "approved":
      return <Badge className="bg-green-100 text-green-800">Approved</Badge>
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>
    default:
      return <Badge variant="secondary">Revoked</Badge>
  }
}

export default function DirectoryClaimsPage() {
  const { currentSite, loading: siteLoading } = useSiteSwitcher()
  const [activeStatus, setActiveStatus] = useState<DirectoryClaimStatus>("pending_review")
  const [claims, setClaims] = useState<DirectoryClaimListItem[]>([])
  const [counts, setCounts] = useState<Record<DirectoryClaimStatus, number>>({
    pending_email: 0,
    pending_review: 0,
    approved: 0,
    rejected: 0,
    revoked: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedClaim, setSelectedClaim] = useState<DirectoryClaimListItem | null>(null)
  const [reviewNote, setReviewNote] = useState("")
  const [savingStatus, setSavingStatus] = useState<DirectoryClaimStatus | null>(null)

  const loadClaims = useCallback(async () => {
    if (!currentSite?.id) {
      setClaims([])
      setLoading(siteLoading)
      return
    }

    setLoading(true)
    setError(null)
    const result = await getDirectoryClaimListAction(currentSite.id, activeStatus)
    setLoading(false)

    if (result.error) {
      setError(result.error)
      setClaims([])
      setCounts(result.counts)
      return
    }

    setClaims(result.data)
    setCounts(result.counts)
  }, [activeStatus, currentSite?.id, siteLoading])

  useEffect(() => {
    void loadClaims()
  }, [loadClaims])

  useEffect(() => {
    setReviewNote(selectedClaim?.review_note || "")
  }, [selectedClaim])

  const emptyText = useMemo(() => {
    const tab = CLAIM_FILTERS.find((item) => item.value === activeStatus)
    return `No ${tab?.label.toLowerCase() || "claim"} requests.`
  }, [activeStatus])

  const handleReview = async (status: "approved" | "rejected" | "revoked") => {
    if (!selectedClaim) return

    setSavingStatus(status)
    const result = await reviewDirectoryClaimAction({
      claimId: selectedClaim.id,
      status,
      note: reviewNote
    })
    setSavingStatus(null)

    if (result.error) {
      setError(result.error)
      return
    }

    setSelectedClaim(null)
    await loadClaims()
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Directory", href: "/admin/directories" }, { label: "Claims" }]}
            filterMenu={{
              value: activeStatus,
              onValueChange: (value) => setActiveStatus(value as DirectoryClaimStatus),
              items: CLAIM_FILTERS.map((item) => ({
                ...item,
                count: counts[item.value as DirectoryClaimStatus] || 0
              }))
            }}
          />

          <Card>
            <CardTableHeader className="grid-cols-6">
              <div className="col-span-2">Listing</div>
              <div>Claimant</div>
              <div>Business Email</div>
              <div>Status</div>
              <div>Actions</div>
            </CardTableHeader>

            <div className="divide-y divide-muted/80">
              {loading ? (
                <AdminListSkeleton columns={6} firstColumnSpan={2} showThumbnail={false} />
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="mb-4 text-red-600">{error}</p>
                  <Button onClick={loadClaims} variant="outline" size="sm">
                    Try Again
                  </Button>
                </div>
              ) : claims.length === 0 ? (
                <div className="p-8 text-center">
                  <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">{emptyText}</p>
                </div>
              ) : (
                claims.map((claim) => (
                  <div key={claim.id} className="p-6 transition-colors">
                    <div className="grid grid-cols-6 items-center gap-4">
                      <div className="col-span-2 min-w-0">
                        <Link href={`/directories/${claim.directory_slug}`} className="block hover:opacity-80">
                          <h4 className="truncate font-medium hover:underline">{claim.directory_title}</h4>
                          <p className="truncate text-sm text-muted-foreground">/directories/{claim.directory_slug}</p>
                        </Link>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm">
                          {claim.claimant_name || claim.claimant_display_name || "Unknown"}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">{claim.claimant_account_email}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm">{claim.business_email}</div>
                        <div className="mt-1">
                          {claim.domain_matches ? (
                            <Badge className="bg-green-100 text-green-800">Domain Match</Badge>
                          ) : (
                            <Badge variant="secondary">Domain Mismatch</Badge>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {statusBadge(claim.status)}
                        <div className="text-sm text-muted-foreground">{formatDate(claim.created_at)}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                          <a
                            href={`/directories/${claim.directory_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View Listing"
                          >
                            <ExternalLink className="h-4 w-4" />
                            <span className="sr-only">View Listing</span>
                          </a>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setSelectedClaim(claim)}>
                          Review
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
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
                  <div>
                    {selectedClaim.domain_matches ? "Matches listing website" : "Does not match listing website"}
                  </div>
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
                <Textarea
                  id="review-note"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {selectedClaim.status !== "revoked" && selectedClaim.status === "approved" ? (
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
                    <Button
                      onClick={() => handleReview("approved")}
                      disabled={!!savingStatus || selectedClaim.status !== "pending_review"}
                    >
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
    </>
  )
}
