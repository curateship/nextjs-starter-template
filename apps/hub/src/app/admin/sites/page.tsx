"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AdminConfirmDialog,
  AdminListSkeleton,
  AdminSortButton,
  AdminTableShell,
  AdminTableSummaryFooter,
  formatRelativeDate as formatDate,
  useAdminSort
} from "@/components/admin/layout/list"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"

import {
  Eye,
  Settings,
  Trash2,
  Globe,
  Plus,
  Copy
} from "lucide-react"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
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
  getAllSitesAction,
  deleteSiteAction,
  cloneSiteAction,
  type SiteWithTheme
} from "@/lib/actions/sites/site-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

type FilterStatus = "all" | "active" | "inactive" | "draft"
type SiteSortColumn = "name" | "created" | "status"

export default function SitesPage() {
  const { refreshSites } = useSiteSwitcher()
  const [sites, setSites] = useState<SiteWithTheme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterStatus>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string
    name: string
  } | null>(null)
  // Duplicate flow keeps its own state so cloning cannot interfere with delete/edit actions.
  const [duplicateConfirm, setDuplicateConfirm] = useState<{
    id: string
    name: string
  } | null>(null)
  const [duplicateName, setDuplicateName] = useState("")
  const [duplicateSettings, setDuplicateSettings] = useState(true)
  const [duplicatePages, setDuplicatePages] = useState(true)
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const siteSort = useAdminSort<SiteSortColumn>()

  useEffect(() => {
    loadSites()
  }, [])

  const loadSites = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await getAllSitesAction()

      if (error) {
        setError(error)
        return
      }

      if (data) {
        setSites(data)
      }
    } catch (err) {
      setError("Failed to load sites")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (siteId: string) => {
    try {
      setDeleting(siteId)
      const { success, error } = await deleteSiteAction(siteId)

      if (error) {
        setError(`Failed to delete site: ${error}`)
        return
      }

      if (success) {
        setSites((prev) => prev.filter((site) => site.id !== siteId))
        await refreshSites()
      }
    } catch (err) {
      setError("Failed to delete site")
    } finally {
      setDeleting(null)
      setDeleteConfirm(null)
    }
  }

  // Start each duplicate from the original name and default to copying the safe site surface.
  const openDuplicateDialog = (site: SiteWithTheme) => {
    setDuplicateConfirm({ id: site.id, name: site.name })
    setDuplicateName(`${site.name} Copy`)
    setDuplicateSettings(true)
    setDuplicatePages(true)
    setDuplicateError(null)
  }

  // Keep the modal locked while the server action is creating the clone.
  const closeDuplicateDialog = () => {
    if (duplicating) return
    setDuplicateConfirm(null)
    setDuplicateName("")
    setDuplicateError(null)
  }

  const handleDuplicate = async () => {
    if (!duplicateConfirm) return

    const name = duplicateName.trim()
    if (!name) {
      setDuplicateError("Site name is required")
      return
    }

    try {
      setDuplicating(true)
      setDuplicateError(null)

      // The server action owns the transaction and decides exactly what can be copied.
      const { data, error } = await cloneSiteAction(duplicateConfirm.id, {
        name,
        clone_settings: duplicateSettings,
        clone_pages: duplicatePages
      })

      if (error || !data) {
        setDuplicateError(error || "Failed to duplicate site")
        return
      }

      await loadSites()
      await refreshSites()
      setDuplicateConfirm(null)
      setDuplicateName("")
    } catch {
      setDuplicateError("Failed to duplicate site")
    } finally {
      setDuplicating(false)
    }
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredSites = sites.filter((site) => {
    const statusMatch = filter === "all" || site.status === filter
    const searchText = `${site.name} ${site.subdomain} ${site.status}`.toLowerCase()
    const searchMatch = !normalizedSearchQuery || searchText.includes(normalizedSearchQuery)

    return statusMatch && searchMatch
  })

  const sortedSites = [...filteredSites].sort((a, b) => {
    if (!siteSort.sortColumn) return 0
    const dir = siteSort.sortDirection === "asc" ? 1 : -1
    if (siteSort.sortColumn === "name") return a.name.localeCompare(b.name) * dir
    if (siteSort.sortColumn === "created") return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    if (siteSort.sortColumn === "status") return a.status.localeCompare(b.status) * dir
    return 0
  })

  const siteCounts = {
    all: sites.length,
    active: sites.filter((site) => site.status === "active").length,
    inactive: sites.filter((site) => site.status === "inactive").length,
    draft: sites.filter((site) => site.status === "draft").length
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case "inactive":
        return <Badge variant="destructive">Inactive</Badge>
      case "draft":
        return <Badge className="bg-yellow-100 text-yellow-800">Draft</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Sites" }]}
          />

          <AdminTableShell
            title="Sites"
            icon={<Globe className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={filteredSites.length}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search sites"
                />
                <Select value={filter} onValueChange={(value) => setFilter(value as FilterStatus)}>
                  <TableRightActionsSelectTrigger aria-label="Site status filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({siteCounts.all})</SelectItem>
                    <SelectItem value="active">Active ({siteCounts.active})</SelectItem>
                    <SelectItem value="inactive">Inactive ({siteCounts.inactive})</SelectItem>
                    <SelectItem value="draft">Draft ({siteCounts.draft})</SelectItem>
                  </SelectContent>
                </Select>
                <TableRightActionsButton asChild>
                  <Link href="/admin/sites/new">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Create Site</span>
                  </Link>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={!loading ? <AdminTableSummaryFooter count={filteredSites.length} label="sites" /> : null}
          >

            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="main">
                      <AdminSortButton
                        active={siteSort.sortColumn === "name"}
                        direction={siteSort.sortDirection}
                        onClick={() => siteSort.toggleSort("name")}
                      >
                        Site
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">User</TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={siteSort.sortColumn === "created"}
                        direction={siteSort.sortDirection}
                        onClick={() => siteSort.toggleSort("created")}
                      >
                        Created
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">
                      <AdminSortButton
                        active={siteSort.sortColumn === "status"}
                        direction={siteSort.sortDirection}
                        onClick={() => siteSort.toggleSort("status")}
                      >
                        Status
                      </AdminSortButton>
                    </TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton columns={5} showCheckbox={false} />
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <p className="mb-4 text-red-600">{error}</p>
                        <Button onClick={loadSites} variant="outline" size="sm">
                          Try Again
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : filteredSites.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <Globe className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="mb-4 text-muted-foreground">
                          {filter === "all" ? "No sites found" : `No ${filter} sites found`}
                        </p>
                        <Button asChild variant="outline">
                          <Link href="/admin/sites/new">Create Your First Site</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedSites.map((site) => (
                      <TableRow key={site.id} className="group">
                        <TableCell column="main">
                          <Link
                            href={`/admin/sites/${site.id}/settings`}
                            className="flex min-w-0 items-center space-x-4 transition-opacity hover:opacity-80"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                              {site.settings?.favicon ? (
                                <img
                                  src={site.settings.favicon}
                                  alt={`${site.name} favicon`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Globe className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-medium hover:underline sm:text-base">
                                {site.subdomain}.domain.com
                              </h4>
                              <p className="truncate text-xs text-muted-foreground sm:text-sm">{site.name}</p>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center space-x-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                              <span className="text-xs font-medium text-blue-600">Y</span>
                            </div>
                            <span className="text-sm">You</span>
                          </div>
                        </TableCell>
                        <TableCell column="mutedMeta">{formatDate(site.created_at)}</TableCell>
                        <TableCell column="meta">{getStatusBadge(site.status)}</TableCell>
                        <TableCell column="meta">
                          <div className="flex items-center space-x-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                              <a href={getSiteUrl(site)} target="_blank" rel="noopener noreferrer" title="Preview Site">
                                <Eye className="h-4 w-4" />
                                <span className="sr-only">Preview Site</span>
                              </a>
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                              <Link href={`/admin/sites/${site.id}/settings`} title="Site Settings">
                                <Settings className="h-4 w-4" />
                                <span className="sr-only">Site Settings</span>
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openDuplicateDialog(site)}
                              disabled={duplicating}
                              title="Duplicate Site"
                            >
                              <Copy className="h-4 w-4" />
                              <span className="sr-only">Duplicate Site</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              onClick={() => setDeleteConfirm({ id: site.id, name: site.name })}
                              disabled={deleting === site.id}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete</span>
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

        <AdminConfirmDialog
          open={Boolean(deleteConfirm)}
          title="Delete Site"
          description={
            <>
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This will permanently remove the
              site and all its pages. This action cannot be undone.
            </>
          }
          disabled={!!deleting}
          confirmLabel={deleting ? "Deleting..." : "Delete"}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
        />

        {/* Site clones are draft-only and intentionally exclude business/runtime data. */}
        {duplicateConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={closeDuplicateDialog} />
            <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
              <h2 className="text-lg font-semibold mb-2">Duplicate Site</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Create a draft copy of <strong>{duplicateConfirm.name}</strong>. Contacts, orders, events, newsletter
                activity, domains, and integrations are not copied.
              </p>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="duplicate-site-name">New site name</Label>
                  <Input
                    id="duplicate-site-name"
                    value={duplicateName}
                    onChange={(event) => setDuplicateName(event.target.value)}
                    disabled={duplicating}
                  />
                </div>

                <div className="space-y-3">
                  <Label>Copy</Label>
                  <div className="flex items-start gap-3 rounded-md border p-3 text-sm">
                    <Checkbox
                      id="duplicate-site-settings"
                      checked={duplicateSettings}
                      onCheckedChange={(checked) => setDuplicateSettings(checked === true)}
                      disabled={duplicating}
                    />
                    <span>
                      <Label htmlFor="duplicate-site-settings" className="block font-medium">
                        Site settings
                      </Label>
                      <span className="block text-muted-foreground">
                        Branding, layout, typography, and public site settings.
                      </span>
                    </span>
                  </div>
                  <div className="flex items-start gap-3 rounded-md border p-3 text-sm">
                    <Checkbox
                      id="duplicate-site-pages"
                      checked={duplicatePages}
                      onCheckedChange={(checked) => setDuplicatePages(checked === true)}
                      disabled={duplicating}
                    />
                    <span>
                      <Label htmlFor="duplicate-site-pages" className="block font-medium">
                        Pages
                      </Label>
                      <span className="block text-muted-foreground">
                        Page titles, slugs, metadata, order, and content blocks.
                      </span>
                    </span>
                  </div>
                </div>

                {duplicateError && <p className="text-sm text-red-600">{duplicateError}</p>}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button onClick={closeDuplicateDialog} variant="outline" disabled={duplicating}>
                  Cancel
                </Button>
                <Button onClick={handleDuplicate} disabled={duplicating}>
                  {duplicating ? "Duplicating..." : "Duplicate Site"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </AdminLayout>
    </>
  )
}
