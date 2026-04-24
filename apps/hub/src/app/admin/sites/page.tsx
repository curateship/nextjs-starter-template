"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"

import { Eye, Settings, Trash2, Globe, ArrowUp, ArrowDown, ChevronsUpDown, Plus, List, CircleCheck, CircleX, FileEdit, Copy } from "lucide-react"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { getSitesAdminTopNavLinks } from "@/components/admin/layout/stickybar/StickybarTopLeftNav"
import { cn } from "@/lib/utils/tailwind"
import { getAllSitesAction, deleteSiteAction, cloneSiteAction, type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

type FilterStatus = 'all' | 'active' | 'inactive' | 'draft'

function SitesTableSkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="p-6" aria-hidden="true">
          <div className="grid grid-cols-6 gap-4 items-center">
            <div className="col-span-2 flex items-center space-x-4">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <div className="flex items-center space-x-1">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </div>
      ))}
    </>
  )
}

export default function SitesPage() {
  const { refreshSites } = useSiteSwitcher()
  const [sites, setSites] = useState<SiteWithTheme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  // Duplicate flow keeps its own state so cloning cannot interfere with delete/edit actions.
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ id: string; name: string } | null>(null)
  const [duplicateName, setDuplicateName] = useState("")
  const [duplicateSettings, setDuplicateSettings] = useState(true)
  const [duplicatePages, setDuplicatePages] = useState(true)
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<'name' | 'created' | 'status' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

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
      setError('Failed to load sites')
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
        setSites(prev => prev.filter(site => site.id !== siteId))
        await refreshSites()
      }
    } catch (err) {
      setError('Failed to delete site')
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
        clone_pages: duplicatePages,
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
      setDuplicateError('Failed to duplicate site')
    } finally {
      setDuplicating(false)
    }
  }


  const filteredSites = sites.filter(site => {
    if (filter === 'all') return true
    return site.status === filter
  })

  const toggleSort = (column: 'name' | 'created' | 'status') => {
    if (sortColumn === column) {
      if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection('asc')
      } else {
        setSortDirection('desc')
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: 'name' | 'created' | 'status') => {
    if (sortColumn !== column) return <ChevronsUpDown className="h-3 w-3 opacity-70" />
    if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3" />
    return <ArrowDown className="h-3 w-3" />
  }

  const sortedSites = [...filteredSites].sort((a, b) => {
    if (!sortColumn) return 0
    const dir = sortDirection === 'asc' ? 1 : -1
    if (sortColumn === 'name') return a.name.localeCompare(b.name) * dir
    if (sortColumn === 'created') return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    if (sortColumn === 'status') return a.status.localeCompare(b.status) * dir
    return 0
  })

  const siteCounts = {
    all: sites.length,
    active: sites.filter(site => site.status === 'active').length,
    inactive: sites.filter(site => site.status === 'inactive').length,
    draft: sites.filter(site => site.status === 'draft').length,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-red-100 text-red-800'
      case 'draft': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
    return `${Math.ceil(diffDays / 30)} months ago`
  }
  
  return (
    <>
      <StickyHeader navLinks={getSitesAdminTopNavLinks("sites")} />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Sites" }]}
            tabs={{
              value: filter,
              onValueChange: (value) => setFilter(value as FilterStatus),
              items: [
                { value: "all", label: "All", icon: List, count: siteCounts.all },
                { value: "active", label: "Active", icon: CircleCheck, count: siteCounts.active },
                { value: "inactive", label: "Inactive", icon: CircleX, count: siteCounts.inactive },
                { value: "draft", label: "Draft", icon: FileEdit, count: siteCounts.draft },
              ],
            }}
            actions={
              <Button asChild><Link href="/admin/sites/new"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Create Site</span></Link></Button>
            }
          />

          <Card className="shadow-sm">
          
          {/* Table Header */}
          <div className="px-6 py-4 border-b bg-muted/30">
            <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
              <div className="col-span-2">
                <button
                  type="button"
                  onClick={() => toggleSort('name')}
                  className={cn(
                    "flex items-center gap-1.5",
                    "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                    "cursor-pointer outline-none transition-colors"
                  )}
                >
                  <span>Site</span>
                  <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('name')}</span>
                </button>
              </div>
              <div className="text-[0.8125rem]">User</div>
              <button
                type="button"
                onClick={() => toggleSort('created')}
                className={cn(
                  "flex items-center gap-1.5",
                  "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                  "cursor-pointer outline-none transition-colors"
                )}
              >
                <span>Created</span>
                <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('created')}</span>
              </button>
              <button
                type="button"
                onClick={() => toggleSort('status')}
                className={cn(
                  "flex items-center gap-1.5",
                  "text-[0.8125rem] text-muted-foreground hover:text-foreground",
                  "cursor-pointer outline-none transition-colors"
                )}
              >
                <span>Status</span>
                <span className="ml-2 flex h-3.5 w-3.5 items-center justify-center">{getSortIcon('status')}</span>
              </button>
              <div>Actions</div>
            </div>
          </div>
          
          <div className="divide-y divide-muted/80" aria-busy={loading}>
            {loading ? (
              <SitesTableSkeletonRows />
            ) : error ? (
              <div className="p-8 text-center">
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={loadSites} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            ) : filteredSites.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-muted-foreground mb-4">
                  {filter === 'all' ? 'No sites found' : `No ${filter} sites found`}
                </p>
                <Button asChild variant="outline">
                  <Link href="/admin/sites/new">Create Your First Site</Link>
                </Button>
              </div>
            ) : (
              sortedSites.map((site) => {
                const initials = site.name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2)
                
                return (
                  <div key={site.id} className="p-6">
                    <div className="grid grid-cols-6 gap-4 items-center">
                      <div className="col-span-2">
                        <Link 
                          href={`/admin/sites/${site.id}/settings`}
                          className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden">
                            {site.settings?.favicon ? (
                              <img 
                                src={site.settings.favicon} 
                                alt={`${site.name} favicon`}
                                className="w-12 h-12 object-cover rounded-lg"
                              />
                            ) : (
                              <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                                <Globe className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium hover:underline">{site.subdomain}.domain.com</h4>
                            <p className="text-sm text-muted-foreground">
                              {site.name}
                            </p>
                          </div>
                        </Link>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 text-xs font-medium">Y</span>
                        </div>
                        <span className="text-sm">You</span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(site.created_at)}
                        </span>
                      </div>
                      <div>
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(site.status)}`}>
                          {site.status.charAt(0).toUpperCase() + site.status.slice(1)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          asChild
                        >
                          <a href={getSiteUrl(site)} target="_blank" rel="noopener noreferrer" title="Preview Site">
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">Preview Site</span>
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          asChild
                        >
                          <Link href={`/admin/sites/${site.id}/settings`} title="Site Settings">
                            <Settings className="h-4 w-4" />
                            <span className="sr-only">Site Settings</span>
                          </Link>
                        </Button>
                        {/* Duplicate opens a settings modal instead of immediately cloning. */}
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
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-600"
                          onClick={() => setDeleteConfirm({ id: site.id, name: site.name })}
                          disabled={deleting === site.id}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Card>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => !deleting && setDeleteConfirm(null)}
          />
          <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
            <h2 className="text-lg font-semibold mb-2">Delete Site</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This will permanently remove the site and all its pages. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setDeleteConfirm(null)}
                variant="outline"
                disabled={!!deleting}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleDelete(deleteConfirm.id)}
                variant="destructive"
                disabled={!!deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Site clones are draft-only and intentionally exclude business/runtime data. */}
      {duplicateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={closeDuplicateDialog}
          />
          <div className="relative bg-background rounded-lg border shadow-lg p-6 w-full max-w-lg z-50">
            <h2 className="text-lg font-semibold mb-2">Duplicate Site</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Create a draft copy of <strong>{duplicateConfirm.name}</strong>. Contacts, orders, events, newsletter activity, domains, and integrations are not copied.
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
                    <Label htmlFor="duplicate-site-settings" className="block font-medium">Site settings</Label>
                    <span className="block text-muted-foreground">Branding, layout, typography, and public site settings.</span>
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
                    <Label htmlFor="duplicate-site-pages" className="block font-medium">Pages</Label>
                    <span className="block text-muted-foreground">Page titles, slugs, metadata, order, and content blocks.</span>
                  </span>
                </div>
              </div>

              {duplicateError && (
                <p className="text-sm text-red-600">{duplicateError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                onClick={closeDuplicateDialog}
                variant="outline"
                disabled={duplicating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDuplicate}
                disabled={duplicating}
              >
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
