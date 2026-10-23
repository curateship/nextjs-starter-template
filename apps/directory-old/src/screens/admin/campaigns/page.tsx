"use client"

import { useEffect, useMemo, useState } from "react"
import Megaphone from "lucide-react/dist/esm/icons/megaphone.js"
import Pencil from "lucide-react/dist/esm/icons/pencil.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Power from "lucide-react/dist/esm/icons/power.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"

import { CampaignEditorDialog } from "@/components/admin/campaigns/CampaignEditorDialog"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { AdminListPending, ConfirmDestructive, AdminSortButton, AdminTableShell, AdminListFooter, formatShortDate, useAdminSort } from "@/components/admin/layout/list"
import { TableRightActions, TableRightActionsButton, TableRightActionsSearch } from "@/components/admin/layout/content/table-right-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { deleteCampaignAction, getSiteCampaignsAction, setCampaignStatusAction } from "@/lib/actions/campaigns/campaign-actions"
import { compareCampaignRecords, type CampaignRecord, type CampaignSortColumn } from "@/lib/campaigns/campaigns"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
import { showActionError, showActionSuccess } from "@/lib/utils/admin-action-feedback"

function formatSchedule(campaign: CampaignRecord) {
  if (!campaign.startsAt && !campaign.endsAt) return "Always"
  const start = campaign.startsAt ? formatShortDate(campaign.startsAt) : "Now"
  const end = campaign.endsAt ? formatShortDate(campaign.endsAt) : "No end"
  return `${start} – ${end}`
}

export default function CampaignsPage() {
  const { currentSite, pageSize } = useSiteSwitcher()
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<CampaignRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CampaignRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const campaignSort = useAdminSort<CampaignSortColumn>()

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!currentSite?.id) { setCampaigns([]); setLoading(false); return }
      setLoading(true)
      const result = await getSiteCampaignsAction({ data: { siteId: currentSite.id } })
      if (cancelled) return
      if (result.ok) setCampaigns(result.data)
      else { setCampaigns([]); showActionError(result.message) }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [currentSite?.id])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? campaigns.filter((campaign) => `${campaign.name} ${campaign.type} ${campaign.status}`.toLowerCase().includes(query)) : campaigns
  }, [campaigns, search])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (!campaignSort.sortColumn) return 0
    return compareCampaignRecords(a, b, campaignSort.sortColumn, campaignSort.sortDirection)
  }), [campaignSort.sortColumn, campaignSort.sortDirection, filtered])

  // Searching or re-sorting from page 3 would otherwise leave you on a page the
  // shorter result no longer has.
  useResetPageOnListChange(
    setCurrentPage,
    `${currentSite?.id}|${search}|${campaignSort.sortColumn}|${campaignSort.sortDirection}`
  )

  const pagedCampaigns = useMemo(
    () => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, sorted]
  )

  const onSaved = (saved: CampaignRecord) => {
    setCampaigns((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [saved, ...current])
  }

  const toggleStatus = async (campaign: CampaignRecord) => {
    const result = await setCampaignStatusAction({ data: { campaignId: campaign.id, status: campaign.status === "active" ? "draft" : "active" } })
    if (!result.ok) {
      return showActionError(result.message)
    }
    onSaved(result.data)
    showActionSuccess(result.data.status === "active" ? "Campaign activated." : "Campaign paused.")
  }

  const remove = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deleteCampaignAction({ data: { campaignId: deleteTarget.id } })
    setDeleting(false)
    if (!result.ok) {
      setDeleteError(result.message)
      return showActionError(result.message)
    }
    setCampaigns((current) => current.filter((item) => item.id !== deleteTarget.id))
    setDeleteTarget(null)
    showActionSuccess("Campaign deleted.")
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <DashboardSubheader items={[{ label: "Campaigns" }]} />
        <AdminTableShell
          title="Campaigns"
          icon={<Megaphone className="text-muted-foreground" />}
          count={filtered.length}
          loading={loading}
          controls={<TableRightActions>
            <TableRightActionsSearch value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search campaigns" />
            <TableRightActionsButton onClick={() => { setEditing(null); setEditorOpen(true) }} disabled={!currentSite?.id}><Plus className="size-4" /><span className="hidden sm:inline">New campaign</span></TableRightActionsButton>
          </TableRightActions>}
          footer={!loading ? <AdminListFooter currentPage={currentPage} pageSize={pageSize} total={filtered.length} onPageChange={setCurrentPage} /> : null}
        >
          <ScrollArea className="w-full">
            <Table>
              <TableHeader><TableRow>
                <TableHead column="main"><AdminSortButton active={campaignSort.sortColumn === "name"} direction={campaignSort.sortDirection} onClick={() => campaignSort.toggleSort("name")}>Campaign</AdminSortButton></TableHead>
                <TableHead column="meta"><AdminSortButton active={campaignSort.sortColumn === "type"} direction={campaignSort.sortDirection} onClick={() => campaignSort.toggleSort("type")}>Type</AdminSortButton></TableHead>
                <TableHead column="content"><AdminSortButton active={campaignSort.sortColumn === "pages"} direction={campaignSort.sortDirection} onClick={() => campaignSort.toggleSort("pages")}>Pages</AdminSortButton></TableHead>
                <TableHead column="content"><AdminSortButton active={campaignSort.sortColumn === "schedule"} direction={campaignSort.sortDirection} onClick={() => campaignSort.toggleSort("schedule")}>Schedule</AdminSortButton></TableHead>
                <TableHead column="meta"><AdminSortButton active={campaignSort.sortColumn === "views"} direction={campaignSort.sortDirection} onClick={() => campaignSort.toggleSort("views")}>Views</AdminSortButton></TableHead>
                <TableHead column="meta"><AdminSortButton active={campaignSort.sortColumn === "submissions"} direction={campaignSort.sortDirection} onClick={() => campaignSort.toggleSort("submissions")}>Submits</AdminSortButton></TableHead>
                <TableHead column="meta"><AdminSortButton active={campaignSort.sortColumn === "status"} direction={campaignSort.sortDirection} onClick={() => campaignSort.toggleSort("status")}>Status</AdminSortButton></TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading && sorted.length === 0 ? <AdminListPending /> : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="h-36 text-center"><Megaphone className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{search.trim() ? "No campaigns found matching your search." : "No campaigns yet."}</p></TableCell></TableRow>
                ) : pagedCampaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell column="main"><div><p className="font-medium">{campaign.name}</p><p className="text-xs text-muted-foreground">{campaign.dismissals.toLocaleString()} dismissals</p></div></TableCell>
                    <TableCell column="meta" className="capitalize">{campaign.type === "bar" ? "Bar" : "Popup"}</TableCell>
                    <TableCell column="content" className="capitalize">{campaign.targeting.mode === "all" ? "All pages" : `${campaign.targeting.mode} ${campaign.targeting.paths.length}`}</TableCell>
                    <TableCell column="content">{formatSchedule(campaign)}</TableCell>
                    <TableCell column="meta">{campaign.views.toLocaleString()}</TableCell>
                    <TableCell column="meta">{campaign.submissions.toLocaleString()}</TableCell>
                    <TableCell column="meta"><Badge variant={campaign.status === "active" ? "default" : "secondary"}>{campaign.status}</Badge></TableCell>
                    <TableCell column="meta"><div className="flex gap-1">
                      <Button variant="ghost" size="icon" title={campaign.status === "active" ? "Pause campaign" : "Activate campaign"} onClick={() => toggleStatus(campaign)}><Power className="size-4" /><span className="sr-only">Toggle status</span></Button>
                      <Button variant="ghost" size="icon" title="Edit campaign" onClick={() => { setEditing(campaign); setEditorOpen(true) }}><Pencil className="size-4" /><span className="sr-only">Edit</span></Button>
                      <Button variant="ghost" size="icon" title="Delete campaign" onClick={() => { setDeleteError(null); setDeleteTarget(campaign) }}><Trash2 className="size-4" /><span className="sr-only">Delete</span></Button>
                    </div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </AdminTableShell>
      </AdminLayout>
      {currentSite?.id && <CampaignEditorDialog open={editorOpen} onOpenChange={setEditorOpen} siteId={currentSite.id} campaign={editing} onSaved={onSaved} />}
      <ConfirmDestructive
        action="delete-campaign"
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? "campaign"}?`}
        description="This permanently removes the campaign and its counters."
        disabled={deleting}
        error={deleteError}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onCancel={() => { setDeleteTarget(null); setDeleteError(null) }}
        onConfirm={remove}
      />
    </>
  )
}
