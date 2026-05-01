"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { SponsorFormModal } from "@/components/admin/sponsors/SponsorFormModal"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { deleteSponsorAction, deleteSponsorsAction, getSiteSponsorsAction, type Sponsor } from "@/lib/actions/sponsors/sponsor-actions"
import { cn } from "@/lib/utils/tailwind"
import { sanitizeUrl } from "@/lib/utils/url-validator"
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronsUpDown,
  CircleOff,
  ExternalLink,
  Handshake,
  List,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"

type SponsorFilter = "all" | "active" | "inactive"
type SortColumn = "title" | "status" | "url" | "modified"

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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
  const [selectedSponsorIds, setSelectedSponsorIds] = useState<Set<string>>(new Set())
  const [massDeleteConfirmOpen, setMassDeleteConfirmOpen] = useState(false)
  const [massDeleting, setMassDeleting] = useState(false)
  const [sortColumn, setSortColumn] = useState<SortColumn | null>("modified")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

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
      if (!sortColumn) return 0

      const dir = sortDirection === "asc" ? 1 : -1
      if (sortColumn === "title") return a.title.localeCompare(b.title) * dir
      if (sortColumn === "status") return (Number(a.is_active) - Number(b.is_active)) * dir
      if (sortColumn === "url") return a.url.localeCompare(b.url) * dir
      if (sortColumn === "modified") return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir

      return 0
    })
  }, [filteredSponsors, sortColumn, sortDirection])

  const counts = {
    all: sponsors.length,
    active: sponsors.filter((sponsor) => sponsor.is_active).length,
    inactive: sponsors.filter((sponsor) => !sponsor.is_active).length,
  }

  const handleSaved = (savedSponsor: Sponsor) => {
    setSponsors((current) => {
      const exists = current.some((sponsor) => sponsor.id === savedSponsor.id)
      if (exists) return current.map((sponsor) => sponsor.id === savedSponsor.id ? savedSponsor : sponsor)
      return [savedSponsor, ...current]
    })
  }

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "desc") {
        setSortColumn(null)
        setSortDirection("asc")
      } else {
        setSortDirection("desc")
      }
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === "asc") return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const toggleSelectSponsor = (sponsorId: string) => {
    setSelectedSponsorIds((current) => {
      const next = new Set(current)
      if (next.has(sponsorId)) {
        next.delete(sponsorId)
      } else {
        next.add(sponsorId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedSponsorIds.size === filteredSponsors.length) {
      setSelectedSponsorIds(new Set())
    } else {
      setSelectedSponsorIds(new Set(filteredSponsors.map((sponsor) => sponsor.id)))
    }
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
    setSelectedSponsorIds((current) => {
      const next = new Set(current)
      next.delete(deleteSponsor.id)
      return next
    })
    setDeleteSponsor(null)
  }

  const handleConfirmMassDelete = async () => {
    const ids = Array.from(selectedSponsorIds)
    if (ids.length === 0) return

    setMassDeleting(true)
    const result = await deleteSponsorsAction(ids)
    setMassDeleting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSponsors((current) => current.filter((sponsor) => !selectedSponsorIds.has(sponsor.id)))
    setSelectedSponsorIds(new Set())
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
            placeholder: "Search sponsors",
          }}
          filterMenu={{
            value: filter,
            onValueChange: (value) => {
              setFilter(value as SponsorFilter)
              setSelectedSponsorIds(new Set())
            },
            items: [
              { value: "all", label: "All", icon: List, count: counts.all },
              { value: "active", label: "Active", icon: CheckCircle2, count: counts.active },
              { value: "inactive", label: "Inactive", icon: CircleOff, count: counts.inactive },
            ],
          }}
          preActions={
            selectedSponsorIds.size > 0 ? (
              <Button
                variant="destructive"
                onClick={() => setMassDeleteConfirmOpen(true)}
                disabled={massDeleting}
              >
                {massDeleting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                    <span className="hidden sm:inline">Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Delete ({selectedSponsorIds.size})</span>
                  </>
                )}
              </Button>
            ) : undefined
          }
          actions={
            <Button onClick={openCreate} disabled={!currentSite?.id}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Create Sponsor</span>
            </Button>
          }
        />

        <Card className="shadow-sm">
            <div className="border-b bg-muted/30 px-6 py-4">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center space-x-4 pl-[3px]">
                  <Checkbox
                    checked={filteredSponsors.length > 0 && selectedSponsorIds.size === filteredSponsors.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all sponsors"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSort("title")}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 outline-none transition-colors",
                      "text-[0.8125rem] text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span>Sponsor</span>
                    <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("title")}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSort("status")}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 outline-none transition-colors",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span>Status</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("status")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort("url")}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 outline-none transition-colors",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span>URL</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("url")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort("modified")}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 outline-none transition-colors",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span>Modified</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon("modified")}</span>
                </button>
                <div>Actions</div>
              </div>
            </div>

            <div className="divide-y divide-muted/80">
              {loading ? (
                <div className="space-y-0">
                  {[1, 2, 3, 4, 5].map((item) => (
                    <div key={item} className="border-b border-muted/80 p-6">
                      <div className="grid grid-cols-6 items-center gap-4">
                        <div className="col-span-2">
                          <div className="flex items-center space-x-4 pl-[3px]">
                            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                            <div className="ml-2 h-12 w-12 animate-pulse rounded bg-muted" />
                            <div>
                              <div className="mb-2 h-4 w-32 animate-pulse rounded bg-muted" />
                              <div className="h-3 w-24 animate-pulse rounded bg-muted/60" />
                            </div>
                          </div>
                        </div>
                        <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                        <div className="h-3 w-32 animate-pulse rounded bg-muted/60" />
                        <div className="h-3 w-16 animate-pulse rounded bg-muted/60" />
                        <div className="flex items-center space-x-2">
                          <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                          <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
                  <div key={sponsor.id} className={cn("p-6 transition-colors", selectedSponsorIds.has(sponsor.id) && "bg-accent/50")}>
                    <div className="grid grid-cols-6 items-center gap-4">
                      <div className="col-span-2">
                        <div className="flex items-center space-x-4 pl-[3px]">
                          <Checkbox
                            checked={selectedSponsorIds.has(sponsor.id)}
                            onCheckedChange={() => toggleSelectSponsor(sponsor.id)}
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
                        <Badge className={cn(sponsor.is_active ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground")}>
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
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(sponsor)} title="Edit sponsor">
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

      <AlertDialog open={Boolean(deleteSponsor)} onOpenChange={(open) => !open && setDeleteSponsor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sponsor</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the sponsor from the library. Existing post embeds for this sponsor will render nothing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                handleConfirmDelete()
              }}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={massDeleteConfirmOpen} onOpenChange={setMassDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedSponsorIds.size} Sponsor{selectedSponsorIds.size === 1 ? "" : "s"}</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected sponsors from the library. Existing post embeds for these sponsors will render nothing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={massDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={massDeleting}
              onClick={(event) => {
                event.preventDefault()
                handleConfirmMassDelete()
              }}
            >
              {massDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
