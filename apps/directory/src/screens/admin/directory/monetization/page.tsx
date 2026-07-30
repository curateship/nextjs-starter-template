"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "@/components/app-link"
import ArchiveRestore from "lucide-react/dist/esm/icons/archive-restore.js"
import BadgeDollarSign from "lucide-react/dist/esm/icons/badge-dollar-sign.js"
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check.js"
import Clock3 from "lucide-react/dist/esm/icons/clock-3.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Settings from "lucide-react/dist/esm/icons/settings.js"
import Star from "lucide-react/dist/esm/icons/star.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
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
import { MonetizationRevenueSummary } from "@/screens/admin/directory/monetization/revenue-summary"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { AdminSortButton, AdminTableShell, AdminListPending, AdminTableSummaryFooter, formatShortDate as formatDate, useAdminSort } from "@/components/admin/layout/list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

type PlanSortColumn = "name" | "price" | "duration" | "priority" | "status"
type EntitlementSortColumn = "listing" | "owner" | "plan" | "started" | "expires"

function entitlementStatusBadge(status: DirectoryFeaturedEntitlementStatus) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Active</Badge>
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
  const planSort = useAdminSort<PlanSortColumn>()
  const entitlementSort = useAdminSort<EntitlementSortColumn>()

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
      const result = await getDirectoryFeaturedPlansAction({ data: { siteId: currentSite.id } })
      setLoading(false)
      if (result.error) {
        setError(result.error)
        setPlans([])
        return
      }
      setPlans(result.data)
      return
    }

    const result = await getDirectoryFeaturedEntitlementsAction({ data: { siteId: currentSite.id, status: entitlementStatus } })
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

  const sortedPlans = useMemo(() => {
    const column = planSort.sortColumn
    if (!column) return plans
    const direction = planSort.sortDirection === "asc" ? 1 : -1
    return [...plans].sort((a, b) => {
      if (column === "name") return a.name.localeCompare(b.name) * direction
      if (column === "price") return a.stripe_price_id.localeCompare(b.stripe_price_id) * direction
      if (column === "duration") return (a.duration_days - b.duration_days) * direction
      if (column === "priority") return (a.priority - b.priority) * direction
      return (Number(a.is_active) - Number(b.is_active)) * direction
    })
  }, [plans, planSort.sortColumn, planSort.sortDirection])

  const sortedEntitlements = useMemo(() => {
    const column = entitlementSort.sortColumn
    if (!column) return entitlements
    const direction = entitlementSort.sortDirection === "asc" ? 1 : -1
    return [...entitlements].sort((a, b) => {
      if (column === "listing") return a.directory_title.localeCompare(b.directory_title) * direction
      if (column === "owner") {
        return (a.owner_name || a.owner_email).localeCompare(b.owner_name || b.owner_email) * direction
      }
      if (column === "plan") return a.plan_name.localeCompare(b.plan_name) * direction
      if (column === "started") {
        return (new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()) * direction
      }
      return (new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime()) * direction
    })
  }, [entitlements, entitlementSort.sortColumn, entitlementSort.sortDirection])

  const handleSavePlan = async () => {
    if (!currentSite?.id || !planDraft) return

    setSavingPlan(true)
    setPlanError(null)
    const result = await saveDirectoryFeaturedPlanAction({ data: { input: {
      siteId: currentSite.id,
      planId: planDraft.planId,
      name: planDraft.name,
      description: planDraft.description,
      stripePriceId: planDraft.stripePriceId,
      durationDays: planDraft.durationDays,
      priority: planDraft.priority,
      displayOrder: planDraft.displayOrder,
    } } })
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
    const result = await setDirectoryFeaturedPlanArchivedAction({ data: { input: {
      siteId: currentSite.id,
      planId: plan.id,
      archived: plan.is_active,
    } } })
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
    const result = await revokeDirectoryFeaturedEntitlementAction({ data: { input: {
      siteId: currentSite.id,
      entitlementId: selectedEntitlement.id,
      note: revokeNote,
    } } })
    setRevoking(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSelectedEntitlement(null)
    await loadRows()
  }

  const activeRowsCount = activeView === "plans" ? plans.length : entitlements.length

  function renderPlanSortHeader(column: PlanSortColumn, label: string) {
    return (
      <AdminSortButton
        active={planSort.sortColumn === column}
        direction={planSort.sortDirection}
        onClick={() => planSort.toggleSort(column)}
      >
        {label}
      </AdminSortButton>
    )
  }

  function renderEntitlementSortHeader(column: EntitlementSortColumn, label: string) {
    return (
      <AdminSortButton
        active={entitlementSort.sortColumn === column}
        direction={entitlementSort.sortDirection}
        onClick={() => entitlementSort.toggleSort(column)}
      >
        {label}
      </AdminSortButton>
    )
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[{ label: "Directory", href: "/admin/directory" }, { label: "Monetization" }]} />

          <CardGroup className="grid min-w-0">
            <MonetizationRevenueSummary siteId={currentSite?.id ?? null} siteLoading={siteLoading} />

            <AdminTableShell
              title={activeView === "plans" ? "Featured Plans" : "Featured Listings"}
              icon={activeView === "plans"
                ? <BadgeDollarSign className="size-4 text-muted-foreground sm:size-[18px]" />
                : <Star className="size-4 text-muted-foreground sm:size-[18px]" />
              }
              count={activeRowsCount}
              loading={loading}
              controls={
                <TableRightActions>
                  {activeView === "featured" ? (
                    <Select value={entitlementStatus} onValueChange={(value) => setEntitlementStatus(value as DirectoryFeaturedEntitlementStatus)}>
                      <TableRightActionsSelectTrigger aria-label="Featured listing status filter">
                        <SelectValue />
                      </TableRightActionsSelectTrigger>
                      {/* popper: the item-aligned default detaches from the trigger under browser zoom */}
                      <SelectContent position="popper">
                        {ENTITLEMENT_FILTERS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label} ({entitlementCounts[item.value as DirectoryFeaturedEntitlementStatus] || 0})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Tabs value={activeView} onValueChange={(value) => setActiveView(value as "plans" | "featured")}>
                    <TabsList className="h-8 p-0.5">
                      <TabsTrigger value="plans" className="h-7 px-2.5 text-xs">
                        Plans
                      </TabsTrigger>
                      <TabsTrigger value="featured" className="h-7 px-2.5 text-xs">
                        Featured Listings
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button type="button" size="sm" onClick={() => { setPlanError(null); setPlanDraft(EMPTY_PLAN_DRAFT) }}>
                    <Plus className="mr-1 h-4 w-4" />
                    New Plan
                  </Button>
                </TableRightActions>
              }
              footer={!loading ? <AdminTableSummaryFooter count={activeRowsCount} label={activeView === "plans" ? "plans" : "featured listings"} /> : null}
            >
              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    {activeView === "plans" ? (
                      <TableRow>
                        <TableHead column="main">{renderPlanSortHeader("name", "Plan")}</TableHead>
                        <TableHead column="content">{renderPlanSortHeader("price", "Stripe Price")}</TableHead>
                        <TableHead column="content">{renderPlanSortHeader("duration", "Duration")}</TableHead>
                        <TableHead column="meta">{renderPlanSortHeader("priority", "Priority")}</TableHead>
                        <TableHead column="meta">{renderPlanSortHeader("status", "Status")}</TableHead>
                        <TableHead column="meta">Actions</TableHead>
                      </TableRow>
                    ) : (
                      <TableRow>
                        <TableHead column="main">{renderEntitlementSortHeader("listing", "Listing")}</TableHead>
                        <TableHead column="content">{renderEntitlementSortHeader("owner", "Owner")}</TableHead>
                        <TableHead column="content">{renderEntitlementSortHeader("plan", "Plan")}</TableHead>
                        <TableHead column="meta">{renderEntitlementSortHeader("started", "Started")}</TableHead>
                        <TableHead column="meta">{renderEntitlementSortHeader("expires", "Expires")}</TableHead>
                        <TableHead column="meta">Actions</TableHead>
                      </TableRow>
                    )}
                  </TableHeader>
                  <TableBody>
                    {loading && activeRowsCount === 0 ? (
                      <AdminListPending />
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
                      sortedPlans.map((plan) => (
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
                              ? <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Active</Badge>
                              : <Badge variant="secondary">Archived</Badge>
                            }
                          </TableCell>
                          <TableCell column="meta">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => { setPlanError(null); setPlanDraft(planToDraft(plan)) }}
                                title="Plan settings"
                              >
                                <Settings className="h-4 w-4" />
                                <span className="sr-only">Plan settings</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleArchivePlan(plan)}
                                disabled={archivingPlanId === plan.id}
                                title={plan.is_active ? "Archive plan" : "Restore plan"}
                              >
                                {plan.is_active ? <Trash2 className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                                <span className="sr-only">{plan.is_active ? "Archive plan" : "Restore plan"}</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      sortedEntitlements.map((entitlement) => (
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
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => setSelectedEntitlement(entitlement)}
                                  title="Revoke placement"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Revoke placement</span>
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
          </CardGroup>
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
