"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Send from "lucide-react/dist/esm/icons/send.js"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import TriangleAlert from "lucide-react/dist/esm/icons/triangle-alert.js"

import {
  getDirectoryClaimOutreachListAction,
  sendDirectoryClaimOutreachAction,
  type ClaimOutreachListItem,
  type ClaimOutreachStatus,
} from "@/lib/actions/directories/directory-claim-outreach-actions"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger,
} from "@/components/admin/layout/content/table-right-actions"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import {
  AdminListPending,
  AdminSortButton,
  AdminTableShell,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import Link from "@/components/app-link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { showActionError, showActionSuccess } from "@/lib/utils/admin-action-feedback"

type SortColumn = "listing" | "email" | "status" | "invited"
type StatusFilter = "all" | ClaimOutreachStatus

// A listing may be invited again only when it has never been invited or its last
// invite is past the cooldown; the rest are shown for context but never re-sent.
const SENDABLE_STATUSES: ClaimOutreachStatus[] = ["not_invited", "invited"]
const STATUS_RANK: Record<ClaimOutreachStatus, number> = {
  not_invited: 0,
  invited: 1,
  recently_invited: 2,
  opted_out: 3,
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "not_invited", label: "Not invited" },
  { value: "invited", label: "Invited" },
  { value: "recently_invited", label: "Invited recently" },
  { value: "opted_out", label: "Opted out" },
]

function isSendable(status: ClaimOutreachStatus) {
  return SENDABLE_STATUSES.includes(status)
}

function statusBadge(item: ClaimOutreachListItem) {
  switch (item.status) {
    case "not_invited":
      return <Badge variant="secondary">Not invited</Badge>
    case "invited":
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">Invited</Badge>
    case "recently_invited":
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Invited recently</Badge>
    case "opted_out":
      return <Badge variant="destructive">Opted out</Badge>
  }
}

export default function DirectoryOutreachPage() {
  const { currentSite, loading: siteLoading } = useSiteSwitcher()
  const [rows, setRows] = useState<ClaimOutreachListItem[]>([])
  const [emailConfigured, setEmailConfigured] = useState(true)
  const [cooldownDays, setCooldownDays] = useState(30)
  const [scannedAtLimit, setScannedAtLimit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sendTargets, setSendTargets] = useState<string[] | null>(null)
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null)

  const selection = useAdminBulkSelection()
  const sort = useAdminSort<SortColumn>("status", "asc")
  // Ticks never survive a change to what the table is showing.
  useClearSelectionOnListChange(
    selection,
    `${currentSite?.id}|${query}|${statusFilter}|${sort.sortColumn}|${sort.sortDirection}`
  )


  const loadRows = useCallback(async () => {
    if (!currentSite?.id) {
      setRows([])
      setLoading(siteLoading)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await getDirectoryClaimOutreachListAction({ data: { siteId: currentSite.id } })
      if (result.error) {
        setError(result.error)
        setRows([])
        return
      }
      setRows(result.data)
      setEmailConfigured(result.email_configured)
      setCooldownDays(result.cooldown_days)
      setScannedAtLimit(result.scanned_at_limit)
    } catch (err) {
      console.error("Failed to load claim outreach list:", err)
      setError("Could not load listings. Please try again.")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [currentSite?.id, siteLoading])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = {
      all: rows.length,
      not_invited: 0,
      invited: 0,
      recently_invited: 0,
      opted_out: 0,
    }
    for (const row of rows) base[row.status] += 1
    return base
  }, [rows])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false
      if (!term) return true
      return row.title.toLowerCase().includes(term) || row.contact_email.toLowerCase().includes(term)
    })
  }, [query, rows, statusFilter])

  const sorted = useMemo(() => {
    const dir = sort.sortDirection === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.sortColumn === "listing") return a.title.localeCompare(b.title) * dir
      if (sort.sortColumn === "email") return a.contact_email.localeCompare(b.contact_email) * dir
      if (sort.sortColumn === "invited") {
        const at = a.last_invited_at ? new Date(a.last_invited_at).getTime() : 0
        const bt = b.last_invited_at ? new Date(b.last_invited_at).getTime() : 0
        return (at - bt) * dir
      }
      // status, with a stable title tiebreak
      const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status]
      return (rank !== 0 ? rank : a.title.localeCompare(b.title)) * dir
    })
  }, [filtered, sort.sortColumn, sort.sortDirection])

  const visibleIds = sorted.map((row) => row.directory_id)

  const targetRows = useMemo(() => {
    if (!sendTargets) return []
    const targetSet = new Set(sendTargets)
    return rows.filter((row) => targetSet.has(row.directory_id))
  }, [rows, sendTargets])
  const eligibleRows = targetRows.filter((row) => isSendable(row.status))
  const skippedCount = targetRows.length - eligibleRows.length
  const previewName = eligibleRows[0]?.title || "Your business"
  const siteName = currentSite?.name || "the directory"

  const handleSend = async () => {
    if (!currentSite?.id || !sendTargets) return

    setSending(true)
    try {
      const result = await sendDirectoryClaimOutreachAction({ data: { input: {
        siteId: currentSite.id,
        directoryIds: sendTargets,
      } } })

      if (result.error) {
        showActionError(result.error)
        return
      }

      setSendTargets(null)

      const parts = [`Sent ${result.sent}`]
      if (result.skipped) parts.push(`skipped ${result.skipped}`)
      if (result.failed) parts.push(`failed ${result.failed}`)
      const summary = parts.join(" · ")
      setSendStatus({ tone: result.failed ? "error" : "success", text: summary })
      if (result.failed) showActionError(summary)
      else showActionSuccess(summary)

      await loadRows()
    } catch (err) {
      console.error("Failed to send claim invitations:", err)
      showActionError("Could not send invitations. Please try again.")
    } finally {
      setSending(false)
    }
  }

  const shellStatus = !emailConfigured
    ? { tone: "error" as const, text: `Connect a Resend email integration to send invitations.` }
    : sendStatus

  const selectedSendable = sorted.filter(
    (row) => selection.selectedIds.has(row.directory_id) && isSendable(row.status),
  ).length

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[{ label: "Directory", href: "/admin/directory" }, { label: "Outreach" }]} />

          <AdminTableShell
            error={error ? { message: error, onRetry: loadRows } : null}
            title="Claim Outreach"
            icon={<Send className="text-muted-foreground" />}
            count={filtered.length}
            loading={loading}
            status={shellStatus}
            selectedCount={selection.selectedCount}
            onClearSelection={selection.clearSelection}
            titleActions={selection.selectedCount ? (
              <TableRightActionsButton
                type="button"
                onClick={() => setSendTargets(Array.from(selection.selectedIds))}
                disabled={!emailConfigured}
              >
                <Send className="size-4" />
                Send invitations ({selection.selectedCount})
              </TableRightActionsButton>
            ) : null}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                  }}
                  placeholder="Search listing or email"
                />
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value as StatusFilter)
                  }}
                >
                  <TableRightActionsSelectTrigger aria-label="Outreach status filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label} ({counts[item.value]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableRightActions>
            }
            footer={!loading ? (
              <div className="bg-muted/50 p-4 text-xs text-muted-foreground sm:text-sm">
                {filtered.length} {filtered.length === 1 ? "listing" : "listings"}
                {scannedAtLimit ? " · showing the 1,000 most recent unclaimed listings" : ""}
              </div>
            ) : null}
          >
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="select">
                      <Checkbox
                        checked={selection.isPageSelected(visibleIds)}
                        onCheckedChange={() => selection.togglePage(visibleIds)}
                        aria-label="Select listings"
                      />
                    </TableHead>
                    <TableHead column="main">
                      <AdminSortButton
                        active={sort.sortColumn === "listing"}
                        direction={sort.sortDirection}
                        onClick={() => sort.toggleSort("listing")}
                      >
                        Listing
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="content">
                      <AdminSortButton
                        active={sort.sortColumn === "email"}
                        direction={sort.sortDirection}
                        onClick={() => sort.toggleSort("email")}
                      >
                        Contact email
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={sort.sortColumn === "status"}
                        direction={sort.sortDirection}
                        onClick={() => sort.toggleSort("status")}
                      >
                        Status
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={sort.sortColumn === "invited"}
                        direction={sort.sortDirection}
                        onClick={() => sort.toggleSort("invited")}
                      >
                        Last invited
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && sorted.length === 0 ? (
                    <AdminListPending />
                  ) : sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <Send className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          No unclaimed listings with a contact email{statusFilter !== "all" || query ? " match this view" : " to invite"}.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map((row) => {
                      const sendable = isSendable(row.status)
                      const reason = row.status === "opted_out"
                        ? "This contact opted out of claim emails."
                        : row.status === "recently_invited"
                          ? `Invited within the last ${cooldownDays} days.`
                          : undefined
                      return (
                        <TableRow key={row.directory_id} data-state={selection.selectedIds.has(row.directory_id) ? "selected" : undefined}>
                          <TableCell column="select">
                            <Checkbox
                              checked={selection.selectedIds.has(row.directory_id)}
                              onCheckedChange={() => selection.toggleOne(row.directory_id)}
                              aria-label={`Select ${row.title}`}
                            />
                          </TableCell>
                          <TableCell column="main">
                            <Link
                              href={`/directory/${row.slug}`}
                              className="flex min-w-0 items-center gap-1.5 font-medium hover:underline"
                            >
                              <span className="truncate" title={row.title}>{row.title}</span>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            </Link>
                          </TableCell>
                          <TableCell column="content">
                            <div className="truncate text-sm" title={row.contact_email}>{row.contact_email}</div>
                          </TableCell>
                          <TableCell column="meta">
                            <div className="flex flex-col items-start gap-1">
                              {statusBadge(row)}
                              {row.last_send_failed ? (
                                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                                  <TriangleAlert className="h-3 w-3" />
                                  Last send failed
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell column="mutedMeta">
                            {row.last_invited_at ? (
                              <div>
                                <div className="text-sm">{formatDate(row.last_invited_at)}</div>
                                {row.times_invited > 1 ? (
                                  <div className="text-xs text-muted-foreground">{row.times_invited}× invited</div>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell column="meta">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSendTargets([row.directory_id])}
                              disabled={!sendable || !emailConfigured}
                              title={!emailConfigured ? "Connect a Resend email integration first." : reason}
                            >
                              <Send className="mr-2 h-4 w-4" />
                              {row.status === "not_invited" ? "Invite" : "Re-invite"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>
        </div>
      </AdminLayout>

      <Dialog open={sendTargets !== null} onOpenChange={(open) => !open && !sending && setSendTargets(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send claim invitations</DialogTitle>
            <DialogDescription>
              Each business gets one email inviting them to claim their listing, with a link that opens the claim form.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm">
              {eligibleRows.length > 0 ? (
                <p>
                  <strong>{eligibleRows.length}</strong> {eligibleRows.length === 1 ? "listing" : "listings"} will be emailed.
                </p>
              ) : (
                <p className="text-muted-foreground">None of the selected listings can be invited right now.</p>
              )}
              {skippedCount > 0 ? (
                <p className="mt-1 text-muted-foreground">
                  {skippedCount} skipped — already claimed, opted out, or invited in the last {cooldownDays} days.
                </p>
              ) : null}
            </div>

            {/* Preview mirrors the sent email so the admin sees what recipients get. */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Preview</div>
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <div className="mb-3 text-xs text-muted-foreground">
                  Subject: Claim {previewName} on {siteName}
                </div>
                <p className="mb-2">
                  <strong>{previewName}</strong> is listed on {siteName}, but no one has claimed it yet.
                </p>
                <p className="mb-3 text-muted-foreground">
                  Claiming the listing lets you keep its details accurate and unlock owner tools.
                </p>
                <span className="inline-block rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background">
                  Claim {previewName}
                </span>
                <p className="mt-3 text-xs text-muted-foreground">
                  Includes a one-click “don’t email me about this listing” link.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendTargets(null)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending || eligibleRows.length === 0}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send {eligibleRows.length > 0 ? eligibleRows.length : ""} {eligibleRows.length === 1 ? "invitation" : "invitations"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
