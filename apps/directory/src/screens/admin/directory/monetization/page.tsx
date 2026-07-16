"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "@/components/app-link"
import Archive from "lucide-react/dist/esm/icons/archive.js"
import ArchiveRestore from "lucide-react/dist/esm/icons/archive-restore.js"
import BadgeDollarSign from "lucide-react/dist/esm/icons/badge-dollar-sign.js"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Clock3 from "lucide-react/dist/esm/icons/clock-3.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Star from "lucide-react/dist/esm/icons/star.js"
import XCircle from "lucide-react/dist/esm/icons/circle-x.js"

import {
  getDirectoryFeaturedEntitlementsAction,
  getDirectoryFeaturedPlansAction,
  revokeDirectoryFeaturedEntitlementAction,
  saveDirectoryFeaturedPlanAction,
  setDirectoryFeaturedPlanArchivedAction,
  type DirectoryFeaturedEntitlementListItem,
  type DirectoryFeaturedEntitlementStatus,
  type DirectoryFeaturedPlanItem
} from "@/lib/actions/directories/directory-monetization-actions"
import { formatCentsAmount } from "@/lib/actions/directories/directory-featured-helpers"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { AdminListSkeleton, AdminTableShell, AdminTableSummaryFooter, formatShortDate as formatDate } from "@/components/admin/layout/list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

const ENTITLEMENT_FILTERS = [
  { value: "active", label: "Active", icon: CheckCircle2 },
  { value: "expired", label: "Expired", icon: Clock3 },
  { value: "revoked", label: "Revoked", icon: XCircle },
]

type PlanDraft = {
  planId: string | null
  name: string
  description: string
  stripePriceId: string
  durationDays: string
  priority: string
  displayOrder: string
}

const EMPTY_PLAN_DRAFT: PlanDraft = {
  planId: null,
  name: "",
  description: "",
  stripePriceId: "",
  durationDays: "30",
  priority: "0",
  displayOrder: "0",
}

function entitlementStatusBadge(status: DirectoryFeaturedEntitlementStatus) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-100 text-green-800">Active</Badge>
    case "expired":
      return <Badge variant="secondary">Expired</Badge>
    default:
      return <Badge variant="destructive">Revoked</Badge>
  }
}

function formatAmount(amount: number | null, currency: string | null) {
  return formatCentsAmount(amount, currency) ?? "-"
}

function planToDraft(plan: DirectoryFeaturedPlanItem): PlanDraft {
  return {
    planId: plan.id,
    name: plan.name,
    description: plan.description || "",
    stripePriceId: plan.stripe_price_id,
    durationDays: String(plan.duration_days),
    priority: String(plan.priority),
    displayOrder: String(plan.display_order),
  }
}

export default function DirectoryMonetizationPage() {
  const { currentSite, loading: siteLoading } = useSiteSwitcher()
  const [activeView, setActiveView] = useState<"plans" | "featured">("plans")
  const [entitlementStatus, setEntitlementStatus] = useState<DirectoryFeaturedEntitlementStatus>("active")
  const [plans, setPlans] = useState<DirectoryFeaturedPlanItem[]>([])
  const [entitlements, setEntitlements] = useState<DirectoryFeaturedEntitlementListItem[]>([])
  const [entitlementCounts, setEntitlementCounts] = useState<Record<DirectoryFeaturedEntitlementStatus, number>>({
    active: 0,
    expired: 0,
    revoked: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [savingPlan, setSavingPlan] = useState(false)
  const [archivingPlanId, setArchivingPlanId] = useState<string | null>(null)
  const [selectedEntitlement, setSelectedEntitlement] = useState<DirectoryFeaturedEntitlementListItem | null>(null)
  const [revokeNote, setRevokeNote] = useState("")
  const [revoking, setRevoking] = useState(false)

  const loadRows = useCallback(async () => {
    if (!currentSite?.id) {
      setPlans([])
      setEntitlements([])
      setLoading(siteLoading)
      return
    }

    setLoading(true)
    setError(null)

    if (activeView === "plans") {
      const result = await getDirectoryFeaturedPlansAction(currentSite.id)
      setLoading(false)
      if (result.error) {
        setError(result.error)
        setPlans([])
        return
      }
      setPlans(result.data)
      return
    }

    const result = await getDirectoryFeaturedEntitlementsAction(currentSite.id, entitlementStatus)
    setLoading(false)
    if (result.error) {
      setError(result.error)
      setEntitlements([])
      setEntitlementCounts(result.counts)
      return
    }
    setEntitlements(result.data)
    setEntitlementCounts(result.counts)
  }, [activeView, currentSite?.id, entitlementStatus, siteLoading])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    setRevokeNote("")
  }, [selectedEntitlement])

  const emptyText = useMemo(() => {
    if (activeView === "plans") return "No featured plans yet. Create one to start selling upgrades."
    const tab = ENTITLEMENT_FILTERS.find((item) => item.value === entitlementStatus)
    return `No ${tab?.label.toLowerCase() || ""} featured listings.`
  }, [activeView, entitlementStatus])

  const handleSavePlan = async () => {
    if (!currentSite?.id || !planDraft) return

    setSavingPlan(true)
    setPlanError(null)
    const result = await saveDirectoryFeaturedPlanAction({
      siteId: currentSite.id,
      planId: planDraft.planId,
      name: planDraft.name,
      description: planDraft.description,
      stripePriceId: planDraft.stripePriceId,
      durationDays: planDraft.durationDays,
      priority: planDraft.priority,
      displayOrder: planDraft.displayOrder,
    })
    setSavingPlan(false)

    if (result.error) {
      setPlanError(result.error)
      return
    }

    setPlanDraft(null)
    await loadRows()
  }

  const handleArchivePlan = async (plan: DirectoryFeaturedPlanItem) => {
    if (!currentSite?.id) return

    setArchivingPlanId(plan.id)
    const result = await setDirectoryFeaturedPlanArchivedAction({
      siteId: currentSite.id,
      planId: plan.id,
      archived: plan.is_active,
    })
    setArchivingPlanId(null)

    if (result.error) {
      setError(result.error)
      return
    }
    await loadRows()
  }

  const handleRevoke = async () => {
    if (!currentSite?.id || !selectedEntitlement) return

    setRevoking(true)
    const result = await revokeDirectoryFeaturedEntitlementAction({
      siteId: currentSite.id,
      entitlementId: selectedEntitlement.id,
      note: revokeNote,
    })
    setRevoking(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSelectedEntitlement(null)
    await loadRows()
  }

  const activeRowsCount = activeView === "plans" ? plans.length : entitlements.length

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[{ label: "Directory", href: "/admin/directory" }, { label: "Monetization" }]} />

          <AdminTableShell
            title={activeView === "plans" ? "Featured Plans" : "Featured Listings"}
            icon={activeView === "plans"
              ? <BadgeDollarSign className="size-4 text-muted-foreground sm:size-[18px]" />
              : <Star className="size-4 text-muted-foreground sm:size-[18px]" />
            }
            count={activeRowsCount}
            controls={
              <TableRightActions>
                <Button
                  type="button"
                  variant={activeView === "plans" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveView("plans")}
                >
                  Plans
                </Button>
                <Button
                  type="button"
                  variant={activeView === "featured" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveView("featured")}
                >
                  Featured Listings
                </Button>
                {activeView === "plans" ? (
                  <Button type="button" size="sm" onClick={() => { setPlanError(null); setPlanDraft(EMPTY_PLAN_DRAFT) }}>
                    <Plus className="mr-1 h-4 w-4" />
                    New Plan
                  </Button>
                ) : (
                  <Select value={entitlementStatus} onValueChange={(value) => setEntitlementStatus(value as DirectoryFeaturedEntitlementStatus)}>
                    <TableRightActionsSelectTrigger aria-label="Featured listing status filter">
                      <SelectValue />
                    </TableRightActionsSelectTrigger>
                    <SelectContent>
                      {ENTITLEMENT_FILTERS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label} ({entitlementCounts[item.value as DirectoryFeaturedEntitlementStatus] || 0})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </TableRightActions>
            }
            footer={!loading ? <AdminTableSummaryFooter count={activeRowsCount} label={activeView === "plans" ? "plans" : "featured listings"} /> : null}
          >
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  {activeView === "plans" ? (
                    <TableRow>
                      <TableHead column="main">Plan</TableHead>
                      <TableHead column="content">Stripe Price</TableHead>
                      <TableHead column="content">Duration</TableHead>
                      <TableHead column="meta">Priority</TableHead>
                      <TableHead column="meta">Status</TableHead>
                      <TableHead column="meta">Actions</TableHead>
                    </TableRow>
                  ) : (
                    <TableRow>
                      <TableHead column="main">Listing</TableHead>
                      <TableHead column="content">Owner</TableHead>
                      <TableHead column="content">Plan</TableHead>
                      <TableHead column="meta">Started</TableHead>
                      <TableHead column="meta">Expires</TableHead>
                      <TableHead column="meta">Actions</TableHead>
                    </TableRow>
                  )}
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton columns={6} showCheckbox={false} showThumbnail={false} />
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <p className="mb-4 text-red-600">{error}</p>
                        <Button onClick={loadRows} variant="outline" size="sm">
                          Try Again
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : activeRowsCount === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        {activeView === "plans"
                          ? <BadgeDollarSign className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                          : <Star className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        }
                        <p className="text-muted-foreground">{emptyText}</p>
                      </TableCell>
                    </TableRow>
                  ) : activeView === "plans" ? (
                    plans.map((plan) => (
                      <TableRow key={plan.id} className="group">
                        <TableCell column="main">
                          <h4 className="truncate font-medium">{plan.name}</h4>
                          {plan.description ? (
                            <p className="truncate text-sm text-muted-foreground">{plan.description}</p>
                          ) : null}
                        </TableCell>
                        <TableCell column="content">
                          <span className="truncate font-mono text-sm">{plan.stripe_price_id}</span>
                        </TableCell>
                        <TableCell column="content">
                          <span className="text-sm">{plan.duration_days} days</span>
                        </TableCell>
                        <TableCell column="meta">
                          <span className="text-sm">{plan.priority}</span>
                        </TableCell>
                        <TableCell column="meta">
                          {plan.is_active
                            ? <Badge className="bg-green-100 text-green-800">Active</Badge>
                            : <Badge variant="secondary">Archived</Badge>
                          }
                        </TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" onClick={() => { setPlanError(null); setPlanDraft(planToDraft(plan)) }}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleArchivePlan(plan)}
                              disabled={archivingPlanId === plan.id}
                              title={plan.is_active ? "Archive plan" : "Restore plan"}
                            >
                              {plan.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    entitlements.map((entitlement) => (
                      <TableRow key={entitlement.id} className="group">
                        <TableCell column="main">
                          <Link href={`/directory/${entitlement.directory_slug}`} className="block hover:opacity-80">
                            <h4 className="truncate font-medium hover:underline">{entitlement.directory_title}</h4>
                            <p className="truncate text-sm text-muted-foreground">/directory/{entitlement.directory_slug}</p>
                          </Link>
                        </TableCell>
                        <TableCell column="content">
                          <div className="truncate text-sm">{entitlement.owner_name || "Unknown"}</div>
                          <div className="truncate text-sm text-muted-foreground">{entitlement.owner_email}</div>
                        </TableCell>
                        <TableCell column="content">
                          <div className="truncate text-sm">{entitlement.plan_name}</div>
                          <div className="truncate text-sm text-muted-foreground">{formatAmount(entitlement.amount_total, entitlement.currency)}</div>
                        </TableCell>
                        <TableCell column="meta">
                          <div className="text-sm text-muted-foreground">{formatDate(entitlement.starts_at)}</div>
                        </TableCell>
                        <TableCell column="meta">
                          <div className="space-y-2">
                            {entitlementStatusBadge(entitlement.status)}
                            <div className="text-sm text-muted-foreground">{formatDate(entitlement.ends_at)}</div>
                          </div>
                        </TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                              <a
                                href={`/directory/${entitlement.directory_slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View Listing"
                              >
                                <ExternalLink className="h-4 w-4" />
                                <span className="sr-only">View Listing</span>
                              </a>
                            </Button>
                            {entitlement.status === "active" ? (
                              <Button variant="outline" size="sm" onClick={() => setSelectedEntitlement(entitlement)}>
                                Revoke
                              </Button>
                            ) : null}
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

      <Dialog open={!!planDraft} onOpenChange={(open) => !open && setPlanDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{planDraft?.planId ? "Edit Featured Plan" : "New Featured Plan"}</DialogTitle>
            <DialogDescription>
              Owners buy this one-time upgrade from My Listings. Payment uses the Stripe price you reference here.
            </DialogDescription>
          </DialogHeader>

          {planDraft ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="plan-name">Plan Name</Label>
                <Input
                  id="plan-name"
                  value={planDraft.name}
                  onChange={(event) => setPlanDraft({ ...planDraft, name: event.target.value })}
                  placeholder="Featured 30 days"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-description">Description</Label>
                <Textarea
                  id="plan-description"
                  value={planDraft.description}
                  onChange={(event) => setPlanDraft({ ...planDraft, description: event.target.value })}
                  rows={2}
                  placeholder="Shown to listing owners on the upgrade options"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-price">Stripe Price ID</Label>
                <Input
                  id="plan-price"
                  value={planDraft.stripePriceId}
                  onChange={(event) => setPlanDraft({ ...planDraft, stripePriceId: event.target.value })}
                  placeholder="price_..."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="plan-duration">Duration (days)</Label>
                  <Input
                    id="plan-duration"
                    type="number"
                    min={1}
                    value={planDraft.durationDays}
                    onChange={(event) => setPlanDraft({ ...planDraft, durationDays: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-priority">Priority</Label>
                  <Input
                    id="plan-priority"
                    type="number"
                    min={0}
                    value={planDraft.priority}
                    onChange={(event) => setPlanDraft({ ...planDraft, priority: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-order">Display Order</Label>
                  <Input
                    id="plan-order"
                    type="number"
                    min={0}
                    value={planDraft.displayOrder}
                    onChange={(event) => setPlanDraft({ ...planDraft, displayOrder: event.target.value })}
                  />
                </div>
              </div>

              {planError ? <p className="text-sm text-red-600">{planError}</p> : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPlanDraft(null)} disabled={savingPlan}>
                  Cancel
                </Button>
                <Button onClick={handleSavePlan} disabled={savingPlan}>
                  {planDraft.planId ? "Save Plan" : "Create Plan"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedEntitlement} onOpenChange={(open) => !open && setSelectedEntitlement(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Revoke Featured Placement</DialogTitle>
            <DialogDescription>
              The listing immediately loses its Featured badge and priority placement. Refunds are handled manually in Stripe.
            </DialogDescription>
          </DialogHeader>

          {selectedEntitlement ? (
            <div className="space-y-4">
              <div className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Listing</div>
                  <div className="font-medium">{selectedEntitlement.directory_title}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Owner</div>
                  <div>{selectedEntitlement.owner_email}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Plan</div>
                  <div>{selectedEntitlement.plan_name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Expires</div>
                  <div>{formatDate(selectedEntitlement.ends_at)}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="revoke-note">Revoke Note</Label>
                <Textarea id="revoke-note" value={revokeNote} onChange={(event) => setRevokeNote(event.target.value)} rows={3} />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedEntitlement(null)} disabled={revoking}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Revoke
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
