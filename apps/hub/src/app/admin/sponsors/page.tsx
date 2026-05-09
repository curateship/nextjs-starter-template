"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { SponsorFormModal } from "@/components/admin/sponsors/SponsorFormModal"
import {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminListSkeleton,
  AdminSortButton,
  useAdminBulkSelection,
  useAdminSort
} from "@/components/admin/layout/list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardTableHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  deleteSponsorAction,
  deleteSponsorsAction,
  getSiteSponsorsAction,
  type Sponsor
} from "@/lib/actions/sponsors/sponsor-actions"
import { cn } from "@/lib/utils/tailwind"
import { sanitizeUrl } from "@/lib/utils/url-validator"
import { CheckCircle2, CircleOff, ExternalLink, Handshake, List, Pencil, Plus, Trash2 } from "lucide-react"

type SponsorFilter = "all" | "active" | "inactive"
type SortColumn = "title" | "status" | "url" | "modified"

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value))
}

export default function SponsorsPage() {
  const { currentSite } = useSiteSwitcher()
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filter, setFilter] = useState<SponsorFilter>("all")
  const [formOpen, setFormOpen] = useState(false)
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null)
  const [deleteSponsor, setDeleteSponsor] = useState<Sponsor | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const sponsorSelection = useAdminBulkSelection()
  const sponsorSort = useAdminSort<SortColumn>("modified", "desc")

  useEffect(() => {
    let cancelled = false

    async function loadSponsors() {
      if (!currentSite?.id) {
        setSponsors([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      const { data, error: loadError } = await getSiteSponsorsAction(currentSite.id)

      if (cancelled) return

      if (loadError) {
        setError(loadError)
        setSponsors([])
      } else {
        setSponsors(data || [])
      }
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
          search={{
            value: searchQuery,
            onValueChange: setSearchQuery,
            placeholder: "Search sponsors"
          }}
          filterMenu={{
            value: filter,
            onValueChange: (value) => {
              setFilter(value as SponsorFilter)
              sponsorSelection.clearSelection()
            },
            items: [
              { value: "all", label: "All", icon: List, count: counts.all },
              {
                value: "active",
                label: "Active",
                icon: CheckCircle2,
                count: counts.active
              },
              {
                value: "inactive",
                label: "Inactive",
                icon: CircleOff,
                count: counts.inactive
              }
            ]
          }}
          preActions={
            <AdminBulkDeleteButton
              deleting={massDeleting}
              onClick={() => setMassDeleteConfirmOpen(true)}
              selectedCount={sponsorSelection.selectedCount}
            />
          }
          actions={
            <Button onClick={openCreate} disabled={!currentSite?.id}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Create Sponsor</span>
            </Button>
          }
        />

        <Card>
          <CardTableHeader className="grid-cols-6">
            <div className="col-span-2 flex items-center space-x-4 pl-[3px]">
              <Checkbox
                checked={sponsorSelection.isPageSelected(filteredSponsors.map((sponsor) => sponsor.id))}
                onCheckedChange={() => sponsorSelection.togglePage(filteredSponsors.map((sponsor) => sponsor.id))}
                aria-label="Select all sponsors"
              />
              <AdminSortButton
                active={sponsorSort.sortColumn === "title"}
                direction={sponsorSort.sortDirection}
                onClick={() => sponsorSort.toggleSort("title")}
              >
                Sponsor
              </AdminSortButton>
            </div>
            <AdminSortButton
              active={sponsorSort.sortColumn === "status"}
              direction={sponsorSort.sortDirection}
              onClick={() => sponsorSort.toggleSort("status")}
            >
              Status
            </AdminSortButton>
            <AdminSortButton
              active={sponsorSort.sortColumn === "url"}
              direction={sponsorSort.sortDirection}
              onClick={() => sponsorSort.toggleSort("url")}
            >
              URL
            </AdminSortButton>
            <AdminSortButton
              active={sponsorSort.sortColumn === "modified"}
              direction={sponsorSort.sortDirection}
              onClick={() => sponsorSort.toggleSort("modified")}
            >
              Modified
            </AdminSortButton>
            <div>Actions</div>
          </CardTableHeader>

          <div className="divide-y divide-muted/80">
            {loading ? (
              <AdminListSkeleton firstColumnClassName="pl-[3px]" />
            ) : error ? (
              <div className="p-8 text-center">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            ) : filteredSponsors.length === 0 ? (
              <div className="p-10 text-center">
                <Handshake className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-sm text-muted-foreground">
                  {sponsors.length === 0 ? "No sponsors yet." : "No sponsors match your filters."}
                </p>
                <Button onClick={openCreate} variant="outline" className="mt-4" disabled={!currentSite?.id}>
                  Create Sponsor
                </Button>
              </div>
            ) : (
              sortedSponsors.map((sponsor) => {
                const imageSrc = sanitizeUrl(sponsor.image_url, "")
                const sponsorHref = sanitizeUrl(sponsor.url, "#")

                return (
                  <div
                    key={sponsor.id}
                    className={cn(
                      "p-6 transition-colors",
                      sponsorSelection.selectedIds.has(sponsor.id) && "bg-accent/50"
                    )}
                  >
                    <div className="grid grid-cols-6 items-center gap-4">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4 pl-[3px]">
                          <Checkbox
                            checked={sponsorSelection.selectedIds.has(sponsor.id)}
                            onCheckedChange={() => sponsorSelection.toggleOne(sponsor.id)}
                            aria-label={`Select ${sponsor.title}`}
                          />
                          <div className="flex items-center space-x-4">
                            <div className="ml-2 flex h-12 w-12 items-center justify-center overflow-hidden rounded bg-muted">
                              {imageSrc ? (
                                <img src={imageSrc} alt={sponsor.title} className="h-full w-full object-contain" />
                              ) : (
                                <Handshake className="h-6 w-6 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-medium">{sponsor.title}</h4>
                              {sponsor.description && (
                                <p className="max-w-sm truncate text-sm text-muted-foreground">{sponsor.description}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <Badge
                          className={cn(
                            sponsor.is_active ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {sponsor.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div>
                        <a
                          href={sponsorHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-64 items-center gap-1 truncate text-sm text-muted-foreground hover:text-foreground"
                        >
                          <span className="truncate">{sponsor.url}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">{formatDate(sponsor.updated_at)}</span>
                      </div>
                      <div>
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
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                            onClick={() => setDeleteSponsor(sponsor)}
                            title="Delete sponsor"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete sponsor</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Card>
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

      <AdminConfirmDialog
        open={Boolean(deleteSponsor)}
        title="Delete Sponsor"
        description="This removes the sponsor from the library. Existing post embeds for this sponsor will render nothing."
        disabled={deleting}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        onCancel={() => setDeleteSponsor(null)}
        onConfirm={handleConfirmDelete}
      />

      <AdminConfirmDialog
        open={massDeleteConfirmOpen}
        title={`Delete ${sponsorSelection.selectedCount} Sponsor${sponsorSelection.selectedCount === 1 ? "" : "s"}`}
        description="This removes the selected sponsors from the library. Existing post embeds for these sponsors will render nothing."
        disabled={massDeleting}
        confirmLabel={massDeleting ? "Deleting..." : "Delete"}
        onCancel={() => setMassDeleteConfirmOpen(false)}
        onConfirm={handleConfirmMassDelete}
      />
    </>
  )
}
