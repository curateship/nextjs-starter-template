"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import { Eye, Settings, Trash2, Globe, ArrowUp, ArrowDown, ChevronsUpDown, Plus, List, CircleCheck, CircleX, FileEdit, Ban } from "lucide-react"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { cn } from "@/lib/utils/tailwind"
import { getAllSitesAction, deleteSiteAction, type SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"

type FilterStatus = 'all' | 'active' | 'inactive' | 'draft' | 'suspended'

export default function SitesPage() {
  const { refreshSites } = useSiteSwitcher()
  const [sites, setSites] = useState<SiteWithTheme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
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
        console.error('Error loading sites:', error)
        setError(error)
        return
      }
      
      if (data) {
        setSites(data)
      }
    } catch (err) {
      console.error('Error loading sites:', err)
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
        console.error('Error deleting site:', error)
        setError(`Failed to delete site: ${error}`)
        return
      }

      if (success) {
        setSites(prev => prev.filter(site => site.id !== siteId))
        await refreshSites()
      }
    } catch (err) {
      console.error('Error deleting site:', err)
      setError('Failed to delete site')
    } finally {
      setDeleting(null)
      setDeleteConfirm(null)
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-red-100 text-red-800'
      case 'draft': return 'bg-yellow-100 text-yellow-800'
      case 'suspended': return 'bg-gray-100 text-gray-800'
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
    <StickyHeader />
    <AdminLayout>
      <div className="w-full">
        <DashboardSubheader
          items={[{ label: "Sites" }]}
          tabs={{
            value: filter,
            onValueChange: (value) => setFilter(value as FilterStatus),
            items: [
              { value: "all", label: "All", icon: List },
              { value: "active", label: "Active", icon: CircleCheck },
              { value: "inactive", label: "Inactive", icon: CircleX },
              { value: "draft", label: "Draft", icon: FileEdit },
              { value: "suspended", label: "Suspended", icon: Ban },
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
          
          <div className="divide-y divide-muted/80">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading sites...</p>
              </div>
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
    </AdminLayout>
    </>
  )
}