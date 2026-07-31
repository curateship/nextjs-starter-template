"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useResetPageOnListChange } from "@/lib/use-reset-page"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { SponsorFormModal } from "@/components/admin/sponsors/SponsorFormModal"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import {
  AdminBulkDeleteButton,
  ConfirmDestructive,
  AdminSortButton,
  AdminTableShell, AdminListPending,
  AdminListFooter,
  formatShortDate as formatDate,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import {
  deleteSponsorAction,
  deleteSponsorsAction,
  getSiteSponsorsAction,
  type Sponsor
} from "@/lib/actions/sponsors/sponsor-actions"
import {
  getSponsorReportLinksAction,
  type SponsorReportLinkStatus
} from "@/lib/actions/sponsors/sponsor-portal-actions"
import { SponsorReportLinkCell } from "@/components/admin/sponsors/SponsorReportLinkCell"
import { cn } from "@/lib/utils/tailwind"
import { showActionSuccess } from "@/lib/utils/admin-action-feedback"
import { sanitizeUrl } from "@/lib/utils/url-validator"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import Handshake from "lucide-react/dist/esm/icons/handshake.js"
import Pencil from "lucide-react/dist/esm/icons/pencil.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"

type SponsorFilter = "all" | "active" | "inactive"
type SortColumn = "title" | "status" | "url" | "modified"

export default function SponsorsPage() {
  const { currentSite, pageSize } = useSiteSwitcher()
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filter, setFilter] = useState<SponsorFilter>("all")
  const [formOpen, setFormOpen] = useState(false)
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null)
  const [reportLinks, setReportLinks] = useState<Record<string, SponsorReportLinkStatus>>({})
  const [deleteSponsor, setDeleteSponsor] = useState<Sponsor | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const sponsorSelection = useAdminBulkSelection()
  const sponsorSort = useAdminSort<SortColumn>("modified", "desc")
  // Everything that changes what the table shows, minus the page itself.
  const listQueryKey = `${currentSite?.id}|${searchQuery}|${filter}|${sponsorSort.sortColumn}|${sponsorSort.sortDirection}`
  // Searching or filtering from a later page would otherwise land you past the
  // end of the shorter result.
  useResetPageOnListChange(setCurrentPage, listQueryKey)
  // Ticks never survive a change to what the table is showing — the page and
  // rows-per-page included, so "Delete (n)" only ever means rows on screen.
  useClearSelectionOnListChange(sponsorSelection, `${listQueryKey}|${currentPage}|${pageSize}`)


  useEffect(() => {
    let cancelled = false

    async function loadSponsors() {
      if (!currentSite?.id) {
        setSponsors([])
        setReportLinks({})
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      const [{ data, error: loadError }, linksResult] = await Promise.all([
        getSiteSponsorsAction(currentSite.id),
        getSponsorReportLinksAction({ data: { siteId: currentSite.id } })
      ])

      if (cancelled) return

      if (loadError) {
        setError(loadError)
        setSponsors([])
      } else {
        setSponsors(data || [])
      }
      setReportLinks(linksResult.data || {})
      setLoading(false)
    }

    loadSponsors()

    return () => {
      cancelled = true
    }
  }, [currentSite?.id])

  const filteredSponsors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return sponsors.filter((sponsor) => {
      if (filter === "active" && !sponsor.is_active) return false
      if (filter === "inactive" && sponsor.is_active) return false

      if (!query) return true

      const searchText = `${sponsor.title} ${sponsor.description || ""} ${sponsor.url}`.toLowerCase()
      return searchText.includes(query)
    })
  }, [filter, searchQuery, sponsors])

  const sortedSponsors = useMemo(() => {
    return [...filteredSponsors].sort((a, b) => {
      if (!sponsorSort.sortColumn) return 0

      const dir = sponsorSort.sortDirection === "asc" ? 1 : -1
      if (sponsorSort.sortColumn === "title") return a.title.localeCompare(b.title) * dir
      if (sponsorSort.sortColumn === "status") return (Number(a.is_active) - Number(b.is_active)) * dir
      if (sponsorSort.sortColumn === "url") return a.url.localeCompare(b.url) * dir
      if (sponsorSort.sortColumn === "modified")
        return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir

      return 0
    })
  }, [filteredSponsors, sponsorSort.sortColumn, sponsorSort.sortDirection])

  const pagedSponsors = useMemo(
    () => sortedSponsors.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, sortedSponsors]
  )

  // Select-all ticks the page in front of you, never the whole filtered list.
  const visibleSponsorIds = pagedSponsors.map((sponsor) => sponsor.id)

  const counts = {
    all: sponsors.length,
    active: sponsors.filter((sponsor) => sponsor.is_active).length,
    inactive: sponsors.filter((sponsor) => !sponsor.is_active).length
  }

  const handleSaved = (savedSponsor: Sponsor) => {
    setSponsors((current) => {
      const exists = current.some((sponsor) => sponsor.id === savedSponsor.id)
      if (exists) return current.map((sponsor) => (sponsor.id === savedSponsor.id ? savedSponsor : sponsor))
      return [savedSponsor, ...current]
    })
  }

  const handleConfirmDelete = async () => {
    if (!deleteSponsor) return

    setDeleting(true)
    const result = await deleteSponsorAction(deleteSponsor.id)
    setDeleting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSponsors((current) => current.filter((sponsor) => sponsor.id !== deleteSponsor.id))
    sponsorSelection.remove(deleteSponsor.id)
    setDeleteSponsor(null)
    showActionSuccess("Sponsor deleted.")
  }

  const handleConfirmMassDelete = async () => {
    const ids = Array.from(sponsorSelection.selectedIds)
    if (ids.length === 0) return
    const idsToDelete = new Set(ids)

    setMassDeleting(true)
    const result = await deleteSponsorsAction(ids)
    setMassDeleting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSponsors((current) => current.filter((sponsor) => !idsToDelete.has(sponsor.id)))
    sponsorSelection.clearSelection()
    setMassDeleteConfirmOpen(false)
    showActionSuccess(ids.length === 1 ? "Sponsor deleted." : "Sponsors deleted.")
  }

  const openCreate = () => {
    setEditingSponsor(null)
    setFormOpen(true)
  }

  const openEdit = (sponsor: Sponsor) => {
    setEditingSponsor(sponsor)
    setFormOpen(true)
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <DashboardSubheader
          items={[{ label: "Sponsors" }]}
        />

        <AdminTableShell
          title="Sponsors"
          icon={<Handshake className="text-muted-foreground" />}
          count={filteredSponsors.length}
          loading={loading}
          selectedCount={sponsorSelection.selectedCount}
          onClearSelection={sponsorSelection.clearSelection}
          titleActions={
            <AdminBulkDeleteButton
              deleting={massDeleting}
              onClick={() => setMassDeleteConfirmOpen(true)}
              selectedCount={sponsorSelection.selectedCount}
            />
          }
          controls={
            <TableRightActions>
              <TableRightActionsSearch
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search sponsors"
              />
              <Select
                value={filter}
                onValueChange={(value) => {
                  setFilter(value as SponsorFilter)
                }}
              >
                <TableRightActionsSelectTrigger aria-label="Sponsor status filter">
                  <SelectValue />
                </TableRightActionsSelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ({counts.all})</SelectItem>
                  <SelectItem value="active">Active ({counts.active})</SelectItem>
                  <SelectItem value="inactive">Inactive ({counts.inactive})</SelectItem>
                </SelectContent>
              </Select>
              <TableRightActionsButton onClick={openCreate} disabled={!currentSite?.id}>
                <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Create Sponsor</span>
            </TableRightActionsButton>
            </TableRightActions>
          }
          footer={!loading ? <AdminListFooter currentPage={currentPage} pageSize={pageSize} total={filteredSponsors.length} onPageChange={setCurrentPage} /> : null}
        >

          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead column="select">
                    <Checkbox
                      checked={sponsorSelection.isPageSelected(visibleSponsorIds)}
                      onCheckedChange={() => sponsorSelection.togglePage(visibleSponsorIds)}
                      aria-label="Select all sponsors"
                    />
                  </TableHead>
                  <TableHead column="main">
                    <AdminSortButton
                      active={sponsorSort.sortColumn === "title"}
                      direction={sponsorSort.sortDirection}
                      onClick={() => sponsorSort.toggleSort("title")}
                    >
                      Sponsor
                    </AdminSortButton>
                  </TableHead>
                  <TableHead column="meta">
                    <AdminSortButton
                      active={sponsorSort.sortColumn === "status"}
                      direction={sponsorSort.sortDirection}
                      onClick={() => sponsorSort.toggleSort("status")}
                    >
                      Status
                    </AdminSortButton>
                  </TableHead>
                  <TableHead column="content">
                    <AdminSortButton
                      active={sponsorSort.sortColumn === "url"}
                      direction={sponsorSort.sortDirection}
                      onClick={() => sponsorSort.toggleSort("url")}
                    >
                      URL
                    </AdminSortButton>
                  </TableHead>
                  <TableHead column="meta">Report Link</TableHead>
                  <TableHead column="meta">
                    <AdminSortButton
                      active={sponsorSort.sortColumn === "modified"}
                      direction={sponsorSort.sortDirection}
                      onClick={() => sponsorSort.toggleSort("modified")}
                    >
                      Modified
                    </AdminSortButton>
                  </TableHead>
                  <TableHead column="meta">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && sortedSponsors.length === 0 ? (
                  <AdminListPending />
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <p className="text-sm text-destructive">{error}</p>
                    </TableCell>
                  </TableRow>
                ) : filteredSponsors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Handshake className="mx-auto h-10 w-10 text-muted-foreground" />
                      <p className="mt-4 text-sm text-muted-foreground">
                        {searchQuery.trim() || filter !== "all" ? "No sponsors found matching your search." : "No sponsors yet."}
                      </p>
                      <Button onClick={openCreate} variant="outline" className="mt-4" disabled={!currentSite?.id}>
                        Create Sponsor
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedSponsors.map((sponsor) => {
                    const imageSrc = sanitizeUrl(sponsor.image_url, "")
                    const sponsorHref = sanitizeUrl(sponsor.url, "#")

                    return (
                      <TableRow
                        key={sponsor.id}
                        data-state={sponsorSelection.selectedIds.has(sponsor.id) ? "selected" : undefined}
                        className="group"
                      >
                        <TableCell column="select">
                          <Checkbox
                            checked={sponsorSelection.selectedIds.has(sponsor.id)}
                            onCheckedChange={() => sponsorSelection.toggleOne(sponsor.id)}
                            aria-label={`Select ${sponsor.title}`}
                          />
                        </TableCell>
                        <TableCell column="main">
                          <div className="flex min-w-0 items-center space-x-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                              {imageSrc ? (
                                <img src={imageSrc} alt={sponsor.title} className="h-full w-full object-contain" />
                              ) : (
                                <Handshake className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-medium sm:text-base" title={sponsor.title}>{sponsor.title}</h4>
                              {sponsor.description && (
                                <p className="truncate text-xs text-muted-foreground sm:text-sm" title={sponsor.description}>{sponsor.description}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell column="meta">
                          <Badge
                            className={cn(
                              sponsor.is_active ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300" : "bg-muted text-muted-foreground"
                            )}
                          >
                            {sponsor.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell column="content">
                          <a
                            href={sponsorHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-64 items-center gap-1 truncate text-sm text-muted-foreground hover:text-foreground"
                          >
                            <span className="truncate" title={sponsor.url}>{sponsor.url}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          </a>
                        </TableCell>
                        <TableCell column="meta">
                          <SponsorReportLinkCell
                            sponsorId={sponsor.id}
                            link={reportLinks[sponsor.id] ?? null}
                            onLinkChange={(sponsorId, link) => {
                              setReportLinks((current) => {
                                const next = { ...current }
                                if (link) next[sponsorId] = link
                                else delete next[sponsorId]
                                return next
                              })
                            }}
                          />
                        </TableCell>
                        <TableCell column="mutedMeta">{formatDate(sponsor.updated_at)}</TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openEdit(sponsor)}
                              title="Edit sponsor"
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Edit sponsor</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-foreground hover:text-foreground"
                              onClick={() => setDeleteSponsor(sponsor)}
                              title="Delete sponsor"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete sponsor</span>
                            </Button>
                          </div>
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
      </AdminLayout>

      {currentSite?.id && (
        <SponsorFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          siteId={currentSite.id}
          sponsor={editingSponsor}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDestructive
        action="delete-sponsor"
        open={Boolean(deleteSponsor)}
        title="Delete Sponsor"
        description="This removes the sponsor from the library. Existing post embeds for this sponsor will render nothing."
        disabled={deleting}
        error={error}
        impactRequest={deleteSponsor && currentSite?.id
          ? { ids: [deleteSponsor.id], siteId: currentSite.id, target: "sponsor" }
          : undefined}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        onCancel={() => { setDeleteSponsor(null); setError(null) }}
        onConfirm={handleConfirmDelete}
      />

      <ConfirmDestructive
        action="delete-sponsor"
        open={massDeleteConfirmOpen}
        title={`Delete ${sponsorSelection.selectedCount} Sponsor${sponsorSelection.selectedCount === 1 ? "" : "s"}`}
        description="This removes the selected sponsors from the library. Existing post embeds for these sponsors will render nothing."
        disabled={massDeleting}
        error={error}
        impactRequest={currentSite?.id
          ? { ids: Array.from(sponsorSelection.selectedIds), siteId: currentSite.id, target: "sponsor" }
          : undefined}
        confirmLabel={massDeleting ? "Deleting..." : "Delete"}
        onCancel={() => { setMassDeleteConfirmOpen(false); setError(null) }}
        onConfirm={handleConfirmMassDelete}
      />
    </>
  )
}
