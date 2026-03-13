"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Eye, Settings, Trash2, Edit, MoreHorizontal, Globe } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getAllSitesAction, deleteSiteAction } from "@/lib/actions/sites/site-actions"
import type { SiteWithTheme } from "@/lib/actions/sites/site-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"

type FilterStatus = 'all' | 'active' | 'inactive' | 'draft' | 'suspended'

export default function SitesPage() {

  const [sites, setSites] = useState<SiteWithTheme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [deleting, setDeleting] = useState<string | null>(null)

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
    if (!confirm('Are you sure you want to delete this site? This action cannot be undone.')) {
      return
    }

    try {
      setDeleting(siteId)
      const { success, error } = await deleteSiteAction(siteId)
      
      if (error) {
        console.error('Error deleting site:', error)
        alert(`Failed to delete site: ${error}`)
        return
      }
      
      if (success) {
        // Remove from local state
        setSites(prev => prev.filter(site => site.id !== siteId))
      }
    } catch (err) {
      console.error('Error deleting site:', err)
      alert('Failed to delete site')
    } finally {
      setDeleting(null)
    }
  }


  const filteredSites = sites.filter(site => {
    if (filter === 'all') return true
    return site.status === filter
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
    <AdminLayout>
      <div className="w-full">
        <AdminPageHeader
          title="Sites"
          primaryAction={{
            label: "Create Site",
            href: "/admin/sites/new"
          }}
          extraContent={
            <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterStatus)}>
              <TabsList className="gap-1">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="inactive">Inactive</TabsTrigger>
                <TabsTrigger value="draft">Draft</TabsTrigger>
                <TabsTrigger value="suspended">Suspended</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        />

        <Card className="shadow-sm">
          
          {/* Table Header */}
          <div className="px-6 py-4 border-b bg-muted/30">
            <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
              <div className="col-span-2">Site</div>
              <div>User</div>
              <div>Created</div>
              <div>Status</div>
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
              filteredSites.map((site) => {
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
                      <div className="flex items-center space-x-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/pages/${site.id}`} className="flex items-center">
                                <Edit className="mr-2 h-4 w-4" />
                                Edit in Builder
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a 
                                href={getSiteUrl(site)} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center"
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Preview Site
                              </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/sites/${site.id}/settings`} className="flex items-center">
                                <Settings className="mr-2 h-4 w-4" />
                                Site Settings
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDelete(site.id)}
                              disabled={deleting === site.id}
                              className="flex items-center text-red-600 focus:text-red-600"
                            >
                              {deleting === site.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-2"></div>
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Site
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Card>
      </div>
    </AdminLayout>
  )
}